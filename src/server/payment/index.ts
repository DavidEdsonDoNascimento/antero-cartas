import type { PaymentProvider } from "./PaymentProvider";
import { parsePaymentMode, type PaymentMode } from "@/config/paymentMode";
import { createMockPaymentProvider } from "./mock";
import { createMercadoPagoProvider } from "./mercadopago";

/**
 * Modo declarado pelo servidor. Um valor inválido é erro de configuração e
 * lança: o "fail-safe" anterior (qualquer coisa != "real" virava "mock")
 * transformava um typo em `PAYMENT_MODE` numa loja silenciosamente incapaz
 * de cobrar. Ausente continua sendo "mock".
 */
export function getPaymentMode(): PaymentMode {
  return parsePaymentMode(process.env.PAYMENT_MODE, "PAYMENT_MODE");
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
