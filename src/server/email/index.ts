import type { EmailProvider } from "./EmailProvider";
import { createMockEmailProvider } from "./mock";
import { createResendEmailProvider } from "./resend";

export function getEmailMode(): "mock" | "real" {
  return (process.env.EMAIL_MODE ?? "mock") === "real" ? "real" : "mock";
}

export function getEmailProvider(): EmailProvider {
  return getEmailMode() === "real" ? createResendEmailProvider() : createMockEmailProvider();
}

export type { EmailProvider } from "./EmailProvider";
