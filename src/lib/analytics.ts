/**
 * Camada simples de eventos, sem prender o projeto a um fornecedor.
 * Na Fase 1 apenas registra no console em dev. Trocar o "sink" no futuro.
 * NUNCA inclua dados pessoais ou o conteúdo da carta nos eventos.
 */

export type AnalyticsEvent =
  | "landing_viewed"
  | "create_started"
  | "recipient_selected"
  | "message_completed"
  | "personalization_completed"
  | "checkout_started"
  | "plan_selected"
  | "payment_created"
  | "payment_confirmed"
  | "cart_published"
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
type SafeProps = Record<string, string | number | boolean | null>;

export function track(event: AnalyticsEvent, props: SafeProps = {}): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[analytics] ${event}`, props);
  }
  // Fase futura: enviar para o provedor escolhido através desta mesma interface.
}
