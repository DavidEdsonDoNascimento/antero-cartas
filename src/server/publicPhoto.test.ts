/**
 * Foto da prévia pública: sai sem nenhum metadado do arquivo enviado.
 * Ver `publicPhoto.ts`.
 */
import sharp from "sharp";
import { describe, it, expect } from "vitest";
import { PUBLIC_PHOTO_MAX_SIDE, sanitizePublicPhoto } from "./publicPhoto";

const SENTINEL = "SENTINELA_GPS_-23.5505_-46.6333";

async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: "#c04a6a" } })
    .withExif({
      IFD0: { Artist: SENTINEL, Copyright: SENTINEL, ImageDescription: SENTINEL, Make: "CameraSentinela" },
    })
    .jpeg()
    .toBuffer();
}

/** Injeta um segmento APP1 "Exif" cru logo depois do SOI, como uma câmera faria. */
function withRawApp1(jpeg: Buffer, payload: string): Buffer {
  const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from(payload, "latin1")]);
  const len = body.length + 2;
  const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff]), body]);
  return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]);
}

describe("sanitizePublicPhoto", () => {
  it("remove EXIF (autor, aparelho, descrição) de um JPEG", async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    expect(input.includes(Buffer.from(SENTINEL))).toBe(true);

    const out = await sanitizePublicPhoto(input);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(out.includes(Buffer.from(SENTINEL))).toBe(false);
    expect(out.includes(Buffer.from("CameraSentinela"))).toBe(false);
  });

  it("remove um segmento APP1 cru com coordenadas GPS", async () => {
    const base = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#eee" } }).jpeg().toBuffer();
    const input = withRawApp1(base, `GPS ${SENTINEL}`);
    expect(input.includes(Buffer.from(SENTINEL))).toBe(true);
    const out = await sanitizePublicPhoto(input);
    expect(out.includes(Buffer.from(SENTINEL))).toBe(false);
    expect((await sharp(out).metadata()).exif).toBeUndefined();
  });

  it("PNG e WebP com metadados também saem limpos, como JPEG", async () => {
    for (const fmt of ["png", "webp"] as const) {
      const input = await sharp({ create: { width: 300, height: 200, channels: 4, background: "#ffffff00" } })
        .withExif({ IFD0: { Artist: SENTINEL } })
        [fmt]()
        .toBuffer();
      const out = await sanitizePublicPhoto(input);
      const meta = await sharp(out).metadata();
      expect(meta.format).toBe("jpeg");
      expect(meta.exif).toBeUndefined();
      expect(out.includes(Buffer.from(SENTINEL))).toBe(false);
    }
  });

  it("limita o tamanho de saída e não amplia fotos pequenas", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#123456" } }).jpeg().toBuffer();
    const meta = await sharp(await sanitizePublicPhoto(big)).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(PUBLIC_PHOTO_MAX_SIDE);

    const small = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#123456" } }).jpeg().toBuffer();
    expect((await sharp(await sanitizePublicPhoto(small)).metadata()).width).toBe(320);
  });

  it("recusa o que não é imagem", async () => {
    await expect(sanitizePublicPhoto(Buffer.from("<svg onload=alert(1)>"))).rejects.toThrow();
  });
});
