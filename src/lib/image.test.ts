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
  createPhotoReader,
  preparePhotoForUpload,
  readPhotoFile,
  withTimeout,
  PhotoProcessingError,
  PhotoRejectedError,
  READ_TIMEOUT_MS,
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

describe("readPhotoFile — cópia em memória", () => {
  it("devolve um Blob independente do File, com o MIME real", async () => {
    const file = jpegFile();
    const blob = await readPhotoFile(file);
    expect(blob).not.toBe(file);
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(file.size);
  });

  it("NotReadableError do Android vira falha de leitura (vale tentar de novo)", async () => {
    const file = jpegFile();
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new DOMException("x", "NotReadableError"));
    await expect(readPhotoFile(file)).rejects.toMatchObject({
      name: "PhotoProcessingError",
      stage: "read",
      timedOut: false,
      causeName: "NotReadableError",
    });
  });

  it("provedor que entrega 0 bytes (foto ainda baixando) é falha de leitura, não recusa", async () => {
    const file = jpegFile();
    vi.spyOn(file, "arrayBuffer").mockResolvedValue(new ArrayBuffer(0));
    await expect(readPhotoFile(file)).rejects.toMatchObject({ stage: "read", causeName: "EmptyFile" });
  });

  it("mantém as recusas definitivas", async () => {
    const svg = new File(["<svg/>"], "x.svg", { type: "image/svg+xml" });
    await expect(readPhotoFile(svg)).rejects.toThrow(/Formato não aceito/);
    const fake = new File(["texto"], "x.jpg", { type: "image/jpeg" });
    await expect(readPhotoFile(fake)).rejects.toThrow(/não parece ser uma imagem/);
    const huge = jpegFile();
    Object.defineProperty(huge, "size", { value: 11 * 1024 * 1024 });
    await expect(readPhotoFile(huge)).rejects.toBeInstanceOf(PhotoRejectedError);
  });

  it("type vazio (alguns provedores do Android) com bytes de JPEG é aceito", async () => {
    const file = new File([new Uint8Array(JPEG_HEADER)], "foto", { type: "" });
    await expect(readPhotoFile(file)).resolves.toMatchObject({ type: "image/jpeg" });
  });
});

describe("createPhotoReader — leitura que sobrevive ao prazo", () => {
  function deferredFile() {
    const file = jpegFile();
    let resolve!: (b: ArrayBuffer) => void;
    const spy = vi
      .spyOn(file, "arrayBuffer")
      .mockImplementation(() => new Promise<ArrayBuffer>((r) => (resolve = r)));
    return { file, spy, finish: () => resolve(new Uint8Array(JPEG_HEADER).buffer) };
  }

  it("prazo esgotado → retry reaproveita a MESMA leitura que terminou depois", async () => {
    const { file, spy, finish } = deferredFile();
    const reader = createPhotoReader(file);
    reader.prefetch();

    const first = reader.read();
    const assertion = expect(first).rejects.toMatchObject({ stage: "read", timedOut: true });
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    await assertion;

    finish(); // a foto terminou de baixar depois do prazo
    await expect(reader.read()).resolves.toMatchObject({ type: "image/jpeg" });
    expect(spy).toHaveBeenCalledTimes(1); // não leu o arquivo de novo
  });

  it("leitura que FALHOU é refeita na próxima tentativa", async () => {
    const file = jpegFile();
    const spy = vi
      .spyOn(file, "arrayBuffer")
      .mockRejectedValueOnce(new DOMException("x", "NotReadableError"))
      .mockResolvedValueOnce(new Uint8Array(JPEG_HEADER).buffer);
    const reader = createPhotoReader(file);
    await expect(reader.read()).rejects.toMatchObject({ stage: "read" });
    await expect(reader.read()).resolves.toMatchObject({ type: "image/jpeg" });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("leitura bem-sucedida fica em cache: o arquivo é lido uma vez só", async () => {
    const file = jpegFile();
    const spy = vi.spyOn(file, "arrayBuffer");
    const reader = createPhotoReader(file);
    reader.prefetch();
    await reader.read();
    await reader.read();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("withTimeout — conclusão tardia", () => {
  it("valor que chega depois do prazo vai para onLate (e não resolve nada)", async () => {
    let resolve!: (v: { close: () => void }) => void;
    const late = new Promise<{ close: () => void }>((r) => (resolve = r));
    const onLate = vi.fn((b: { close: () => void }) => b.close());
    const p = withTimeout(late, 1000, "decode", onLate);
    const assertion = expect(p).rejects.toMatchObject({ timedOut: true });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    const bitmap = { close: vi.fn() };
    resolve(bitmap);
    await vi.advanceTimersByTimeAsync(0);
    expect(onLate).toHaveBeenCalledWith(bitmap);
    expect(bitmap.close).toHaveBeenCalled();
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
