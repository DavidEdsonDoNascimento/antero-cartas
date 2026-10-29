/**
 * Diagnóstico das falhas de envio de foto. Responde "em que etapa falhou?"
 * para os casos que só acontecem num Android real, longe do DevTools.
 *
 * Só sai daqui o que é seguro: etapa, nome do erro (ex.: NotReadableError),
 * status/código HTTP, tentativa, MIME e tamanho arredondado. Nunca nome do
 * arquivo, bytes da foto, token, id da carta ou mensagem livre.
 *
 * Vai para o console e, quando houver DSN, para o Sentry (sem DSN o SDK não
 * foi inicializado e as chamadas não fazem nada).
 */

import * as Sentry from "@sentry/nextjs";
import { ApiClientError, RequestTimeoutError } from "@/lib/api";
import { PhotoProcessingError, PhotoRejectedError } from "@/lib/image";

export type UploadFailureStage =
  /** Arquivo recusado: tamanho, formato, não é imagem. */
  | "validation"
  /** Ler o arquivo do aparelho (content:// do Android). */
  | "read"
  | "decode"
  | "encode"
  /** Prazo esgotado — `detail` diz em qual etapa. */
  | "timeout"
  /** `fetch` rejeitou: conexão caiu, arquivo ilegível no envio. */
  | "network"
  /** Servidor respondeu com erro. */
  | "api"
  /** Exceção inesperada no fluxo da tela. */
  | "state";

export interface UploadFailure {
  stage: UploadFailureStage;
  /** Etapa interna do prazo esgotado ("read", "upload"…). */
  detail?: string;
  errorName?: string;
  status?: number;
  code?: string;
  /** Vale oferecer "Tentar de novo"? */
  retryable: boolean;
  /**
   * O `File` do seletor não pode mais ser lido (Android: `NotReadableError`).
   * Reler o mesmo arquivo falha sempre; só escolher a foto de novo resolve.
   */
  reselect?: boolean;
}

export function classifyUploadError(err: unknown): UploadFailure {
  if (err instanceof PhotoRejectedError) {
    return { stage: "validation", errorName: err.name, retryable: false };
  }
  if (err instanceof PhotoProcessingError) {
    if (err.stage === "read" && !err.timedOut && err.causeName === "NotReadableError") {
      return { stage: "read", errorName: err.causeName, retryable: false, reselect: true };
    }
    return err.timedOut
      ? { stage: "timeout", detail: err.stage, errorName: err.name, retryable: true }
      : { stage: err.stage, errorName: err.causeName ?? err.name, retryable: true };
  }
  if (err instanceof RequestTimeoutError) {
    return { stage: "timeout", detail: "upload", errorName: err.name, retryable: true };
  }
  if (err instanceof ApiClientError) {
    // 4xx é recusa do servidor (arquivo inválido, limite de fotos, token):
    // repetir dá o mesmo resultado. 408/429 e 5xx são transitórios.
    const retryable = err.status >= 500 || err.status === 408 || err.status === 429;
    return { stage: "api", status: err.status, code: err.code, errorName: err.name, retryable };
  }
  if (err instanceof TypeError) {
    return { stage: "network", errorName: err.name, retryable: true };
  }
  return {
    stage: "state",
    errorName: err instanceof Error ? err.name : typeof err,
    retryable: true,
  };
}

export interface UploadContext {
  attempt: number;
  mime?: string;
  sizeBytes?: number;
  /** Ia o arquivo original porque a compressão falhou? */
  original?: boolean;
}

function sizeKb(bytes: number | undefined): number | undefined {
  // Arredondado a 100 KB: suficiente para diagnóstico, inútil para identificar a foto.
  return bytes === undefined ? undefined : Math.round(bytes / 102_400) * 100;
}

/** Falha que o usuário viu na tela ("Falhou"). */
export function reportUploadFailure(failure: UploadFailure, ctx: UploadContext): void {
  const data = { ...failure, attempt: ctx.attempt, mime: ctx.mime, sizeKb: sizeKb(ctx.sizeBytes), original: ctx.original };
  console.warn("[upload] falha ao enviar foto", data);
  try {
    Sentry.captureMessage("photo_upload_failed", {
      level: "warning",
      tags: { upload_stage: failure.stage, upload_retryable: String(failure.retryable) },
      extra: data,
    });
  } catch {
    // Telemetria nunca derruba o fluxo do usuário.
  }
}

/** Compressão falhou e o original foi enviado no lugar — não é erro para o usuário. */
export function reportCompressionFallback(err: unknown, ctx: UploadContext): void {
  const failure = classifyUploadError(err);
  const data = { stage: failure.stage, detail: failure.detail, errorName: failure.errorName, mime: ctx.mime, sizeKb: sizeKb(ctx.sizeBytes) };
  console.info("[upload] compressão indisponível, enviando o arquivo original", data);
  try {
    Sentry.addBreadcrumb({ category: "upload", message: "compression_fallback", level: "info", data });
  } catch {
    // idem
  }
}
