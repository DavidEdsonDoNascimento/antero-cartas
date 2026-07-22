import type { EmailProvider } from "./EmailProvider";
import { createMockEmailProvider } from "./mock";

export function getEmailProvider(): EmailProvider {
  const mode = process.env.EMAIL_MODE ?? "mock";
  if (mode !== "mock") {
    throw new Error("Somente o provedor de e-mail mock está disponível nesta fase.");
  }
  return createMockEmailProvider();
}

export type { EmailProvider } from "./EmailProvider";
