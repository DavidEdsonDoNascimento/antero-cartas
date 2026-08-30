import type { EmailProvider } from "./EmailProvider";
import { createMockEmailProvider } from "./mock";
import { createResendEmailProvider } from "./resend";
import { parseEmailMode, type EmailMode } from "@/config/emailMode";

export function getEmailMode(): EmailMode {
  return parseEmailMode(process.env.EMAIL_MODE);
}

export function getEmailProvider(): EmailProvider {
  return getEmailMode() === "real" ? createResendEmailProvider() : createMockEmailProvider();
}

export type { EmailProvider } from "./EmailProvider";
