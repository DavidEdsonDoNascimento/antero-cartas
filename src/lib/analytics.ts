/**
 * Camada de eventos do produto, sem prender o projeto a um fornecedor.
 * NUNCA inclua dados pessoais ou o conteúdo da carta nos eventos — o que
 * passar por aqui ainda é filtrado por `sanitizeAnalyticsProps`, mas o filtro
 * é rede de segurança, não licença para mandar qualquer coisa.
 *
 * Destino atual (task 011, seção 9.2): Vercel Web Analytics.
 *
 * Limitação importante do plano gratuito: no Hobby, o Web Analytics coleta
 * **pageviews** (grátis, sem cookie, 50 mil eventos/mês) mas **não** eventos
 * personalizados — estes exigem plano Pro. Como contratar plano pago está
 * fora do escopo, o encaminhamento dos eventos abaixo fica atrás de
 * `NEXT_PUBLIC_ANALYTICS_CUSTOM_EVENTS_ENABLED`, desligado por padrão. O
 * adapter está pronto: basta ligar a variável no dia em que o plano permitir,
 * sem tocar em nenhum dos ~25 pontos de chamada.
 */

import { sanitizeAnalyticsProps, type SafeAnalyticsValue } from "@/lib/analyticsPrivacy";

export type AnalyticsEvent =
  | "landing_viewed"
  | "create_started"
  | "recipient_selected"
  | "message_completed"
  | "personalization_completed"
  | "checkout_started"
  | "plan_selected"
  | "payment_created"
  | "payment_method_selected"
  | "payment_pending"
  | "payment_confirmed"
  | "payment_failed"
  | "letter_published"
  | "cart_opened"
  | "whatsapp_share_clicked"
  | "music_search_started"
  | "music_search_completed"
  | "music_search_failed"
  | "music_selected"
  | "music_removed"
  | "music_preview_played"
  | "draft_created"
  | "draft_resumed"
  | "draft_saved"
  | "photo_uploaded"
  | "photo_removed"
  | "order_created"
  | "mock_payment_confirmed"
  | "qr_code_viewed";

/** Propriedades permitidas: nunca dados pessoais nem conteúdo da carta. */
type SafeProps = Record<string, SafeAnalyticsValue>;

function readBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

/** Desligar analytics não pode quebrar nada: o produto funciona sem ele. */
export const ANALYTICS_ENABLED = readBool(process.env.NEXT_PUBLIC_ANALYTICS_ENABLED, true);

/** Eventos personalizados exigem plano pago — ver comentário do topo. */
export const CUSTOM_EVENTS_ENABLED = readBool(
  process.env.NEXT_PUBLIC_ANALYTICS_CUSTOM_EVENTS_ENABLED,
  false,
);

export function track(event: AnalyticsEvent, props: SafeProps = {}): void {
  const safeProps = sanitizeAnalyticsProps(props);

  if (process.env.NODE_ENV !== "production") {
    console.debug(`[analytics] ${event}`, safeProps);
  }

  if (!ANALYTICS_ENABLED || !CUSTOM_EVENTS_ENABLED) return;
  // `track()` também é chamado de rotas de API (order_created,
  // mock_payment_confirmed); o encaminhamento é só do lado do cliente porque
  // o pacote do servidor exige configuração própria e não traria informação
  // que o pageview já não cubra.
  if (typeof window === "undefined") return;

  void import("@vercel/analytics")
    .then(({ track: sendEvent }) => {
      sendEvent(event, safeProps);
    })
    .catch(() => {
      // Telemetria nunca pode derrubar o fluxo do usuário.
    });
}
