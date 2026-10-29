/**
 * Tratamento seguro de fotos no cliente.
 * - Valida MIME real (magic bytes), não confia só na extensão. Recusa SVG/exe.
 * - Limita tamanho e comprime antes de enviar ao backend (Fase 2).
 * A chave de storage e a validação definitiva são feitas no servidor.
 *
 * Android: o `File` devolvido pelo seletor é só uma referência a um
 * `content://` do sistema. Cada leitura volta ao provedor (Google Fotos,
 * galeria, nuvem), que pode demorar — a foto às vezes ainda está sendo
 * baixada — ou falhar com `NotReadableError` quando o arquivo muda depois de
 * escolhido. Por isso a foto é lida UMA vez para a memória (`readPhotoFile`)
 * e tudo depois — decodificar, comprimir, enviar, tentar de novo — usa essa
 * cópia, que não depende mais do provedor.
 *
 * Toda etapa assíncrona tem prazo: em navegadores Android, `createImageBitmap`
 * e `canvas.toBlob` podem simplesmente nunca responder — sem erro. Cada etapa
 * tem um caminho alternativo e, se a compressão inteira falhar, a cópia do
 * arquivo original (já validada aqui e revalidada no servidor) é enviada.
 */

import { ALLOWED_IMAGE_MIME, sniffImageMime } from "@/lib/imageMagic";
import { MAX_CART_PHOTOS, MAX_UPLOAD_BYTES } from "@/lib/limits";

// Reexporta para manter os imports existentes do cliente funcionando.
export { MAX_CART_PHOTOS, MAX_UPLOAD_BYTES };

const MAX_DIMENSION = 1400;
const OUTPUT_QUALITY = 0.72;
/** Prazo de cada etapa local de processamento (decodificar, codificar). */
const STEP_TIMEOUT_MS = 10_000;
/**
 * Prazo para a leitura do arquivo aparecer na tela como falha. Não é o mesmo
 * das outras etapas: ler pode exigir que o Android baixe a foto da nuvem
 * antes do primeiro byte. A leitura NÃO é cancelada ao estourar o prazo —
 * `createPhotoReader` a reaproveita no "Tentar de novo".
 */
export const READ_TIMEOUT_MS = 45_000;

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
  /** Por que a compressão falhou (só diagnóstico, nunca exibido). */
  fallbackError?: unknown;
}

export type PhotoStage = "read" | "decode" | "encode";

/** Falha (ou prazo esgotado) numa etapa local do processamento da foto. */
export class PhotoProcessingError extends Error {
  stage: PhotoStage;
  timedOut: boolean;
  /** `name` do erro original (ex.: NotReadableError) — diagnóstico seguro. */
  causeName?: string;
  constructor(stage: PhotoStage, message: string, opts: { timedOut?: boolean; causeName?: string } = {}) {
    super(message);
    this.name = "PhotoProcessingError";
    this.stage = stage;
    this.timedOut = opts.timedOut ?? false;
    this.causeName = opts.causeName;
  }
}

/**
 * Arquivo recusado de forma definitiva (tamanho, formato, não é imagem).
 * Tentar de novo não muda nada; a mensagem já é para o usuário.
 */
export class PhotoRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoRejectedError";
  }
}

/**
 * Rejeita com `PhotoProcessingError` se `promise` não resolver em `ms`.
 * A operação original segue rodando (não há como cancelá-la); se ela
 * resolver depois do prazo, `onLate` recebe o valor para liberar recursos —
 * um `ImageBitmap` tardio, por exemplo, ocuparia dezenas de MB à toa.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  stage: PhotoStage,
  onLate?: (value: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new PhotoProcessingError(stage, `Tempo esgotado na etapa "${stage}".`, { timedOut: true }));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        if (timedOut) onLate?.(value);
        else resolve(value);
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

function errorName(err: unknown): string | undefined {
  return err instanceof Error || err instanceof DOMException ? err.name : undefined;
}

/**
 * Valida e copia a foto inteira para a memória. Lança `PhotoRejectedError`
 * (definitivo) ou `PhotoProcessingError("read")` (vale tentar de novo).
 *
 * O MIME declarado só serve para recusar cedo o que claramente não é aceito
 * (SVG, HEIC) e escolher a mensagem: alguns provedores do Android entregam
 * `type` vazio para um JPEG válido. Quem decide são os magic bytes.
 */
export async function readPhotoFile(file: File): Promise<Blob> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new PhotoRejectedError("Imagem muito grande. Escolha um arquivo de até 10 MB.");
  }
  const declaredUnsupported = file.type !== "" && !ALLOWED_IMAGE_MIME.has(file.type);
  if (declaredUnsupported) {
    throw new PhotoRejectedError("Formato não aceito. Use JPG, PNG ou WEBP.");
  }
  let buffer: ArrayBuffer;
  try {
    buffer = await readAsArrayBuffer(file);
  } catch (err) {
    throw new PhotoProcessingError("read", "Falha ao ler o arquivo.", { causeName: errorName(err) });
  }
  // Provedor que ainda não terminou de baixar a foto pode entregar 0 bytes.
  if (buffer.byteLength === 0) {
    throw new PhotoProcessingError("read", "Arquivo vazio.", { causeName: "EmptyFile" });
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new PhotoRejectedError("Imagem muito grande. Escolha um arquivo de até 10 MB.");
  }
  const realMime = sniffImageMime(new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength)));
  if (!realMime || !ALLOWED_IMAGE_MIME.has(realMime)) {
    throw new PhotoRejectedError("Este arquivo não parece ser uma imagem válida.");
  }
  return new Blob([buffer], { type: realMime });
}

/** Leitura da foto que sobrevive ao prazo e é reaproveitada nas novas tentativas. */
export interface PhotoReader {
  /** Começa a ler já (ao selecionar), sem esperar a vez na fila de envio. */
  prefetch(): void;
  /** A cópia em memória, ou erro — com prazo de `READ_TIMEOUT_MS`. */
  read(): Promise<Blob>;
}

/**
 * Lê o arquivo uma única vez. Se a leitura passar do prazo, ela continua em
 * segundo plano e o próximo `read()` (o "Tentar de novo") espera por ELA em
 * vez de começar outra — uma foto da nuvem que terminou de baixar aos 50 s
 * não é jogada fora. Só uma leitura que FALHOU é refeita.
 */
export function createPhotoReader(file: File, timeoutMs = READ_TIMEOUT_MS): PhotoReader {
  let pending: Promise<Blob> | null = null;
  function start(): Promise<Blob> {
    if (!pending) {
      const p = readPhotoFile(file);
      pending = p;
      p.catch(() => {
        if (pending === p) pending = null;
      });
    }
    return pending;
  }
  return {
    prefetch: () => void start(),
    read: () => withTimeout(start(), timeoutMs, "read"),
  };
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeWithBitmap(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap !== "function") {
    throw new PhotoProcessingError("decode", "createImageBitmap indisponível.");
  }
  const bitmap = await withTimeout(createImageBitmap(blob), STEP_TIMEOUT_MS, "decode", (late) =>
    late.close?.(),
  );
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    release: () => bitmap.close?.(),
  };
}

/** Decodificação pelo `<img>`, o caminho mais antigo e mais compatível. */
async function decodeWithImageElement(blob: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(blob);
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

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  try {
    return await decodeWithBitmap(blob);
  } catch {
    return decodeWithImageElement(blob);
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
export async function compressPhoto(file: Blob): Promise<CompressedPhoto> {
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
 * original já passou por `readPhotoFile` (tamanho, MIME e magic bytes) e o
 * servidor repete essas checagens, então o fallback não abre exceção.
 * Nunca lança.
 */
export async function preparePhotoForUpload(source: Blob): Promise<PreparedPhoto> {
  try {
    const { blob, width, height } = await compressPhoto(source);
    return { blob, width, height, original: false };
  } catch (err) {
    return { blob: source, original: true, fallbackError: err };
  }
}
