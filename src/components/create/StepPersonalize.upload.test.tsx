// @vitest-environment jsdom
/**
 * Upload de fotos: nenhuma falha pode deixar a tela presa em "Processando…".
 *
 * Antes, um erro lançado fora do `try` (validação) ou uma promise que nunca
 * resolvia deixava `busy` ligado para sempre — sintoma visto no Android.
 * Aqui o pipeline é simulado falhando de várias formas e o contrato fixado é:
 * o seletor volta a ficar disponível, a foto mostra "Falhou", aparece uma
 * mensagem compreensível e "Tentar de novo" reenvia.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Cart } from "@/lib/types";

const uploadPhoto = vi.fn();
const validateImageFile = vi.fn();
const preparePhotoForUpload = vi.fn();

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("./MusicPicker", () => ({ MusicPicker: () => null }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  uploadPhoto: (...args: unknown[]) => uploadPhoto(...args),
}));
vi.mock("@/lib/image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image")>()),
  validateImageFile: (...args: unknown[]) => validateImageFile(...args),
  preparePhotoForUpload: (...args: unknown[]) => preparePhotoForUpload(...args),
}));

const { StepPersonalize } = await import("./StepPersonalize");
const { RequestTimeoutError } = await import("@/lib/api");

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

let container: HTMLDivElement;
let root: Root;
const onCartUpdated = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  validateImageFile.mockResolvedValue(null);
  preparePhotoForUpload.mockImplementation(async (file: File) => ({
    blob: file,
    width: 800,
    height: 600,
    original: false,
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <StepPersonalize
        cart={CART}
        update={vi.fn()}
        session={{ cartId: "cart-1", editToken: "tok" }}
        onCartUpdated={onCartUpdated}
      />,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function selectPhoto() {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
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

describe("upload de fotos — nunca fica preso", () => {
  it("falha de rede: libera o seletor, marca a foto e permite tentar de novo", async () => {
    uploadPhoto.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await selectPhoto();

    expect(pickerButton().textContent).toContain("Selecionar fotos");
    expect(pickerButton().disabled).toBe(false);
    expect(container.textContent).toContain("Falhou");
    expect(container.textContent).toMatch(/Verifique a conexão/);

    const uploaded = { ...CART, media: [{ id: "m1" }] } as unknown as Cart;
    uploadPhoto.mockResolvedValueOnce({ cart: uploaded });
    await act(async () => {
      buttonByText("Tentar de novo")!.click();
    });

    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(onCartUpdated).toHaveBeenCalledWith(uploaded);
    expect(container.textContent).not.toContain("Falhou");
    expect(buttonByText("Tentar de novo")).toBeUndefined();
  });

  it("prazo esgotado no envio: mensagem específica", async () => {
    uploadPhoto.mockRejectedValueOnce(new RequestTimeoutError());
    await selectPhoto();
    expect(container.textContent).toMatch(/demorou demais/);
    expect(pickerButton().disabled).toBe(false);
  });

  it("erro inesperado na validação também não prende a tela", async () => {
    validateImageFile.mockRejectedValueOnce(new Error("boom"));
    await selectPhoto();
    expect(pickerButton().textContent).toContain("Selecionar fotos");
    expect(container.textContent).toContain("Falhou");
  });

  it("fallback com o arquivo original envia sem dimensões", async () => {
    preparePhotoForUpload.mockImplementationOnce(async (file: File) => ({
      blob: file,
      original: true,
    }));
    uploadPhoto.mockResolvedValueOnce({ cart: CART });
    await selectPhoto();
    expect(uploadPhoto).toHaveBeenCalledWith("cart-1", "tok", expect.any(File), undefined);
  });
});
