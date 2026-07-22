/**
 * Contrato de e-mail desacoplado. Fase 2: apenas mock (não envia de verdade).
 * Um provedor transacional real implementará a mesma interface na Fase 3.
 */
export interface CartPublishedEmailInput {
  to: string;
  customerName: string;
  cartTitle: string;
  publicUrl: string;
  qrCodeDataUrl: string | null;
  planLabel: string;
  expiresAt: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  /** Monta (e, num provedor real, envia) o e-mail de carta publicada. */
  sendCartPublished(input: CartPublishedEmailInput): Promise<RenderedEmail>;
}
