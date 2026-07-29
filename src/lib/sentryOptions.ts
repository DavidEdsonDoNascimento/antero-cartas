/**
 * Opções compartilhadas pelas três inicializações do Sentry (cliente,
 * servidor e edge), para que nenhuma delas possa divergir da política de
 * privacidade por esquecimento (task 011, seção 9.1).
 *
 * A integração é opcional por decisão de projeto: sem DSN, `init` não é
 * chamado e a aplicação funciona igual. Isso mantém o desenvolvimento local
 * e os testes livres de rede, e permite publicar antes de existir uma conta.
 */

import { sanitizeEvent, type SanitizableEvent } from "@/lib/sentryPrivacy";

/**
 * O DSN é público por definição (vai no bundle do cliente), então o nome com
 * NEXT_PUBLIC_ é correto e não expõe segredo — ele só permite *escrever*
 * eventos. SENTRY_DSN existe para o servidor poder usar um projeto separado
 * se um dia fizer sentido; na ausência dele, cai no mesmo DSN público.
 */
export const CLIENT_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || "";
export const SERVER_DSN =
  process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || "";

export const SENTRY_ENVIRONMENT = process.env.APP_ENV?.trim() || "local";

/**
 * Amostragem de performance desligada por padrão. O plano gratuito do Sentry
 * tem cota mensal pequena e compartilhada; erro é o que interessa nesta fase,
 * e transação consumiria a cota sem responder nenhuma pergunta que a Fase 2.5
 * tenha feito. Ajustável por variável se um dia for necessário.
 */
function readRate(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0;
  return parsed;
}

export const TRACES_SAMPLE_RATE = readRate(process.env.SENTRY_TRACES_SAMPLE_RATE);

export const baseSentryOptions = {
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: TRACES_SAMPLE_RATE,
  /**
   * Impede o SDK de anexar IP, cookie e cabeçalho de requisição por conta
   * própria. `sanitizeEvent` já removeria, mas desligar na origem evita que
   * o dado chegue a existir em memória do evento.
   */
  sendDefaultPii: false,
  /**
   * Genéricos de propósito: o SDK tipa `beforeSend` com `ErrorEvent` e
   * `beforeSendTransaction` com `TransactionEvent`, e exige de volta o mesmo
   * tipo. Fixar o parâmetro em `SanitizableEvent` faria o retorno perder os
   * campos obrigatórios de cada um e o `init` não compilaria.
   */
  beforeSend: <T extends SanitizableEvent>(event: T): T | null => sanitizeEvent(event),
  beforeSendTransaction: <T extends SanitizableEvent>(event: T): T | null =>
    sanitizeEvent(event),
  /**
   * O breadcrumb de console repetiria mensagens da aplicação que podem citar
   * conteúdo de carta. `scrubText` cobriria o caso comum, mas não capturar é
   * mais barato e mais seguro do que limpar depois.
   */
  beforeBreadcrumb: (crumb: { category?: string } | null) =>
    crumb?.category === "console" ? null : crumb,
} as const;
