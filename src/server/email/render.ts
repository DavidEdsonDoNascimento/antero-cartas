/**
 * Template do e-mail de carta publicada (task 013, seção 12) — módulo puro,
 * reusado pelo provedor mock (só monta, não envia) e pelo real (monta e
 * envia). Um único lugar decide o que entra e o que nunca entra:
 *
 * Inclui: nome do comprador, confirmação da compra, link público, QR Code,
 * plano escolhido, prazo de disponibilidade, canal de suporte, aviso para
 * guardar o link.
 *
 * Nunca inclui: token de edição, CPF, dados completos de pagamento,
 * conteúdo integral da carta (só o título), service role, segredos.
 */
import { site } from "@/config/site";
import type { CartPublishedEmailInput, RenderedEmail } from "./EmailProvider";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderCartPublishedEmail(input: CartPublishedEmailInput): RenderedEmail {
  const durationLine = input.expiresAt
    ? `Sua cartinha ficará disponível até ${new Date(input.expiresAt).toLocaleDateString("pt-BR")}.`
    : "Sua cartinha não tem data para expirar.";

  const subject = `Sua cartinha está pronta 💌 — ${site.name}`;
  const supportUrl = `https://wa.me/${site.whatsappSupport}`;

  const text = [
    `Olá, ${input.customerName}!`,
    ``,
    `Recebemos sua compra do plano ${input.planLabel} e sua cartinha "${input.cartTitle}" foi publicada com sucesso.`,
    ``,
    `Abra ou compartilhe pelo link: ${input.publicUrl}`,
    durationLine,
    ``,
    `Importante: guarde este link — ele é o único jeito de acessar sua cartinha.`,
    ``,
    `Dúvidas ou precisa de ajuda? Fale com a gente: ${supportUrl}`,
    `— Equipe ${site.name}`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#211d1e">
      <h1 style="color:#681d35">Sua cartinha está pronta 💌</h1>
      <p>Olá, ${escapeHtml(input.customerName)}!</p>
      <p>Recebemos sua compra do plano <strong>${escapeHtml(input.planLabel)}</strong> e sua
      cartinha <strong>${escapeHtml(input.cartTitle)}</strong> foi publicada com sucesso.</p>
      ${input.qrCodeDataUrl ? `<p><img src="${input.qrCodeDataUrl}" alt="QR Code da cartinha" width="180" height="180" /></p>` : ""}
      <p>
        <a href="${input.publicUrl}" style="background:#681d35;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Abrir cartinha</a>
      </p>
      <p style="color:#555">${escapeHtml(durationLine)}</p>
      <p style="color:#a33;font-weight:bold">Guarde este link — ele é o único jeito de acessar sua cartinha.</p>
      <p style="color:#888;font-size:12px">Dúvidas ou precisa de ajuda? <a href="${supportUrl}">Fale com a gente pelo WhatsApp</a>.</p>
      <p style="color:#888;font-size:12px">— Equipe ${site.name}</p>
    </div>`.trim();

  return { subject, html, text };
}
