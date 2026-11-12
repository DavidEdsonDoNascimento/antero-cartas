// @vitest-environment jsdom
/**
 * "Compartilhar que ganhei": só a prévia pública sai daqui, nunca o link da
 * carta. Nativo quando há, WhatsApp e copiar sempre; carta antiga cria o link
 * ao abrir a folha (POST), não no toque de compartilhar.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PublicPreviewDTO } from "@/lib/publicPreview";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/components/presentation/fonts", () => ({ presentationFontVars: "" }));
const { GiftShareButton } = await import("./GiftShareButton");

const SLUG = "slugprivadodacartinha2345";
const GIFT = "https://cartas.test/presente/abcdefghijkmnpqrstuvwxyz23";
const PREVIEW: PublicPreviewDTO = {
  style: "romantico",
  effect: "petalas",
  content: "full",
  recipientFirstName: "Ana",
  excerpt: { text: "Hoje faz um ano", truncated: false },
  photo: null,
  hasMusic: true,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  // @ts-expect-error limpeza do teste
  delete navigator.share;
});

const body = () => document.body;
const btn = (label: string) =>
  [...body().querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

async function render(initialUrl: string | null) {
  await act(async () => root.render(<GiftShareButton slug={SLUG} initialUrl={initialUrl} preview={PREVIEW} />));
  await act(async () => btn("Compartilhar que ganhei").click());
}

describe("GiftShareButton", () => {
  it("mostra o que vai aparecer e oferece WhatsApp e copiar com a URL pública (nunca o slug)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await render(GIFT);
    expect(body().textContent).toContain("Quem abrir o link verá a primeira foto e o começo da mensagem");
    expect(body().textContent).toContain("Para Ana");
    const wa = body().querySelector<HTMLAnchorElement>('a[href*="wa.me"]')!;
    expect(decodeURIComponent(wa.href)).toContain(GIFT);
    expect(body().innerHTML).not.toContain(SLUG);
    await act(async () => btn("Copiar link").click());
    expect(writeText).toHaveBeenCalledWith(GIFT);
    expect(body().textContent).toContain("Link copiado");
  });

  it("usa o compartilhamento do aparelho quando existe", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    await render(GIFT);
    await act(async () => btn("Compartilhar").click());
    const shareButton = [...body().querySelectorAll("button")].find((b) => b.textContent === "Compartilhar")!;
    await act(async () => shareButton.click());
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: GIFT }));
  });

  it("carta antiga: cria o link ao abrir a folha, uma vez, pelo POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: GIFT }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await render(null);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith(`/api/letters/${SLUG}/public-link`, { method: "POST" });
    expect(decodeURIComponent(body().querySelector<HTMLAnchorElement>('a[href*="wa.me"]')!.href)).toContain(GIFT);
  });

  it("falha ao criar o link: explica e deixa tentar de novo, sem link quebrado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    await render(null);
    await act(async () => {});
    expect(body().querySelector('[role="alert"]')?.textContent).toContain("Não foi possível preparar o link");
    expect(body().querySelector('a[href*="wa.me"]')).toBeNull();
  });

  it("Esc fecha a folha", async () => {
    await render(GIFT);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(body().querySelector('[role="dialog"]')).toBeNull();
  });
});
