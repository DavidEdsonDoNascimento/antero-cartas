import { describe, it, expect } from "vitest";
import { sniffImageMime, extensionForMime, ALLOWED_IMAGE_MIME } from "@/lib/imageMagic";

describe("sniffImageMime", () => {
  it("reconhece JPEG pelos magic bytes", () => {
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });
  it("reconhece PNG pelos magic bytes", () => {
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(
      "image/png",
    );
  });
  it("reconhece WEBP pelos magic bytes (RIFF....WEBP)", () => {
    const bytes = new Uint8Array(12);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    bytes.set([0x00, 0x00, 0x00, 0x00], 4); // tamanho (irrelevante)
    bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    expect(sniffImageMime(bytes)).toBe("image/webp");
  });
  it("retorna null para SVG (texto/XML) e outros formatos não suportados", () => {
    const svg = new TextEncoder().encode("<svg xmlns='...'>");
    expect(sniffImageMime(svg)).toBeNull();
  });
  it("retorna null para bytes insuficientes ou aleatórios", () => {
    expect(sniffImageMime(new Uint8Array([0, 0, 0]))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0x4d, 0x5a]))).toBeNull(); // "MZ" (executável)
  });
});

describe("extensionForMime", () => {
  it("mapeia cada MIME permitido para a extensão correta", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
  });
});

describe("ALLOWED_IMAGE_MIME", () => {
  it("contém apenas jpeg/png/webp", () => {
    expect([...ALLOWED_IMAGE_MIME].sort()).toEqual(
      ["image/jpeg", "image/png", "image/webp"].sort(),
    );
  });
});
