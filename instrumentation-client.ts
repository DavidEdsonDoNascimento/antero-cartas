import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions, CLIENT_DSN } from "@/lib/sentryOptions";

/**
 * Sentry no navegador (task 011, seção 9.1) — cobre falha de criação de
 * rascunho, erro de upload e erro de criação de pedido, que acontecem todos
 * do lado do cliente.
 *
 * Sem DSN, `init` não é chamado: nenhum script extra, nenhuma requisição, e a
 * aplicação funciona igual.
 */
if (CLIENT_DSN) {
  Sentry.init({
    dsn: CLIENT_DSN,
    ...baseSentryOptions,
    /**
     * Replay e captura de sessão ficam fora de propósito: gravariam a tela de
     * criação, ou seja, o texto da carta sendo digitado. Nenhuma máscara
     * daria garantia suficiente para o que este produto trafega.
     */
    integrations: (defaults) =>
      defaults.filter((integration) => !/replay/i.test(integration.name)),
  });
}

/**
 * Necessário para o Sentry medir e associar navegações do App Router.
 * Inofensivo quando o SDK não foi inicializado.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
