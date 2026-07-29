/**
 * Contrato de pagamento desacoplado. Fase 2: apenas mock. Fase 3: também um
 * provedor real (Mercado Pago) implementando a mesma interface — o contrato
 * em si (nomes de método, forma geral) não muda; só os tipos ganharam os
 * campos que Pix/cartão exigem.
 */
export type PaymentStatus = "pending" | "paid" | "failed" | "expired";

/**
 * Estado interno do pedido (mesmo vocabulário de `OrderStatus` no schema).
 * Único lugar de conversão entre a nomenclatura de um fornecedor e o domínio
 * — ver `mercadoPagoStatus.ts` (task 013, seção 10: "não espalhe strings do
 * fornecedor pelo domínio").
 */
export type InternalOrderStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "EXPIRED"
  | "CANCELLED"
  | "CHARGED_BACK";

export interface PayerInfo {
  name: string;
  email: string;
  /** Documento (CPF), quando o provedor exigir para o método escolhido. */
  document?: string;
}

export interface CardPaymentInput {
  /** Token gerado no navegador pelo SDK do provedor — nunca o número do cartão. */
  token: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
}

export interface CreatePaymentInput {
  orderId: string;
  amount: number; // centavos
  currency: string;
  method: "PIX" | "CARD" | "MOCK";
  description?: string;
  payer?: PayerInfo;
  card?: CardPaymentInput;
}

export interface PixPaymentData {
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string | null;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  status: PaymentStatus;
  /** Presente apenas quando `method === "PIX"`. */
  pix?: PixPaymentData;
  /**
   * Motivo da recusa/pendência, já no vocabulário do provedor — só para
   * mensagem ao usuário, nunca persistido como estado do domínio.
   */
  statusDetail?: string;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus>;
}
