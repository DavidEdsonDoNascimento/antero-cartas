/**
 * Aplica as migrations versionadas no build de **Production** da Vercel.
 *
 * Existe por causa de uma falha real: o `POST /api/orders` passou a devolver
 * 500 em produção porque o código da Fase 3 foi publicado enquanto o banco
 * ainda estava no schema do `init` — `Order.pixClaimedAt` não existia
 * (Prisma P2022). A aplicação das migrations era um passo manual do runbook,
 * e um passo manual que precisa ser lembrado a cada deploy acaba esquecido.
 * Amarrar a migration ao build elimina a janela entre "código novo no ar" e
 * "schema novo aplicado".
 *
 * Roda como `prebuild`, antes de `prisma generate` e de `next build`.
 *
 * O portão é `VERCEL_ENV`, definido pela própria Vercel:
 *   - `production`  → aplica as migrations pendentes;
 *   - `preview` / `development` → não faz nada;
 *   - ausente (build local, CI) → não faz nada.
 *
 * Nunca imprime o valor de nenhuma variável: a URL do banco carrega a senha,
 * e log de build é lido por muita gente. As checagens só reportam o *nome* da
 * variável que faltou.
 */

import { spawnSync } from "node:child_process";

/** Variáveis sem as quais a migration não deve nem ser tentada. */
const REQUIRED_URLS = ["DATABASE_URL", "DIRECT_URL"];

const PREFIX = "[migrate]";

/** Ausente, vazia ou só espaço — todas contam como não configurada. */
function isBlank(value) {
  return value === undefined || value.trim() === "";
}

function main() {
  const vercelEnv = process.env.VERCEL_ENV;

  // Só Production. Preview e development compartilham o mesmo Build Command,
  // então o portão precisa estar aqui dentro, não na configuração da Vercel.
  if (vercelEnv !== "production") {
    console.log(
      `${PREFIX} VERCEL_ENV=${vercelEnv ?? "(ausente)"} — nenhuma migration aplicada.`,
    );
    return;
  }

  // Fail-closed: um build de Production sem as URLs do banco significa
  // variável de ambiente faltando ou mal configurada. Seguir em frente
  // publicaria de novo código novo contra schema velho — exatamente o erro
  // que este script existe para impedir.
  const missing = REQUIRED_URLS.filter((name) => isBlank(process.env[name]));
  if (missing.length > 0) {
    console.error(
      `${PREFIX} Build de Production sem ${missing.join(" e ")}. ` +
        "Configure as duas em Vercel → Settings → Environment Variables " +
        "(ambiente Production) antes de publicar. Build interrompido.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`${PREFIX} VERCEL_ENV=production — aplicando migrations pendentes...`);

  // `db:migrate:deploy` só aplica o que está versionado em prisma/migrations,
  // é idempotente e nunca gera migration nova. A URL usada é decidida por
  // prisma.config.ts, que já prefere DIRECT_URL (conexão direta) ao pooler.
  // As duas variáveis de confirmação são exigidas pelo guard do D49.
  const result = spawnSync("pnpm", ["db:migrate:deploy"], {
    stdio: "inherit",
    env: {
      ...process.env,
      APP_ENV: "production",
      ALLOW_PRISMA_CLI_PRODUCTION: "true",
    },
  });

  if (result.error) {
    console.error(`${PREFIX} Falha ao executar o Prisma CLI: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }

  if (result.status !== 0) {
    console.error(
      `${PREFIX} migrate deploy terminou com código ${result.status}. ` +
        "O build para aqui e a Vercel mantém a versão anterior no ar; " +
        "confira o estado do banco antes de tentar de novo.",
    );
    process.exitCode = result.status ?? 1;
    return;
  }

  console.log(`${PREFIX} Migrations aplicadas com sucesso.`);
}

main();
