/**
 * Contrato de pagamento desacoplado. Fase 2: apenas mock.
 * Um provedor real (Pix/cartão) implementará a mesma interface na Fase 3.
 */
export type PaymentStatus = "pending" | "paid" | "failed" | "expired";

export interface CreatePaymentInput {
  orderId: string;
  amount: number; // centavos
  currency: string;
  method: "PIX" | "CARD" | "MOCK";
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  status: PaymentStatus;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus>;
}
