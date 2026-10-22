/**
 * Tratamento seguro de fotos no cliente.
 * - Valida MIME real (magic bytes), não confia só na extensão. Recusa SVG/exe.
 * - Limita tamanho e comprime antes de enviar ao backend (Fase 2).
 * A chave de storage e a validação definitiva são feitas no servidor.
 *
 * Toda etapa assíncrona tem prazo: em navegadores Android, `createImageBitmap`
 * e `canvas.toBlob` podem simplesmente nunca responder — sem erro — e uma
 * promise pendurada deixava o upload preso em "Processando…" para sempre.
 * Cada etapa tem um caminho alternativo e, se a compressão inteira falhar,
 * o arquivo original (já validado aqui e revalidado no servidor) é enviado.
 */

import { ALLOWED_IMAGE_MIME, sniffImageMime } from "@/lib/imageMagic";
import { MAX_CART_PHOTOS, MAX_UPLOAD_BYTES } from "@/lib/limits";

// Reexporta para manter os imports existentes do cliente funcionando.
export { MAX_CART_PHOTOS, MAX_UPLOAD_BYTES };

const MAX_DIMENSION = 1400;
const OUTPUT_QUALITY = 0.72;
/** Prazo de cada etapa local (ler, decodificar, codificar). */
const STEP_TIMEOUT_MS = 10_000;

export interface CompressedPhoto {
  blob: Blob;
  width: number;
  height: number;
  type: string;
}

/** Foto pronta para envio. Sem dimensões quando vai o arquivo original. */
export interface PreparedPhoto {
  blob: Blob;
  width?: number;
  height?: number;
  /** `true` quando a compressão falhou e o arquivo original foi mantido. */
  original: boolean;
}

export type PhotoStage = "read" | "decode" | "encode";

/** Falha (ou prazo esgotado) numa etapa local do processamento da foto. */
export class PhotoProcessingError extends Error {
  stage: PhotoStage;
  constructor(stage: PhotoStage, message: string) {
    super(message);
    this.name = "PhotoProcessingError";
    this.stage = stage;
  }
}

/** Rejeita com `PhotoProcessingError` se `promise` não resolver em `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, stage: PhotoStage): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PhotoProcessingError(stage, `Tempo esgotado na etapa "${stage}".`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function readAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  // WebViews antigas (navegador embutido de apps) não têm Blob.arrayBuffer.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo."));
    reader.readAsArrayBuffer(blob);
  });
}

export async function validateImageFile(file: File): Promise<string | null> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return "Imagem muito grande. Escolha um arquivo de até 10 MB.";
  }
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return "Formato não aceito. Use JPG, PNG ou WEBP.";
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(
      await withTimeout(readAsArrayBuffer(file.slice(0, 12)), STEP_TIMEOUT_MS, "read"),
    );
  } catch {
    return "Não foi possível ler esta foto. Tente de novo ou escolha outra.";
  }
  const realMime = sniffImageMime(bytes);
  if (!realMime || !ALLOWED_IMAGE_MIME.has(realMime)) {
    return "Este arquivo não parece ser uma imagem válida.";
  }
  return null;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeWithBitmap(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap !== "function") {
    throw new PhotoProcessingError("decode", "createImageBitmap indisponível.");
  }
  const bitmap = await withTimeout(createImageBitmap(file), STEP_TIMEOUT_MS, "decode");
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    release: () => bitmap.close?.(),
  };
}

/** Decodificação pelo `<img>`, o caminho mais antigo e mais compatível. */
async function decodeWithImageElement(file: File): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new PhotoProcessingError("decode", "Imagem ilegível."));
    img.src = url;
  });
  try {
    const img = await withTimeout(loaded, STEP_TIMEOUT_MS, "decode");
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

async function decodeImage(file: File): Promise<DecodedImage> {
  try {
    return await decodeWithBitmap(file);
  } catch {
    return decodeWithImageElement(file);
  }
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

/** `toBlob` com prazo; se não responder, cai para `toDataURL` (síncrono). */
async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  try {
    const blob = await withTimeout(
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", OUTPUT_QUALITY)),
      STEP_TIMEOUT_MS,
      "encode",
    );
    if (blob) return blob;
  } catch {
    // segue para o caminho síncrono
  }
  const blob = dataUrlToBlob(canvas.toDataURL("image/jpeg", OUTPUT_QUALITY));
  if (!blob || !ALLOWED_IMAGE_MIME.has(blob.type)) {
    throw new PhotoProcessingError("encode", "Não foi possível comprimir a imagem.");
  }
  return blob;
}

/** Comprime para JPEG dentro de MAX_DIMENSION mantendo a proporção. */
export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  const decoded = await decodeImage(file);
  try {
    if (decoded.width <= 0 || decoded.height <= 0) {
      throw new PhotoProcessingError("decode", "Imagem sem dimensões.");
    }
    const scale = Math.min(1, MAX_DIMENSION / Math.max(decoded.width, decoded.height));
    const width = Math.round(decoded.width * scale);
    const height = Math.round(decoded.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoProcessingError("encode", "Não foi possível processar a imagem.");
    ctx.drawImage(decoded.source, 0, 0, width, height);

    const blob = await encodeJpeg(canvas);
    return { blob, width, height, type: blob.type };
  } finally {
    decoded.release();
  }
}

/**
 * Comprime quando o navegador consegue; senão envia o arquivo original. O
 * original já passou por `validateImageFile` (tamanho, MIME e magic bytes) e
 * o servidor repete essas checagens, então o fallback não abre exceção.
 */
export async function preparePhotoForUpload(file: File): Promise<PreparedPhoto> {
  try {
    const { blob, width, height } = await compressPhoto(file);
    return { blob, width, height, original: false };
  } catch (err) {
    console.warn("[upload] compressão indisponível, enviando o arquivo original", err);
    return { blob: file, original: true };
  }
}
