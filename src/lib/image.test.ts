// @vitest-environment jsdom
/**
 * Processamento de foto no cliente com etapas que travam (Android).
 *
 * O defeito real: `createImageBitmap`/`canvas.toBlob` podem nunca responder
 * em alguns navegadores Android, e a promise pendurada prendia o upload em
 * "Processando…". Aqui cada etapa é simulada travando para garantir que o
 * pipeline sempre termina — comprimindo por outro caminho ou devolvendo o
 * arquivo original.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  compressPhoto,
  preparePhotoForUpload,
  validateImageFile,
  withTimeout,
  PhotoProcessingError,
} from "@/lib/image";

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];

function jpegFile(): File {
  return new File([new Uint8Array(JPEG_HEADER)], "foto.jpg", { type: "image/jpeg" });
}

const never = <T>() => new Promise<T>(() => {});

/** Canvas falso: jsdom não implementa 2D nem codificação. */
function stubCanvas(opts: { toBlob: "ok" | "never" | "null"; dataUrl?: string }) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
    if (opts.toBlob === "ok") cb(new Blob([new Uint8Array(JPEG_HEADER)], { type: "image/jpeg" }));
    if (opts.toBlob === "null") cb(null);
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    opts.dataUrl ?? `data:image/jpeg;base64,${btoa(String.fromCharCode(...JPEG_HEADER))}`,
  );
}

function stubBitmap(result: "ok" | "never" | "reject", width = 2800, height = 1400) {
  const fn =
    result === "ok"
      ? vi.fn().mockResolvedValue({ width, height, close: vi.fn() })
      : result === "never"
        ? vi.fn(() => never())
        : vi.fn().mockRejectedValue(new Error("decode"));
  vi.stubGlobal("createImageBitmap", fn);
  return fn;
}

/** `<img>` que nunca carrega (ou carrega com as dimensões dadas). */
function stubImageElement(result: "never" | { width: number; height: number }) {
  const srcSetter = vi
    .spyOn(HTMLImageElement.prototype, "src", "set")
    .mockImplementation(function (this: HTMLImageElement) {
      if (result === "never") return;
      Object.defineProperty(this, "naturalWidth", { value: result.width });
      Object.defineProperty(this, "naturalHeight", { value: result.height });
      queueMicrotask(() => this.onload?.(new Event("load")));
    });
  return srcSetter;
}

beforeEach(() => {
  vi.useFakeTimers();
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("withTimeout", () => {
  it("rejeita com PhotoProcessingError da etapa quando a promise não responde", async () => {
    const p = withTimeout(never(), 1000, "decode");
    const assertion = expect(p).rejects.toMatchObject({ name: "PhotoProcessingError", stage: "decode" });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});

describe("validateImageFile", () => {
  it("devolve mensagem (não lança nem trava) quando a leitura do arquivo falha", async () => {
    const file = jpegFile();
    vi.spyOn(file, "slice").mockReturnValue({
      arrayBuffer: () => Promise.reject(new DOMException("x", "NotReadableError")),
    } as unknown as Blob);
    await expect(validateImageFile(file)).resolves.toMatch(/Não foi possível ler/);
  });

  it("devolve mensagem quando a leitura do arquivo nunca termina", async () => {
    const file = jpegFile();
    vi.spyOn(file, "slice").mockReturnValue({ arrayBuffer: () => never() } as unknown as Blob);
    const result = validateImageFile(file);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(result).resolves.toMatch(/Não foi possível ler/);
  });

  it("mantém as validações existentes", async () => {
    await expect(validateImageFile(jpegFile())).resolves.toBeNull();
    const svg = new File(["<svg/>"], "x.svg", { type: "image/svg+xml" });
    await expect(validateImageFile(svg)).resolves.toMatch(/Formato não aceito/);
    const fake = new File(["texto"], "x.jpg", { type: "image/jpeg" });
    await expect(validateImageFile(fake)).resolves.toMatch(/não parece ser uma imagem/);
  });
});

describe("compressPhoto", () => {
  it("caminho normal: reduz para 1400px mantendo a proporção", async () => {
    stubBitmap("ok", 2800, 1400);
    stubCanvas({ toBlob: "ok" });
    const out = await compressPhoto(jpegFile());
    expect(out).toMatchObject({ width: 1400, height: 700, type: "image/jpeg" });
  });

  it("createImageBitmap travado → decodifica pelo <img>", async () => {
    stubBitmap("never");
    stubImageElement({ width: 1000, height: 500 });
    stubCanvas({ toBlob: "ok" });
    const result = compressPhoto(jpegFile());
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(result).resolves.toMatchObject({ width: 1000, height: 500 });
  });

  it("toBlob que nunca chama o callback → usa toDataURL", async () => {
    stubBitmap("ok", 800, 600);
    stubCanvas({ toBlob: "never" });
    const result = compressPhoto(jpegFile());
    await vi.advanceTimersByTimeAsync(15_000);
    const out = await result;
    expect(out.blob.type).toBe("image/jpeg");
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalled();
  });

  it("toBlob devolvendo null → usa toDataURL", async () => {
    stubBitmap("ok", 800, 600);
    stubCanvas({ toBlob: "null" });
    await expect(compressPhoto(jpegFile())).resolves.toMatchObject({ width: 800 });
  });
});

describe("preparePhotoForUpload", () => {
  it("envia comprimido quando o navegador consegue", async () => {
    stubBitmap("ok", 800, 600);
    stubCanvas({ toBlob: "ok" });
    const out = await preparePhotoForUpload(jpegFile());
    expect(out).toMatchObject({ original: false, width: 800, height: 600 });
  });

  it("todas as etapas travadas → termina e devolve o arquivo original", async () => {
    stubBitmap("never");
    stubImageElement("never");
    stubCanvas({ toBlob: "never" });
    const file = jpegFile();
    const result = preparePhotoForUpload(file);
    await vi.advanceTimersByTimeAsync(30_000);
    const out = await result;
    expect(out.original).toBe(true);
    expect(out.blob).toBe(file);
    expect(out.width).toBeUndefined();
  });

  it("canvas sem contexto 2D → devolve o original", async () => {
    stubBitmap("ok", 800, 600);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const out = await preparePhotoForUpload(jpegFile());
    expect(out.original).toBe(true);
  });

  it("codificação produzindo formato não aceito → devolve o original", async () => {
    stubBitmap("ok", 800, 600);
    stubCanvas({ toBlob: "null", dataUrl: "data:," });
    const out = await preparePhotoForUpload(jpegFile());
    expect(out.original).toBe(true);
  });
});

it("PhotoProcessingError carrega a etapa", () => {
  expect(new PhotoProcessingError("encode", "x").stage).toBe("encode");
});
