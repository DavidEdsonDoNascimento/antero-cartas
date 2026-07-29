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
