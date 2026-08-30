import { describe, it, expect, vi } from "vitest";
import { createResendEmailProvider } from "./resend";

const OPTS = { apiKey: "re_test_key", from: "Antero Cartas <cartas@anterosistemas.com.br>" };
const INPUT = {
  to: "comprador@example.com",
  customerName: "Ana Compradora",
  cartTitle: "Feliz aniversário",
  publicUrl: "https://cartas.anterosistemas.com.br/c/abc123",
  qrCodeDataUrl: null,
  planLabel: "Essencial",
  expiresAt: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return responses[Math.min(i++, responses.length - 1)];
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("createResendEmailProvider — configuração", () => {
  it("exige RESEND_API_KEY", async () => {
    const provider = createResendEmailProvider({ ...OPTS, apiKey: "" });
    await expect(provider.sendCartPublished(INPUT)).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("exige EMAIL_FROM", async () => {
    const provider = createResendEmailProvider({ ...OPTS, from: "" });
    await expect(provider.sendCartPublished(INPUT)).rejects.toThrow(/EMAIL_FROM/);
  });
});

describe("createResendEmailProvider — envio", () => {
  it("envia o e-mail com o remetente, destinatário e conteúdo corretos", async () => {
    const { impl, calls } = stubFetch(jsonResponse(200, { id: "email_123" }));
    const provider = createResendEmailProvider({ ...OPTS, fetchImpl: impl });

    const rendered = await provider.sendCartPublished(INPUT);

    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.from).toBe(OPTS.from);
    expect(body.to).toEqual([INPUT.to]);
    expect(body.subject).toBe(rendered.subject);
    expect(body.html).toBe(rendered.html);
    expect(body.text).toBe(rendered.text);
    expect(calls[0].init.headers).toMatchObject({ Authorization: `Bearer ${OPTS.apiKey}` });
  });

  it("propaga o motivo da recusa do Resend, sem vazar a chave", async () => {
    const { impl } = stubFetch(jsonResponse(422, { message: "Invalid `to` field" }));
    const provider = createResendEmailProvider({ ...OPTS, fetchImpl: impl });

    await expect(provider.sendCartPublished(INPUT)).rejects.toThrow(/Invalid `to` field/);
    await provider.sendCartPublished(INPUT).catch((err: Error) => {
      expect(err.message).not.toContain(OPTS.apiKey);
    });
  });
});

describe("createResendEmailProvider — QR Code por CID (task 013, seção 12)", () => {
  const QR_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const QR_DATA_URL = `data:image/png;base64,${QR_BASE64}`;

  it("envia o QR Code como anexo por content_id, referenciado como cid: no HTML", async () => {
    const { impl, calls } = stubFetch(jsonResponse(200, { id: "email_123" }));
    const provider = createResendEmailProvider({ ...OPTS, fetchImpl: impl });

    await provider.sendCartPublished({ ...INPUT, qrCodeDataUrl: QR_DATA_URL });

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.html).toContain("cid:cartinha-qrcode");
    expect(body.html).not.toContain(QR_BASE64);
    expect(body.attachments).toHaveLength(1);
    const [attachment] = body.attachments;
    expect(attachment.content).toBe(QR_BASE64);
    expect(attachment.filename).toBe("qr-code-cartinha.png");
    expect(attachment.content_id).toBe("cartinha-qrcode");
    expect(body.html).toContain(`cid:${attachment.content_id}`);
  });

  it("sem QR Code: não envia attachments (nunca um anexo vazio), link continua no HTML", async () => {
    const { impl, calls } = stubFetch(jsonResponse(200, { id: "email_123" }));
    const provider = createResendEmailProvider({ ...OPTS, fetchImpl: impl });

    await provider.sendCartPublished({ ...INPUT, qrCodeDataUrl: null });

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.attachments).toBeUndefined();
    expect(body.html).toContain(INPUT.publicUrl);
  });

  it("QR Code malformado: nunca vira attachment nem aparece no HTML enviado ao Resend", async () => {
    const { impl, calls } = stubFetch(jsonResponse(200, { id: "email_123" }));
    const provider = createResendEmailProvider({ ...OPTS, fetchImpl: impl });

    const malformado = "data:image/png;base64,not-valid-base64!!";
    await provider.sendCartPublished({ ...INPUT, qrCodeDataUrl: malformado });

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.attachments).toBeUndefined();
    expect(body.html).not.toContain(malformado);
    expect(body.html).toContain(INPUT.publicUrl);
  });
});
