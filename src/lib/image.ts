/**
 * Tratamento seguro de fotos no cliente.
 * - Valida MIME real (magic bytes), não confia só na extensão. Recusa SVG/exe.
 * - Limita tamanho e comprime antes de enviar ao backend (Fase 2).
 * A chave de storage e a validação definitiva são feitas no servidor.
 */

import { ALLOWED_IMAGE_MIME, sniffImageMime } from "@/lib/imageMagic";
import { MAX_CART_PHOTOS, MAX_UPLOAD_BYTES } from "@/lib/limits";

// Reexporta para manter os imports existentes do cliente funcionando.
export { MAX_CART_PHOTOS, MAX_UPLOAD_BYTES };

const MAX_DIMENSION = 1400;
const OUTPUT_QUALITY = 0.72;

export interface CompressedPhoto {
  blob: Blob;
  width: number;
  height: number;
  type: string;
}

export async function validateImageFile(file: File): Promise<string | null> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return "Imagem muito grande. Escolha um arquivo de até 10 MB.";
  }
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return "Formato não aceito. Use JPG, PNG ou WEBP.";
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const realMime = sniffImageMime(bytes);
  if (!realMime || !ALLOWED_IMAGE_MIME.has(realMime)) {
    return "Este arquivo não parece ser uma imagem válida.";
  }
  return null;
}

/** Comprime para JPEG dentro de MAX_DIMENSION mantendo a proporção. */
export async function compressPhoto(file: File): Promise<CompressedPhoto> {
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

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", OUTPUT_QUALITY),
  );
  if (!blob) throw new Error("Não foi possível comprimir a imagem.");
  return { blob, width, height, type: "image/jpeg" };
}
