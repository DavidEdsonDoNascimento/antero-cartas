// @vitest-environment jsdom
/**
 * Upload de fotos no Android — regressões.
 *
 * Defeitos reais que estes testes fixam:
 * - "Tentar de novo" relia o `File` do seletor; se o Android não o entregava
 *   mais (NotReadableError / prazo de leitura), a validação devolvia
 *   "Não foi possível ler esta foto" e a foto era DESCARTADA da tela.
 * - A prévia local aparecia, mas só a resposta do servidor pode tirar a foto
 *   do estado pendente.
 * - Remover uma foto durante o processamento não impedia o envio: a foto
 *   reaparecia na carta.
 * - Nenhuma falha pode deixar a tela presa em "Processando…".
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Cart, CartMedia } from "@/lib/types";

const uploadPhoto = vi.fn();
const removePhoto = vi.fn();
const preparePhotoForUpload = vi.fn();
const createPhotoReader = vi.fn();

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }));
vi.mock("./MusicPicker", () => ({ MusicPicker: () => null }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  uploadPhoto: (...args: unknown[]) => uploadPhoto(...args),
  removePhoto: (...args: unknown[]) => removePhoto(...args),
}));
vi.mock("@/lib/image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image")>()),
  preparePhotoForUpload: (...args: unknown[]) => preparePhotoForUpload(...args),
  createPhotoReader: (...args: unknown[]) => createPhotoReader(...args),
}));

const { StepPersonalize } = await import("./StepPersonalize");
const { RequestTimeoutError, ApiClientError } = await import("@/lib/api");
const realImage = await vi.importActual<typeof import("@/lib/image")>("@/lib/image");
const { PhotoProcessingError } = realImage;

const CART: Cart = {
  id: "cart-1",
  slug: null,
  status: "DRAFT",
  recipientType: null,
  recipientName: "",
  occasion: null,
  title: "",
  message: "",
  senderName: "",
  signature: "",
  theme: "romantico",
  music: null,
  relationshipStartDate: null,
  showRelationshipCounter: false,
  planType: null,
  media: [],
  expiresAt: null,
  publishedAt: null,
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
};

function media(id: string, uploadId: string, position = 0): CartMedia {
  return {
    id,
    cartId: "cart-1",
    type: "photo",
    url: `/api/media/carts/cart-1/${uploadId}_x.jpg`,
    storageKey: `carts/cart-1/${uploadId}_x.jpg`,
    position,
    framing: null,
    createdAt: "2026-10-22T00:00:00.000Z",
  };
}

/** Resposta do servidor contendo a foto enviada com este uploadId. */
function serverAccepts(mediaId = "m1") {
  return async (_c: string, _t: string, _b: Blob, _d: unknown, uploadId: string) => ({
    cart: { ...CART, media: [media(mediaId, uploadId)] },
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;
const onCartUpdated = vi.fn();
const onMediaChanged = vi.fn();
let uuidSeq = 0;

function render(cart: Cart = CART) {
  root.render(
    <StepPersonalize
      cart={cart}
      update={vi.fn()}
      session={{ cartId: "cart-1", editToken: "tok" }}
      onCartUpdated={onCartUpdated}
      onMediaChanged={onMediaChanged}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  uuidSeq = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(
    () => `00000000-0000-4000-8000-${String(++uuidSeq).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
  );
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  createPhotoReader.mockImplementation((file: File) => realImage.createPhotoReader(file));
  preparePhotoForUpload.mockImplementation(async (blob: Blob) => ({
    blob,
    width: 800,
    height: 600,
    original: false,
  }));
  uploadPhoto.mockImplementation(serverAccepts());
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    render();
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function jpeg(name = "foto.jpg"): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])], name, {
    type: "image/jpeg",
  });
}

/** Deixa a fila (várias continuações assíncronas) andar até parar. */
async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function selectPhotos(...files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

function pickerButton(): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    /Selecionar fotos|Processando/.test(b.textContent ?? ""),
  )!;
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
}

function pendingStatuses(): string[] {
  return Array.from(container.querySelectorAll("[data-pending-status]")).map(
    (el) => el.getAttribute("data-pending-status")!,
  );
}

async function click(button: HTMLButtonElement | undefined) {
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
  });
  await settle();
}

describe("mesmo arquivo: falha na 1ª tentativa, funciona na 2ª", () => {
  it("falha de leitura do Android → foto continua visível e 'Tentar de novo' envia sem nova seleção", async () => {
    const file = jpeg();
    vi.spyOn(file, "arrayBuffer")
      .mockRejectedValueOnce(new DOMException("x", "NotReadableError"))
      .mockResolvedValueOnce(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer);
    await selectPhotos(file);

    // Antes: a foto era descartada com "Não foi possível ler esta foto".
    expect(pendingStatuses()).toEqual(["error"]);
    expect(container.textContent).toMatch(/Não foi possível ler esta foto/);
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(pickerButton().disabled).toBe(false);

    await click(buttonByText("Tentar de novo"));

    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(onMediaChanged).toHaveBeenCalledWith([expect.objectContaining({ id: "m1" })]);
    expect(pendingStatuses()).toEqual([]);
  });

  it("prazo de leitura esgotado → retry espera a MESMA leitura, que termina depois", async () => {
    const lateRead = deferred<Blob>();
    let reads = 0;
    createPhotoReader.mockImplementation(() => ({
      prefetch: vi.fn(),
      read: () => {
        reads += 1;
        if (reads === 1) {
          return Promise.reject(
            new PhotoProcessingError("read", "Tempo esgotado", { timedOut: true }),
          );
        }
        return lateRead.promise;
      },
    }));
    await selectPhotos(jpeg());
    expect(pendingStatuses()).toEqual(["error"]);
    expect(container.textContent).toMatch(/demorando para abrir/);

    await click(buttonByText("Tentar de novo"));
    // Retry mantém a foto visível enquanto espera.
    expect(pendingStatuses()).toEqual(["processing"]);
    lateRead.resolve(new Blob(["x"], { type: "image/jpeg" }));
    await settle();
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(pendingStatuses()).toEqual([]);
  });
});

describe("prévia local não é 'enviada'", () => {
  it("API retorna 500: prévia continua com 'Falhou', nada vai para cart.media", async () => {
    uploadPhoto.mockRejectedValueOnce(new ApiClientError("server", "Erro interno.", 500));
    await selectPhotos(jpeg());

    expect(container.querySelector('img[src="blob:preview"]')).not.toBeNull();
    expect(pendingStatuses()).toEqual(["error"]);
    expect(container.textContent).toContain("Falhou");
    expect(onMediaChanged).not.toHaveBeenCalled();
    expect(onCartUpdated).not.toHaveBeenCalled();
    expect(buttonByText("Tentar de novo")).toBeDefined();
    expect(buttonByText("Remover")).toBeDefined();
  });

  it("'Tentar de novo' reenvia os MESMOS bytes com o MESMO uploadId, sem reprocessar", async () => {
    uploadPhoto.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await selectPhotos(jpeg());
    expect(container.textContent).toMatch(/Verifique a conexão/);

    const pending = deferred<{ cart: Cart }>();
    uploadPhoto.mockImplementationOnce(() => pending.promise);
    await click(buttonByText("Tentar de novo"));

    // A foto não some ao tocar em "Tentar de novo".
    expect(pendingStatuses()).toEqual(["uploading"]);
    expect(container.querySelector('img[src="blob:preview"]')).not.toBeNull();

    const [first, second] = uploadPhoto.mock.calls;
    expect(second[2]).toBe(first[2]); // mesmo Blob
    expect(second[4]).toBe(first[4]); // mesmo uploadId → idempotente no servidor
    expect(preparePhotoForUpload).toHaveBeenCalledTimes(1);

    pending.resolve({ cart: { ...CART, media: [media("m1", first[4])] } });
    await settle();
    expect(onMediaChanged).toHaveBeenCalledTimes(1);
    expect(pendingStatuses()).toEqual([]);
    expect(container.textContent).not.toContain("Falhou");
  });

  it("recusa definitiva do servidor (400): sem 'Tentar de novo', com 'Remover'", async () => {
    uploadPhoto.mockRejectedValueOnce(
      new ApiClientError("invalid", "Arquivo não é uma imagem válida (JPG, PNG ou WEBP).", 400),
    );
    await selectPhotos(jpeg());
    expect(container.textContent).toMatch(/não é uma imagem válida/);
    expect(buttonByText("Tentar de novo")).toBeUndefined();

    await click(buttonByText("Remover"));
    expect(pendingStatuses()).toEqual([]);
    expect(container.textContent).not.toMatch(/não é uma imagem válida/);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("prazo do envio esgotado: mensagem específica e tela liberada", async () => {
    uploadPhoto.mockRejectedValueOnce(new RequestTimeoutError());
    await selectPhotos(jpeg());
    expect(container.textContent).toMatch(/demorou demais/);
    expect(pickerButton().disabled).toBe(false);
    expect(pendingStatuses()).toEqual(["error"]);
  });

  it("toque duplo em 'Tentar de novo' gera um único envio", async () => {
    uploadPhoto.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await selectPhotos(jpeg());
    const retry = buttonByText("Tentar de novo")!;
    await act(async () => {
      retry.click();
      retry.click();
    });
    await settle();
    expect(uploadPhoto).toHaveBeenCalledTimes(2); // 1ª falha + 1 retry
  });
});

describe("estados distinguíveis", () => {
  it("preparando → enviando → enviada (sai da lista pendente)", async () => {
    const prep = deferred<{ blob: Blob; original: boolean }>();
    const up = deferred<{ cart: Cart }>();
    preparePhotoForUpload.mockImplementationOnce(() => prep.promise);
    uploadPhoto.mockImplementationOnce(() => up.promise);

    await selectPhotos(jpeg());
    expect(pendingStatuses()).toEqual(["processing"]);
    expect(container.textContent).toContain("Preparando…");
    expect(pickerButton().textContent).toContain("Processando");

    prep.resolve({ blob: new Blob(["x"]), original: false });
    await settle();
    expect(pendingStatuses()).toEqual(["uploading"]);
    expect(container.textContent).toContain("Enviando…");

    up.resolve({ cart: { ...CART, media: [media("m1", "a")] } });
    await settle();
    expect(pendingStatuses()).toEqual([]);
    expect(pickerButton().disabled).toBe(false);
  });
});

describe("remoção durante o processamento", () => {
  it("removida enquanto prepara: nunca é enviada e não volta para a tela", async () => {
    const prep = deferred<{ blob: Blob; original: boolean }>();
    preparePhotoForUpload.mockImplementationOnce(() => prep.promise);
    await selectPhotos(jpeg());

    await click(container.querySelector<HTMLButtonElement>('[aria-label="Remover esta foto"]')!);
    expect(pendingStatuses()).toEqual([]);

    prep.resolve({ blob: new Blob(["x"]), original: false });
    await settle();
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(pendingStatuses()).toEqual([]);
    expect(pickerButton().disabled).toBe(false);
  });

  it("removida enquanto sobe: resposta tardia não a traz de volta — é apagada no servidor", async () => {
    const up = deferred<{ cart: Cart }>();
    uploadPhoto.mockImplementationOnce(() => up.promise);
    await selectPhotos(jpeg());
    const uploadId = uploadPhoto.mock.calls[0][4] as string;

    await click(container.querySelector<HTMLButtonElement>('[aria-label="Remover esta foto"]')!);
    removePhoto.mockResolvedValueOnce({ cart: CART });

    up.resolve({ cart: { ...CART, media: [media("m9", uploadId)] } });
    await settle();
    expect(removePhoto).toHaveBeenCalledWith("cart-1", "tok", "m9");
    expect(onMediaChanged).toHaveBeenLastCalledWith([]);
    expect(pendingStatuses()).toEqual([]);
  });

  it("sair da etapa durante o envio não perde a foto (chega via onMediaChanged)", async () => {
    const up = deferred<{ cart: Cart }>();
    uploadPhoto.mockImplementationOnce(() => up.promise);
    await selectPhotos(jpeg());

    act(() => root.unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");

    up.resolve({ cart: { ...CART, media: [media("m1", "a")] } });
    await settle();
    expect(onMediaChanged).toHaveBeenCalledWith([expect.objectContaining({ id: "m1" })]);
    // recria para o afterEach desmontar algo válido
    act(() => {
      root = createRoot(container);
      render();
    });
  });
});

describe("várias fotos em sequência", () => {
  it("envia em série, na ordem; a que falha fica com retry e as outras seguem", async () => {
    const order: string[] = [];
    const first = deferred<{ cart: Cart }>();
    uploadPhoto
      .mockImplementationOnce((...args: unknown[]) => {
        order.push(args[4] as string);
        return first.promise;
      })
      .mockImplementationOnce((...args: unknown[]) => {
        order.push(args[4] as string);
        return Promise.reject(new TypeError("Failed to fetch"));
      })
      .mockImplementationOnce((...args: unknown[]) => {
        order.push(args[4] as string);
        return Promise.resolve({ cart: { ...CART, media: [media("m1", "1"), media("m3", "3", 1)] } });
      });

    await selectPhotos(jpeg("a.jpg"), jpeg("b.jpg"), jpeg("c.jpg"));
    // Só a primeira está no ar; as outras esperam a vez.
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(pendingStatuses()).toEqual(["uploading", "queued", "queued"]);

    first.resolve({ cart: { ...CART, media: [media("m1", "1")] } });
    await settle();

    expect(order).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]);
    expect(onMediaChanged).toHaveBeenCalledTimes(2);
    expect(onMediaChanged).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "m1" }),
      expect.objectContaining({ id: "m3" }),
    ]);
    expect(pendingStatuses()).toEqual(["error"]);
    expect(buttonByText("Tentar de novo")).toBeDefined();
  });

  it("foto 'Falhou' que o servidor gravou mesmo assim sai da lista quando outra resposta a confirma", async () => {
    // 1ª: o servidor grava, mas a resposta se perde. 2ª: a resposta já traz as duas.
    uploadPhoto
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementationOnce(async () => ({
        cart: {
          ...CART,
          media: [
            media("m1", "00000000-0000-4000-8000-000000000001"),
            media("m2", "00000000-0000-4000-8000-000000000002", 1),
          ],
        },
      }));
    await selectPhotos(jpeg("a.jpg"), jpeg("b.jpg"));
    expect(pendingStatuses()).toEqual([]);
    expect(onMediaChanged).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "m1" }),
      expect.objectContaining({ id: "m2" }),
    ]);
    expect(buttonByText("Tentar de novo")).toBeUndefined();
  });

  it("cada foto é lida assim que selecionada, não quando chega a vez", async () => {
    const prefetch = vi.fn();
    createPhotoReader.mockImplementation((file: File) => {
      const reader = realImage.createPhotoReader(file);
      return { prefetch: () => (prefetch(), reader.prefetch()), read: reader.read };
    });
    const first = deferred<{ cart: Cart }>();
    uploadPhoto.mockImplementationOnce(() => first.promise);
    await selectPhotos(jpeg("a.jpg"), jpeg("b.jpg"));
    expect(prefetch).toHaveBeenCalledTimes(2);
    first.resolve({ cart: CART });
    await settle();
  });
});

describe("compressão", () => {
  it("compressão falha → o original é enviado (sem dimensões) e a foto entra", async () => {
    preparePhotoForUpload.mockImplementationOnce(async (blob: Blob) => ({
      blob,
      original: true,
      fallbackError: new PhotoProcessingError("decode", "x", { timedOut: true }),
    }));
    await selectPhotos(jpeg());
    expect(uploadPhoto).toHaveBeenCalledWith(
      "cart-1",
      "tok",
      expect.any(Blob),
      undefined,
      expect.any(String),
    );
    expect(onMediaChanged).toHaveBeenCalled();
    expect(pendingStatuses()).toEqual([]);
  });

  it("erro inesperado no preparo também não prende a tela", async () => {
    preparePhotoForUpload.mockRejectedValueOnce(new Error("boom"));
    await selectPhotos(jpeg());
    expect(pickerButton().textContent).toContain("Selecionar fotos");
    expect(pendingStatuses()).toEqual(["error"]);
  });
});

describe("validação", () => {
  it("arquivo que não é imagem: 'Falhou' com a mensagem, sem retry, removível", async () => {
    await selectPhotos(new File(["texto"], "x.jpg", { type: "image/jpeg" }));
    expect(container.textContent).toMatch(/não parece ser uma imagem/);
    expect(pendingStatuses()).toEqual(["error"]);
    expect(buttonByText("Tentar de novo")).toBeUndefined();
    expect(buttonByText("Remover")).toBeDefined();
    expect(uploadPhoto).not.toHaveBeenCalled();
  });
});
