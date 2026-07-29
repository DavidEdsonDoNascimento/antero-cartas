import type { PaymentProvider } from "./PaymentProvider";
import { createMockPaymentProvider } from "./mock";
import { createMercadoPagoProvider } from "./mercadopago";

export function getPaymentMode(): "mock" | "real" {
  return (process.env.PAYMENT_MODE ?? "mock") === "real" ? "real" : "mock";
}

/**
 * Confirmação mock só é permitida quando o modo é mock E a flag está ligada.
 * Em produção, exige ALLOW_MOCK_PAYMENT_CONFIRMATION=true explicitamente.
 * Fail-closed por construção: `PAYMENT_MODE=real` já basta para desligar a
 * confirmação mock, sem precisar lembrar de remover a flag em produção real.
 */
export function isMockConfirmationAllowed(): boolean {
  if (getPaymentMode() !== "mock") return false;
  return (process.env.ALLOW_MOCK_PAYMENT_CONFIRMATION ?? "false") === "true";
}

export function getPaymentProvider(): PaymentProvider {
  return getPaymentMode() === "real" ? createMercadoPagoProvider() : createMockPaymentProvider();
}

export type {
  PaymentProvider,
  PaymentStatus,
  InternalOrderStatus,
  CreatePaymentInput,
  CreatePaymentResult,
  PayerInfo,
  CardPaymentInput,
  PixPaymentData,
} from "./PaymentProvider";
