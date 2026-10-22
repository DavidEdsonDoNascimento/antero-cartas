/**
 * Aplica as migrations versionadas antes de a aplicação começar a atender —
 * caminho da hospedagem em contêiner (Coolify, docs/0011).
 *
 * Não substitui `scripts/vercelProductionMigrate.mjs`: aquele continua sendo o
 * caminho da Vercel (prebuild com VERCEL_ENV=production) e não foi alterado.
 * Este roda no INÍCIO DO CONTÊINER (docker/entrypoint.sh) ou como comando de
 * pré-deploy — nunca no build da imagem, que não deve conhecer o banco.
 *
 * Comportamento:
 *   1. exige DIRECT_URL ou DATABASE_URL (nunca imprime o valor);
 *   2. recusa hosts do Supabase, a menos que ALLOW_MIGRATE_ON_SUPABASE=true —
 *      um contêiner de homologação apontado por engano para o banco de
 *      produção atual não aplica nada lá;
 *   3. espera o PostgreSQL aceitar conexões (até MIGRATE_DB_WAIT_SECONDS,
 *      padrão 60) — o banco pode subir depois do app;
 *   4. roda `prisma migrate deploy`: só aplica o que está em
 *      prisma/migrations, é idempotente e usa lock no banco (réplicas
 *      simultâneas não aplicam em dobro);
 *   5. qualquer falha → código de saída ≠ 0 → o entrypoint não inicia o
 *      servidor e o health check nunca fica verde (o comportamento do
 *      Coolify diante disso — manter ou não a versão anterior — deve ser
 *      verificado na homologação).
 *
 * Uso: `node scripts/migrateDeploy.mjs` (ou `pnpm db:deploy`). O diretório do
 * projeto Prisma (onde está prisma.config.ts) é o pai deste arquivo, ou
 * PRISMA_PROJECT_DIR.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PREFIX = "[migrate]";

/** Hosts gerenciados pelo Supabase (conexão direta e pooler). */
export function isSupabaseHost(hostname) {
  const h = String(hostname ?? "").toLowerCase();
  return h === "supabase.co" || h.endsWith(".supabase.co") || h.endsWith(".supabase.com");
}

/**
 * Decide a URL usada pela migration (a mesma preferência do prisma.config.ts:
 * DIRECT_URL, depois DATABASE_URL) e valida sem expor o valor.
 * Devolve `{ ok: true, url, host }` ou `{ ok: false, reason }`.
 */
export function resolveMigrationTarget(env) {
  const raw = (env.DIRECT_URL?.trim() || env.DATABASE_URL?.trim() || "");
  if (!raw) return { ok: false, reason: "DIRECT_URL/DATABASE_URL ausentes." };

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "URL do banco malformada." };
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    return { ok: false, reason: "URL do banco precisa ser postgresql://." };
  }
  if (isSupabaseHost(parsed.hostname) && env.ALLOW_MIGRATE_ON_SUPABASE !== "true") {
    return {
      ok: false,
      reason:
        "a URL aponta para o Supabase. Este script é da hospedagem em contêiner e não aplica " +
        "migrations no Supabase (a produção atual migra pelo build da Vercel). " +
        "Defina ALLOW_MIGRATE_ON_SUPABASE=true só se isso for intencional.",
    };
  }
  return { ok: true, url: raw, host: parsed.hostname };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDatabase(url, waitSeconds, requireFrom) {
  const { Client } = requireFrom("pg");
  const deadline = Date.now() + waitSeconds * 1000;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch (err) {
      await client.end().catch(() => {});
      if (Date.now() >= deadline) {
        // Só o código/classe do erro — a mensagem do driver pode citar host/usuário.
        throw new Error(`banco indisponível após ${waitSeconds}s (${err?.code ?? err?.name ?? "erro"}).`);
      }
      if (attempt === 1 || attempt % 5 === 0) {
        console.log(`${PREFIX} aguardando o PostgreSQL aceitar conexões...`);
      }
      await sleep(2_000);
    }
  }
}

export async function main(env = process.env) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectDir = path.resolve(env.PRISMA_PROJECT_DIR || path.join(scriptDir, ".."));
  const requireFrom = createRequire(path.join(projectDir, "package.json"));

  const target = resolveMigrationTarget(env);
  if (!target.ok) {
    console.error(`${PREFIX} ${target.reason} Nada foi aplicado.`);
    return 1;
  }

  const waitSeconds = Number(env.MIGRATE_DB_WAIT_SECONDS ?? 60);
  try {
    await waitForDatabase(target.url, Number.isFinite(waitSeconds) ? waitSeconds : 60, requireFrom);
  } catch (err) {
    console.error(`${PREFIX} ${err.message} Nada foi aplicado.`);
    return 1;
  }

  let prismaCli;
  try {
    prismaCli = path.join(path.dirname(requireFrom.resolve("prisma/package.json")), "build", "index.js");
  } catch {
    console.error(`${PREFIX} Prisma CLI não encontrado em ${projectDir}. Nada foi aplicado.`);
    return 1;
  }

  console.log(`${PREFIX} aplicando migrations pendentes (prisma migrate deploy)...`);
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: projectDir,
    stdio: "inherit",
    env: {
      ...env,
      // Exigidas pelo guard do prisma.config.ts (D49) quando APP_ENV=production;
      // valem só para este processo filho.
      ALLOW_PRISMA_CLI_PRODUCTION: "true",
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
    },
  });

  if (result.error) {
    console.error(`${PREFIX} falha ao executar o Prisma CLI: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) {
    console.error(
      `${PREFIX} migrate deploy terminou com código ${result.status}. A aplicação NÃO será iniciada; ` +
        "confira o estado do banco (prisma migrate status) antes de tentar de novo.",
    );
    return result.status ?? 1;
  }
  console.log(`${PREFIX} migrations em dia.`);
  return 0;
}

// Executa só quando chamado diretamente (o teste importa as funções puras).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`${PREFIX} erro inesperado: ${err?.message ?? err}`);
      process.exit(1);
    },
  );
}
