import type { PaymentProvider } from "./PaymentProvider";
import { createMockPaymentProvider } from "./mock";

export function getPaymentMode(): "mock" | "real" {
  return (process.env.PAYMENT_MODE ?? "mock") === "real" ? "real" : "mock";
}

/**
 * Confirmação mock só é permitida quando o modo é mock E a flag está ligada.
 * Em produção, exige ALLOW_MOCK_PAYMENT_CONFIRMATION=true explicitamente.
 */
export function isMockConfirmationAllowed(): boolean {
  if (getPaymentMode() !== "mock") return false;
  return (process.env.ALLOW_MOCK_PAYMENT_CONFIRMATION ?? "false") === "true";
}

export function getPaymentProvider(): PaymentProvider {
  if (getPaymentMode() !== "mock") {
    throw new Error("Somente o provedor mock está disponível nesta fase.");
  }
  return createMockPaymentProvider();
}

export type { PaymentProvider } from "./PaymentProvider";
