import { describe, it, expect, vi } from "vitest";
import { generateQrDataUrl } from "@/server/qrcode";

describe("generateQrDataUrl", () => {
  it("gera uma data URL PNG contendo só a URL pública", async () => {
    const url = "https://cartas.example.com/c/abc123";
    const dataUrl = await generateQrDataUrl(url);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("nunca lança erro — retorna null se a geração falhar", async () => {
    vi.resetModules();
    vi.doMock("qrcode", () => ({
      default: {
        toDataURL: () => {
          throw new Error("boom");
        },
      },
    }));
    const { generateQrDataUrl: generateFailing } = await import("@/server/qrcode");
    const result = await generateFailing("https://example.com");
    expect(result).toBeNull();
    vi.doUnmock("qrcode");
    vi.resetModules();
  });
});
