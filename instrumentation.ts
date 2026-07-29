import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions, SERVER_DSN } from "@/lib/sentryOptions";

/**
 * Inicialização do Sentry no servidor e no runtime edge (task 011, seção 9.1).
 *
 * Sem DSN nada é inicializado: `captureRequestError` vira no-op e a aplicação
 * segue normalmente. É o que permite rodar local, em CI e em produção antes
 * de existir a conta, sem `try/catch` espalhado.
 */
export function register(): void {
  if (!SERVER_DSN) return;

  // Um único `init` cobre os dois runtimes; o SDK escolhe o transporte certo
  // a partir de NEXT_RUNTIME.
  Sentry.init({
    dsn: SERVER_DSN,
    ...baseSentryOptions,
  });
}

/**
 * Erros não tratados de rota de API, Server Component e renderização — cobre
 * de uma vez falha de persistência, erro de banco, exceção de API, falha de
 * publicação e falha da carta pública. A sanitização é a mesma do `beforeSend`
 * porque passa pelo mesmo pipeline do SDK.
 */
export const onRequestError = SERVER_DSN ? Sentry.captureRequestError : undefined;
