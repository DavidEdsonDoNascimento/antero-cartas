import type { CartPublishedEmailInput, EmailProvider, RenderedEmail } from "./EmailProvider";
import { renderCartPublishedEmail } from "./render";

/**
 * Provedor de e-mail MOCK: monta o conteúdo completo (mesmo template do
 * provedor real, ver `render.ts`), mas NÃO envia nada.
 * O conteúdo é persistido pelo orderService em EmailDelivery (outbox) e pode
 * ser visualizado em dev por /api/dev/emails. Não registra o corpo em log comum.
 */
export function createMockEmailProvider(): EmailProvider {
  return {
    name: "mock",
    async sendCartPublished(input: CartPublishedEmailInput): Promise<RenderedEmail> {
      return renderCartPublishedEmail(input);
    },
  };
}
