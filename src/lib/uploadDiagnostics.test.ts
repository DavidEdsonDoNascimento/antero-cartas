import { describe, it, expect, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }));

const { classifyUploadError } = await import("./uploadDiagnostics");
const { PhotoProcessingError } = await import("./image");

describe("classifyUploadError — falhas de leitura", () => {
  it("NotReadableError: o File não pode ser relido → sem retry, pede nova seleção", () => {
    const err = new PhotoProcessingError("read", "Falha ao ler o arquivo.", { causeName: "NotReadableError" });
    expect(classifyUploadError(err)).toEqual({
      stage: "read",
      errorName: "NotReadableError",
      retryable: false,
      reselect: true,
    });
  });

  it("prazo de leitura esgotado continua recuperável (a leitura segue em segundo plano)", () => {
    const err = new PhotoProcessingError("read", "Tempo esgotado", { timedOut: true });
    expect(classifyUploadError(err)).toMatchObject({ stage: "timeout", detail: "read", retryable: true });
    expect(classifyUploadError(err).reselect).toBeUndefined();
  });

  it("arquivo vazio e outras falhas de leitura continuam com retry normal", () => {
    for (const causeName of ["EmptyFile", "AbortError", undefined]) {
      const err = new PhotoProcessingError("read", "x", { causeName });
      expect(classifyUploadError(err)).toMatchObject({ stage: "read", retryable: true });
      expect(classifyUploadError(err).reselect).toBeUndefined();
    }
  });

  it("NotReadableError fora da etapa de leitura não pede nova seleção", () => {
    const err = new PhotoProcessingError("decode", "x", { causeName: "NotReadableError" });
    expect(classifyUploadError(err)).toMatchObject({ retryable: true });
    expect(classifyUploadError(err).reselect).toBeUndefined();
  });
});
