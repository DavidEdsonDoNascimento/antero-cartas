// @vitest-environment jsdom
/**
 * Painéis de "Deixar mais especial" — regressões vistas no teste manual da 2.0.
 *
 * 1. Foco: o painel levava o foco de volta ao título a cada render do editor
 *    (cada tecla, cada "Salvando…"), porque o efeito de abertura dependia de um
 *    `onClose` recriado a cada render. Quem digitava a frase de assinatura
 *    precisava clicar no campo de novo depois de cada letra.
 * 2. Música: os painéis ficam sempre montados (só `hidden`, por causa da fila de
 *    fotos), e a prévia do YouTube continuava tocando com o painel fechado.
 *
 * Só a rede é simulada: editor, painéis, prévia da carta e seletor de música são reais.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Cart, CartMedia, SelectedMusic } from "@/lib/types";

const patchCart = vi.fn();
const fetchCart = vi.fn();
const uploadPhoto = vi.fn();

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  patchCart: (...args: unknown[]) => patchCart(...args),
  fetchCart: (...args: unknown[]) => fetchCart(...args),
  uploadPhoto: (...args: unknown[]) => uploadPhoto(...args),
}));
vi.mock("@/lib/image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image")>()),
  createPhotoReader: (file: File) => ({ prefetch: () => {}, read: async () => file }),
  preparePhotoForUpload: async (file: File) => ({ blob: file, original: false }),
}));

const { CreateFlow } = await import("./CreateFlow");
const { resetCartInitPrefetch } = await import("@/lib/draftInit");

const SESSION = { cartId: "cart-1", editToken: "tok" };

const MUSIC: SelectedMusic = {
  videoId: "aaaaaaaaaaa",
  youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
  title: "Nossa música",
  channelTitle: "Canal",
  source: "search",
};

const CART: Cart = {
  id: "cart-1",
  slug: null,
  status: "DRAFT",
  recipientType: "mae",
  recipientName: "Ana",
  occasion: "aniversario",
  title: "",
  message: "Hoje faz um ano que a nossa história começou.",
  senderName: "",
  signature: "",
  theme: "romantico",
  music: null,
  relationshipStartDate: null,
  showRelationshipCounter: false,
  planType: null,
  presentation: "papel-luz",
  presentationOptions: null,
  publicId: null,
  sharePreviewVersion: 1,
  media: [],
  expiresAt: null,
  publishedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let container: HTMLDivElement;
let root: Root;

const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
const text = () => container.textContent ?? "";

function button(label: string | RegExp, scope: ParentNode = container): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find((b) =>
    typeof label === "string" ? b.textContent?.includes(label) : label.test(b.textContent ?? ""),
  );
  if (!found) throw new Error(`Botão não encontrado: ${label}\n${text()}`);
  return found;
}

async function click(label: string | RegExp, scope?: ParentNode) {
  await act(async () => button(label, scope).click());
}

const setValue = (el: HTMLInputElement, value: string) =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);

/**
 * Digita como o teclado: insere no cursor (substituindo a seleção) e dispara
 * `input`. Depois de cada tecla, o foco tem de continuar no MESMO elemento.
 */
async function typeKeys(el: HTMLInputElement, keys: string, { between = 0 } = {}) {
  for (const ch of keys) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    await act(async () => {
      setValue(el, el.value.slice(0, start) + ch + el.value.slice(end));
      el.setSelectionRange(start + 1, start + 1);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    if (between) await tick(between);
    expect(document.activeElement).toBe(el);
  }
}

/** Colar ou apagar: o valor inteiro muda de uma vez, com o cursor em `caret`. */
async function replaceValue(el: HTMLInputElement, value: string, caret = value.length) {
  await act(async () => {
    setValue(el, value);
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const field = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const dialog = (title: string) =>
  [...container.querySelectorAll('[role="dialog"]')].find((d) => d.querySelector("h2")?.textContent === title)!;
const panelOpen = (title: string) => !dialog(title).parentElement!.hidden;

async function openEditor(cart: Cart = CART, url = "/criar") {
  window.history.replaceState(null, "", url);
  localStorage.setItem("antero:session", JSON.stringify(SESSION));
  fetchCart.mockResolvedValue({ cart });
  await act(async () => root.render(<CreateFlow />));
  await tick();
}

function serverAccepts() {
  let n = 0;
  return async (_id: string, _token: string, patch: Partial<Cart>) => ({
    cart: { ...CART, ...patch, updatedAt: `2026-11-01T00:00:${String(++n % 60).padStart(2, "0")}.000Z` },
  });
}

/** O que o servidor recebeu por último para um campo. */
const lastSaved = (key: keyof Cart) =>
  patchCart.mock.calls.map((c) => c[2] as Partial<Cart>).filter((p) => key in p).at(-1)?.[key];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  resetCartInitPrefetch();
  patchCart.mockImplementation(serverAccepts());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("Título e assinatura: o foco fica no campo durante a digitação", () => {
  async function openSignaturePanel() {
    await openEditor(CART, "/criar?etapa=ver");
    await click("Título e assinatura");
    // Ao abrir, o foco vai para o título do painel (leitores de tela ouvem onde estão).
    expect(document.activeElement?.textContent).toBe("Título e assinatura");
  }

  async function focus(el: HTMLInputElement) {
    await act(async () => el.focus());
    expect(document.activeElement).toBe(el);
  }

  it("frase longa, caractere por caractere, com o preview e o autosave atualizando", async () => {
    await openSignaturePanel();
    const input = field("Frase de assinatura");
    await focus(input);

    const phrase = "Com amor, para sempre, da pessoa que mais te admira"; // 51 de 60
    await typeKeys(input, phrase, { between: 120 });
    await tick(2000); // "Salvando…" → "✓ Salvo" também re-renderiza o editor

    expect(document.activeElement).toBe(input);
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe(phrase);
    expect(panelOpen("Título e assinatura")).toBe(true);
    // a prévia da carta mostra a assinatura
    expect(container.querySelector('aside[aria-label="Prévia da cartinha"]')?.textContent).toContain("Com amor, para sempre");
    expect(lastSaved("signature")).toBe(input.value);
  });

  it("digitação rápida (sem pausa entre as teclas) chega inteira", async () => {
    await openSignaturePanel();
    const input = field("Frase de assinatura");
    await focus(input);
    await typeKeys(input, "Sempre seu, Lucas");
    await tick(2000);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Sempre seu, Lucas");
  });

  it("colar, apagar parte, selecionar e continuar escrevendo", async () => {
    await openSignaturePanel();
    const input = field("Frase de assinatura");
    await focus(input);

    await replaceValue(input, "Com carinho, para sempre"); // colar
    expect(document.activeElement).toBe(input);

    await replaceValue(input, "Com carinho", 11); // apagar o fim
    await tick(800);
    expect(document.activeElement).toBe(input);

    input.setSelectionRange(4, 11); // seleciona "carinho" e escreve por cima
    await typeKeys(input, "amor");
    expect(input.value).toBe("Com amor");
    expect(input.selectionStart).toBe(8); // o cursor fica onde a pessoa parou
    await typeKeys(input, " eterno");
    await tick(2000);
    expect(input.value).toBe("Com amor eterno");
    expect(document.activeElement).toBe(input);
  });

  it("título automático, título personalizado e nome de quem envia", async () => {
    await openSignaturePanel();
    const title = field("Título da cartinha");
    expect(title.placeholder).toBe("Para Ana"); // automático enquanto vazio

    await focus(title);
    await typeKeys(title, "Feliz aniversário", { between: 50 });
    const sender = field("Nome de quem envia");
    await focus(sender);
    await typeKeys(sender, "Lucas", { between: 50 });
    await tick(2000);

    // personalizar o nome não sobrescreve o título escolhido
    expect(title.value).toBe("Feliz aniversário");
    expect(sender.value).toBe("Lucas");
    expect(document.activeElement).toBe(sender);
    expect(lastSaved("title")).toBe("Feliz aniversário");
    expect(lastSaved("senderName")).toBe("Lucas");

    // apagar o título volta ao automático
    await focus(title);
    await replaceValue(title, "");
    await tick(2000);
    expect(document.activeElement).toBe(title);
    expect(container.querySelector('aside[aria-label="Prévia da cartinha"]')?.textContent).toContain("Para Ana");
  });

  it("digitar com um salvamento em andamento e a resposta da rede atrasada", async () => {
    await openSignaturePanel();
    const slow = deferred<{ cart: Cart }>();
    patchCart.mockImplementationOnce(() => slow.promise);
    const input = field("Frase de assinatura");
    await focus(input);

    await typeKeys(input, "Com amor");
    await tick(1500); // o primeiro salvamento saiu e não voltou
    expect(text()).toContain("Salvando");
    await typeKeys(input, ", para sempre", { between: 200 });
    expect(document.activeElement).toBe(input);

    slow.resolve({ cart: { ...CART, signature: "Com amor", updatedAt: "2026-11-01T00:01:00.000Z" } });
    await tick(3000);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Com amor, para sempre"); // a resposta antiga não volta o texto
    expect(lastSaved("signature")).toBe("Com amor, para sempre");
    expect(text()).toContain("Salvo");
  });

  it("fechar e reabrir o painel; Esc continua fechando depois de digitar", async () => {
    await openSignaturePanel();
    const input = field("Frase de assinatura");
    await focus(input);
    await typeKeys(input, "Com amor");

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(panelOpen("Título e assinatura")).toBe(false);

    await click("Título e assinatura");
    expect(panelOpen("Título e assinatura")).toBe(true);
    expect(document.activeElement?.textContent).toBe("Título e assinatura");
    await focus(input);
    await typeKeys(input, " sempre", { between: 100 });
    expect(input.value).toBe("Com amor sempre");

    await click("Pronto", dialog("Título e assinatura"));
    expect(panelOpen("Título e assinatura")).toBe(false);
  });

  it("recarregar recupera a frase salva", async () => {
    await openSignaturePanel();
    const input = field("Frase de assinatura");
    await focus(input);
    await typeKeys(input, "Com amor, Lucas");
    await tick(2000);
    const saved = lastSaved("signature");
    expect(saved).toBe("Com amor, Lucas");

    await act(async () => root.unmount());
    root = createRoot(container);
    resetCartInitPrefetch();
    await openEditor({ ...CART, signature: saved as string }, "/criar?etapa=ver&painel=assinatura");
    expect(field("Frase de assinatura").value).toBe("Com amor, Lucas");
  });

  it("os outros campos dos painéis também não perdem o foco (pesquisa de música)", async () => {
    await openEditor(CART, "/criar?etapa=ver");
    await click("Música");
    const search = field("Pesquisar música no YouTube");
    await focus(search);
    await typeKeys(search, "per");
    expect(document.activeElement).toBe(search);
  });
});

describe("prévia da música: para quando a pessoa sai do painel", () => {
  const CART_MUSIC: Cart = { ...CART, music: MUSIC };
  const iframe = () => container.querySelector('iframe[title="Prévia da música"]') as HTMLIFrameElement | null;
  const musicDialog = () => dialog("Música");

  async function openMusicAndPlay(cart: Cart = CART_MUSIC) {
    await openEditor(cart, "/criar?etapa=ver");
    await click("Música");
    await click("Ouvir prévia", musicDialog());
    expect(iframe()?.src).toContain(`/embed/${MUSIC.videoId}`);
    expect(iframe()?.src).toContain("autoplay=1");
  }

  /** Reabre e confere: parada, com a mesma música e sem salvar nada. */
  async function expectStoppedOnReopen() {
    expect(iframe()).toBeNull();
    await click("Música");
    expect(panelOpen("Música")).toBe(true);
    expect(iframe()).toBeNull(); // não volta a tocar sozinha
    expect(button("Ouvir prévia", musicDialog()).getAttribute("aria-pressed")).toBe("false");
    expect(musicDialog().textContent).toContain("Nossa música");
    expect(patchCart).not.toHaveBeenCalled(); // fechar não gera salvamento
  }

  it("ouvir, pausar e ouvir de novo", async () => {
    await openMusicAndPlay();
    await click("Pausar prévia", musicDialog());
    expect(iframe()).toBeNull();
    await click("Ouvir prévia", musicDialog());
    expect(iframe()).not.toBeNull();
  });

  it("Pronto", async () => {
    await openMusicAndPlay();
    await click("Pronto", musicDialog());
    await expectStoppedOnReopen();
  });

  it("X", async () => {
    await openMusicAndPlay();
    await act(async () => (musicDialog().querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click());
    await expectStoppedOnReopen();
  });

  it("Esc", async () => {
    await openMusicAndPlay();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    await expectStoppedOnReopen();
  });

  it("toque no fundo escuro", async () => {
    await openMusicAndPlay();
    await act(async () => (musicDialog().parentElement as HTMLElement).click());
    await expectStoppedOnReopen();
  });

  it("Voltar do navegador", async () => {
    await openMusicAndPlay();
    await act(async () => {
      window.history.replaceState(null, "", "/criar?etapa=ver");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(panelOpen("Música")).toBe(false);
    await expectStoppedOnReopen();
  });

  it("navegar direto para outro painel", async () => {
    await openMusicAndPlay();
    await act(async () => {
      window.history.replaceState(null, "", "/criar?etapa=ver&painel=fotos");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(panelOpen("Fotos")).toBe(true);
    expect(iframe()).toBeNull();
  });

  it("Finalizar e voltar para Escrever", async () => {
    await openMusicAndPlay();
    await click("Pronto", musicDialog());
    await click("Está pronta · Finalizar");
    expect(text()).toContain("Finalizar");
    expect(iframe()).toBeNull();
    await click("← Voltar");
    await click("Editar texto");
    expect(iframe()).toBeNull();
  });

  it("sair de /criar destrói o player", async () => {
    await openMusicAndPlay();
    await act(async () => root.unmount());
    root = createRoot(container);
    expect(document.querySelector('iframe[title="Prévia da música"]')).toBeNull();
  });

  it("trocar de música encerra a prévia da anterior", async () => {
    await openMusicAndPlay();
    await click("Colar link", musicDialog());
    const link = field("Link do YouTube da música");
    await replaceValue(link, "https://youtu.be/bbbbbbbbbbb");
    expect(iframe()).toBeNull(); // a nova não começa sozinha
    expect(lastSaved("music") ?? null).toBeNull(); // ainda no debounce
    await tick(2000);
    expect((lastSaved("music") as SelectedMusic).videoId).toBe("bbbbbbbbbbb");
  });

  it("remover a música encerra a prévia", async () => {
    await openMusicAndPlay();
    await click("Remover música", musicDialog());
    expect(iframe()).toBeNull();
    expect(musicDialog().textContent).not.toContain("Ouvir prévia");
    await tick(2000);
    expect(lastSaved("music")).toBeNull();
  });

  it("sem música selecionada não há prévia nem player", async () => {
    await openEditor(CART, "/criar?etapa=ver");
    await click("Música");
    expect(iframe()).toBeNull();
    expect(musicDialog().textContent).not.toContain("Ouvir prévia");
  });

  it("com uma foto sendo enviada, fechar a música não para a fila de fotos", async () => {
    URL.createObjectURL = () => "blob:x";
    URL.revokeObjectURL = () => {};
    const upload = deferred<{ cart: Cart }>();
    uploadPhoto.mockImplementationOnce(() => upload.promise);
    await openEditor(CART_MUSIC, "/criar?etapa=ver");
    await click("Fotos");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["x"], "a.jpg", { type: "image/jpeg" })], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await tick();
    await click("Pronto", dialog("Fotos"));

    await click("Música");
    await click("Ouvir prévia", musicDialog());
    await click("Pronto", musicDialog());
    expect(iframe()).toBeNull();

    const photo: CartMedia = {
      id: "m1",
      cartId: "cart-1",
      type: "photo",
      url: "/api/media/carts/cart-1/m1.jpg",
      storageKey: "carts/cart-1/m1.jpg",
      position: 0,
      framing: null,
      createdAt: "2026-11-01T00:00:00.000Z",
    };
    upload.resolve({ cart: { ...CART_MUSIC, media: [photo] } });
    await tick();
    expect(text()).toContain("1 foto");
  });
});
