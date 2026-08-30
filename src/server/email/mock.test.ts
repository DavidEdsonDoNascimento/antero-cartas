import { describe, it, expect, vi, afterEach } from "vitest";
import { createMockEmailProvider } from "./mock";

const INPUT = {
  to: "comprador@example.com",
  customerName: "Ana Compradora",
  cartTitle: "Feliz aniversário",
  publicUrl: "https://cartas.anterosistemas.com.br/c/abc123",
  qrCodeDataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  planLabel: "Essencial",
  expiresAt: null as string | null,
};

describe("createMockEmailProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("nunca faz chamada de rede (mock não é o Resend com fetch trocado)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const provider = createMockEmailProvider();
    await provider.sendCartPublished(INPUT);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("monta o mesmo conteúdo do provedor real, mas com data URL (pré-visualização) e sem anexo", async () => {
    const provider = createMockEmailProvider();
    const email = await provider.sendCartPublished(INPUT);

    expect(provider.name).toBe("mock");
    expect(email.html).toContain(INPUT.qrCodeDataUrl);
    expect(email.attachments).toHaveLength(0);
  });
});
