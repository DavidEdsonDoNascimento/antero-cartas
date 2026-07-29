/**
 * Validação controlada do Sentry (Fase 2.5) — envia UM evento identificado,
 * usando a mesma configuração/sanitização/resolução de ambiente de
 * `src/lib/sentryOptions.ts` (a mesma que a aplicação usa em produção).
 *
 * Não é uma rota pública nem um botão de teste: script local, executado
 * manualmente por você. Não use `vercel env pull` para obter o DSN — copie o
 * valor diretamente do painel da Vercel (Project -> Settings -> Environment
 * Variables -> Production -> revelar) e cole só no comando abaixo, na sua
 * própria sessão de terminal. O DSN nunca deve passar pela sessão do Claude.
 *
 * Aborta se `APP_ENV` não resolver para "production" — evita repetir o
 * incidente da primeira validação, que saiu com environment=local por falta
 * dessa variável.
 *
 * Uso (bash):
 *   SENTRY_DSN="<cole aqui o DSN copiado do painel>" \
 *   APP_ENV=production VALIDATION_COMMIT=<hash do commit em produção> \
 *   npx tsx scripts/sentryValidationEvent.ts
 *
 * Uso (PowerShell):
 *   $env:SENTRY_DSN = "<cole aqui o DSN copiado do painel>"
 *   $env:APP_ENV = "production"
 *   $env:VALIDATION_COMMIT = "<hash do commit em produção>"
 *   npx tsx scripts/sentryValidationEvent.ts
 *
 * Depois de rodar, limpe a variável da sessão (`unset SENTRY_DSN` /
 * `Remove-Item Env:\SENTRY_DSN`) — nunca a deixe em `.env*`, histórico de
 * shell salvo em arquivo, ou qualquer documentação.
 *
 * Nota: rodando localmente, `server_name` sempre mostra o hostname da sua
 * máquina — isso é esperado e não indica erro. Este script prova que o DSN,
 * o projeto e a sanitização funcionam ponta a ponta; não prova sozinho que o
 * runtime serverless da Vercel captura erros (isso só um erro real em
 * produção comprova — não force um artificialmente).
 */
import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions, SERVER_DSN, SENTRY_ENVIRONMENT } from "../src/lib/sentryOptions";

async function main(): Promise<void> {
  if (!SERVER_DSN) {
    console.error("no dsn in env, aborting");
    process.exitCode = 1;
    return;
  }

  if (SENTRY_ENVIRONMENT !== "production") {
    console.error(
      `environment resolved to "${SENTRY_ENVIRONMENT}", expected "production" — set APP_ENV=production explicitly before running this script, aborting`,
    );
    process.exitCode = 1;
    return;
  }

  Sentry.init({
    dsn: SERVER_DSN,
    ...baseSentryOptions,
  });

  Sentry.captureMessage("Fase 2.5 — validação controlada do Sentry — production", {
    level: "info",
    tags: {
      commit: process.env.VALIDATION_COMMIT ?? "unknown",
      origin: "phase-2.5-validation",
    },
  });

  const flushed = await Sentry.flush(5000);
  console.log(JSON.stringify({ flushed, environment: SENTRY_ENVIRONMENT }));
}

void main();
