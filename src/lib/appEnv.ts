/**
 * Marcador explícito de ambiente (D49, docs/0004_Decisions.md).
 *
 * Evita depender de comparação frágil de URL/hostname para saber se uma
 * configuração "é produção" — em vez disso, cada ambiente declara
 * explicitamente `APP_ENV`. Só existe para impedir o uso ACIDENTAL de
 * credenciais de produção durante o desenvolvimento local; nunca bloqueia
 * produção legítima.
 */
export type AppEnv = "local" | "production" | "test";

function readAppEnv(): AppEnv {
  const raw = (process.env.APP_ENV ?? "").trim().toLowerCase();
  if (raw === "production" || raw === "test") return raw;
  return "local";
}

export function getAppEnv(): AppEnv {
  return readAppEnv();
}

/**
 * Bloqueia o caso `next dev` (ou qualquer processo com NODE_ENV != production)
 * rodando com APP_ENV=production — sinal de que credenciais de produção
 * foram carregadas num servidor de desenvolvimento por engano. Chamada nos
 * pontos que tocam serviços reais (banco, storage).
 */
export function assertNotAccidentalProduction(context: string): void {
  const isDevServer = process.env.NODE_ENV !== "production";
  if (isDevServer && getAppEnv() === "production") {
    throw new Error(
      `${context}: APP_ENV=production com NODE_ENV != "production". Isso normalmente ` +
        "significa que credenciais de produção foram carregadas num servidor de " +
        "desenvolvimento (next dev) por engano. Use APP_ENV=local no seu .env.local " +
        "(ver .env.example), ou rode com NODE_ENV=production se isso for intencional.",
    );
  }
}

/**
 * Exige confirmação explícita (ALLOW_PRISMA_CLI_PRODUCTION=true) para o
 * Prisma CLI (migrate dev/deploy, db push, studio) operar quando
 * APP_ENV=production — protege contra `prisma migrate dev`/`db push` sem
 * querer no banco remoto. Produção usa `prisma migrate deploy` com as duas
 * variáveis definidas apenas no passo de build/migration.
 */
export function assertPrismaCliAllowed(): void {
  if (getAppEnv() === "production" && process.env.ALLOW_PRISMA_CLI_PRODUCTION !== "true") {
    throw new Error(
      "APP_ENV=production: comandos do Prisma CLI exigem ALLOW_PRISMA_CLI_PRODUCTION=true " +
        "explícito (proteção contra rodar migrate dev/db push/studio sem querer no banco " +
        "de produção). Defina as duas variáveis apenas no passo de build/migration em produção.",
    );
  }
}
