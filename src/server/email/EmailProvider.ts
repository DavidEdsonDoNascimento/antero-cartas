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

/**
 * Imagem embarcada por CID — o Resend real não aceita `data:` URL inline no
 * HTML, então o QR Code precisa viajar como anexo referenciado por
 * `content_id` (o mesmo id usado em `cid:` dentro do HTML). `content` é
 * SEMPRE só o Base64 do arquivo, sem o prefixo `data:image/png;base64,`.
 */
export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
  contentId: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  /** Vazio quando não há QR Code (ausente ou malformado) — nunca um anexo vazio. */
  attachments: EmailAttachment[];
}

export interface EmailProvider {
  readonly name: string;
  /** Monta (e, num provedor real, envia) o e-mail de carta publicada. */
  sendCartPublished(input: CartPublishedEmailInput): Promise<RenderedEmail>;
}
