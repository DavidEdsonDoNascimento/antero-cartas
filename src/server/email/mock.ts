import { site } from "@/config/site";
import type {
  CartPublishedEmailInput,
  EmailProvider,
  RenderedEmail,
} from "./EmailProvider";

/**
 * Provedor de e-mail MOCK: monta o conteúdo completo, mas NÃO envia nada.
 * O conteúdo é persistido pelo orderService em EmailDelivery (outbox) e pode
 * ser visualizado em dev por /api/dev/emails. Não registra o corpo em log comum.
 */
export function createMockEmailProvider(): EmailProvider {
  return {
    name: "mock",
    async sendCartPublished(input: CartPublishedEmailInput): Promise<RenderedEmail> {
      const durationLine = input.expiresAt
        ? `Sua cartinha ficará disponível até ${new Date(input.expiresAt).toLocaleDateString("pt-BR")}.`
        : "Sua cartinha não tem data para expirar.";

      const subject = `Sua cartinha está pronta 💌 — ${site.name}`;

      const text = [
        `Olá, ${input.customerName}!`,
        ``,
        `Sua cartinha "${input.cartTitle}" foi publicada com sucesso.`,
        ``,
        `Abra ou compartilhe pelo link: ${input.publicUrl}`,
        durationLine,
        ``,
        `Dica: compartilhe o link por WhatsApp com quem você quer surpreender.`,
        `— Equipe ${site.name}`,
      ].join("\n");

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#211d1e">
          <h1 style="color:#681d35">Sua cartinha está pronta 💌</h1>
          <p>Olá, ${escapeHtml(input.customerName)}!</p>
          <p>Sua cartinha <strong>${escapeHtml(input.cartTitle)}</strong> foi publicada com sucesso.</p>
          ${input.qrCodeDataUrl ? `<p><img src="${input.qrCodeDataUrl}" alt="QR Code da cartinha" width="180" height="180" /></p>` : ""}
          <p>
            <a href="${input.publicUrl}" style="background:#681d35;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Abrir cartinha</a>
          </p>
          <p style="color:#555">${escapeHtml(durationLine)}</p>
          <p style="color:#888;font-size:12px">Compartilhe o link por WhatsApp com quem você quer surpreender.</p>
          <p style="color:#888;font-size:12px">— Equipe ${site.name}</p>
        </div>`.trim();

      return { subject, html, text };
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
