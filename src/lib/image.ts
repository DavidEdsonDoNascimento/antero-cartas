/**
 * Tratamento seguro de fotos no cliente (Fase 1).
 * - Valida MIME real (magic bytes), não confia só na extensão.
 * - Recusa SVG e executáveis.
 * - Limita tamanho e comprime antes de guardar.
 * - Gera nomes não previsíveis (storageKey).
 */

import { generateSlug } from "@/lib/slug";

/**
 * Limite central de fotos por cartinha. Fonte única — não repetir o número
 * pelo projeto. Ajustável por env se necessário.
 */
export const MAX_CART_PHOTOS = Number(process.env.NEXT_PUBLIC_MAX_CART_PHOTOS) || 6;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB antes de comprimir
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DIMENSION = 1400;
const OUTPUT_QUALITY = 0.72;

export interface PreparedPhoto {
  dataUrl: string;
  storageKey: string;
}

/** Lê os primeiros bytes para confirmar o tipo real da imagem. */
async function sniffMime(file: File): Promise<string | null> {
  const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  // WEBP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "image/webp";
  return null;
}

export async function validateImageFile(file: File): Promise<string | null> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return "Imagem muito grande. Escolha um arquivo de até 10 MB.";
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return "Formato não aceito. Use JPG, PNG ou WEBP.";
  }
  const realMime = await sniffMime(file);
  if (!realMime || !ALLOWED_MIME.has(realMime)) {
    return "Este arquivo não parece ser uma imagem válida.";
  }
  return null;
}

/** Comprime para JPEG dentro de MAX_DIMENSION mantendo a proporção. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL("image/jpeg", OUTPUT_QUALITY);
  return { dataUrl, storageKey: `photo_${generateSlug(20)}.jpg` };
}
