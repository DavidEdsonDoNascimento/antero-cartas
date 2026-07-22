import { randomUUID } from "node:crypto";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentStatus,
} from "./PaymentProvider";

/**
 * Provedor de pagamento MOCK (demonstração).
 * Cria um pagamento pendente com id único. A confirmação (sucesso/falha/
 * expiração) é simulada pela rota /api/orders/[id]/mock-confirm, que atualiza
 * o pedido no banco (fonte da verdade). Não realiza nenhuma transação externa.
 */
export function createMockPaymentProvider(): PaymentProvider {
  return {
    name: "mock",
    async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
      void _input;
      return { providerPaymentId: `mock_${randomUUID()}`, status: "pending" };
    },
    async getPaymentStatus(_id: string): Promise<PaymentStatus> {
      void _id;
      // O estado real vive no pedido (banco). O mock não guarda estado próprio.
      return "pending";
    },
  };
}
