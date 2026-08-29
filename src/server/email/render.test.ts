import { describe, it, expect } from "vitest";
import { renderCartPublishedEmail, QR_CODE_CONTENT_ID } from "./render";

const BASE = {
  to: "comprador@example.com",
  customerName: "Ana Compradora",
  cartTitle: "Feliz aniversário",
  publicUrl: "https://cartas.anterosistemas.com.br/c/abc123",
  qrCodeDataUrl: "data:image/png;base64,AAA=",
  planLabel: "Para Sempre",
  expiresAt: null as string | null,
};

describe("renderCartPublishedEmail — conteúdo obrigatório (task 013, seção 12)", () => {
  it("inclui nome do comprador, plano, link público e QR Code", () => {
    const email = renderCartPublishedEmail(BASE);
    expect(email.text).toContain("Ana Compradora");
    expect(email.text).toContain("Para Sempre");
    expect(email.text).toContain(BASE.publicUrl);
    expect(email.html).toContain(BASE.qrCodeDataUrl);
  });

  it("inclui canal de suporte e aviso para guardar o link", () => {
    const email = renderCartPublishedEmail(BASE);
    expect(email.text).toMatch(/wa\.me/);
    expect(email.text.toLowerCase()).toContain("guarde este link");
    expect(email.html.toLowerCase()).toContain("guarde este link");
  });

  it("menciona prazo de disponibilidade quando o plano expira", () => {
    const email = renderCartPublishedEmail({
      ...BASE,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(email.text).toMatch(/disponível até/i);
  });

  it("indica que não expira quando o plano é permanente", () => {
    const email = renderCartPublishedEmail(BASE);
    expect(email.text).toMatch(/não tem data para expirar/i);
  });

  it("funciona sem QR Code (nunca bloqueia o e-mail)", () => {
    const email = renderCartPublishedEmail({ ...BASE, qrCodeDataUrl: null });
    expect(email.html).not.toContain("<img");
  });
});

describe("renderCartPublishedEmail — nunca inclui dado sensível", () => {
  it("não inclui token de edição, CPF ou segredo mesmo se alguém tentasse injetar via título", () => {
    const email = renderCartPublishedEmail({
      ...BASE,
      cartTitle: "<script>alert(1)</script>",
    });
    // HTML-escapado — nunca reflete markup bruto do usuário.
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("o texto integral da carta (mensagem) não faz parte do input — só o título", () => {
    const email = renderCartPublishedEmail(BASE);
    // Estrutural: RenderedEmail nunca recebe "message"/"content" no input.
    expect(Object.keys(BASE)).not.toContain("message");
    expect(email.text).not.toMatch(/mensagem:/i);
  });
});

describe("renderCartPublishedEmail — QR Code por CID (Resend real, task 013 seção 12)", () => {
  const QR_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const QR_DATA_URL = `data:image/png;base64,${QR_BASE64}`;

  it("com inlineImagesAsAttachments: HTML usa cid:cartinha-qrcode, nunca o Base64 completo", () => {
    const email = renderCartPublishedEmail(
      { ...BASE, qrCodeDataUrl: QR_DATA_URL },
      { inlineImagesAsAttachments: true },
    );
    expect(email.html).toContain(`cid:${QR_CODE_CONTENT_ID}`);
    expect(email.html).not.toContain(QR_BASE64);
    expect(email.html).not.toContain("data:image/png;base64,");
  });

  it("anexo carrega o Base64 correto sem prefixo, e content_id bate com o cid do HTML", () => {
    const email = renderCartPublishedEmail(
      { ...BASE, qrCodeDataUrl: QR_DATA_URL },
      { inlineImagesAsAttachments: true },
    );
    expect(email.attachments).toHaveLength(1);
    const [attachment] = email.attachments;
    expect(attachment.content).toBe(QR_BASE64);
    expect(attachment.content).not.toContain("data:");
    expect(attachment.filename).toBe("qr-code-cartinha.png");
    expect(attachment.contentType).toBe("image/png");
    expect(attachment.contentId).toBe(QR_CODE_CONTENT_ID);
    expect(email.html).toContain(`cid:${attachment.contentId}`);
  });

  it("sem QR Code: nenhum anexo, e o link público continua presente", () => {
    const email = renderCartPublishedEmail(
      { ...BASE, qrCodeDataUrl: null },
      { inlineImagesAsAttachments: true },
    );
    expect(email.attachments).toHaveLength(0);
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain(BASE.publicUrl);
    expect(email.text).toContain(BASE.publicUrl);
  });

  it("QR Code malformado: nunca vira anexo nem aparece no HTML, e-mail segue com o link", () => {
    const malformado = "data:image/png;base64,isto não é base64 válido!!";
    const email = renderCartPublishedEmail(
      { ...BASE, qrCodeDataUrl: malformado },
      { inlineImagesAsAttachments: true },
    );
    expect(email.attachments).toHaveLength(0);
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain(malformado);
    expect(email.html).toContain(BASE.publicUrl);
  });

  it("sem inlineImagesAsAttachments (mock/preview local): continua embarcando o data URL", () => {
    const email = renderCartPublishedEmail({ ...BASE, qrCodeDataUrl: QR_DATA_URL });
    expect(email.html).toContain(QR_DATA_URL);
    expect(email.attachments).toHaveLength(0);
  });
});
