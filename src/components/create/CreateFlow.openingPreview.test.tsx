// @vitest-environment jsdom
/**
 * "Ver como vai abrir" no editor: demonstração fiel da carta recebida.
 *
 * Depois do clique no envelope as fotos passam sozinhas (3000 ms) e a música
 * toca no player da própria folha. Ao sair — botão, Esc, Voltar do navegador ou
 * sair de /criar — o preview é desmontado: player e timers somem, o rascunho
 * (inclusive a música escolhida) continua igual e nada é salvo. Reabrir começa
 * com o envelope fechado e sem player até um novo clique.
 *
 * A prévia INLINE (ao lado do editor) continua parada e muda.
 *
 * Só a rede é simulada: editor, prévia, abertura e carrossel são reais.
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
const INTERVAL = 3000;
const OPENING_MS = 1900;

const MUSIC: SelectedMusic = {
  videoId: "aaaaaaaaaaa",
  youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
  title: "Nossa música",
  channelTitle: "Canal",
  source: "search",
};

const photo = (n: number): CartMedia => ({
  id: `m${n}`,
  cartId: "cart-1",
  type: "photo",
  url: `https://exemplo/m${n}.jpg`,
  storageKey: `k${n}`,
  position: n - 1,
  framing: null,
  createdAt: "2026-11-01T00:00:00.000Z",
});

const CART: Cart = {
  id: "cart-1",
  slug: null,
  status: "DRAFT",
  recipientType: "namorada",
  recipientName: "Anna",
  occasion: null,
  title: "",
  message: "Hoje faz um ano que a nossa história começou.",
  senderName: "Lucas",
  signature: "Com amor",
  theme: "romantico",
  music: MUSIC,
  relationshipStartDate: null,
  showRelationshipCounter: false,
  planType: null,
  presentation: "romantico",
  presentationOptions: null,
  publicId: null,
  sharePreviewVersion: 1,
  media: [photo(1), photo(2), photo(3)],
  expiresAt: null,
  publishedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;
let observers: { cb: IntersectionObserverCallback; el: Element }[] = [];

/** Como no navegador: o que está dentro de um `hidden` não intersecta a tela. */
function syncIntersections() {
  for (const o of observers) {
    const isIntersecting = !o.el.closest("[hidden]");
    act(() => o.cb([{ isIntersecting, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver));
  }
}

const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

/** O editor já salva o título automático ao abrir; o que importa é que o PREVIEW não salve mais nada. */
async function settledSaves() {
  await tick(5000);
  return patchCart.mock.calls.length;
}

function button(label: string | RegExp, scope: ParentNode = container): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find((b) =>
    typeof label === "string" ? b.textContent?.includes(label) : label.test(b.textContent ?? ""),
  );
  if (!found) throw new Error(`Botão não encontrado: ${label}\n${container.textContent}`);
  return found;
}
async function click(label: string | RegExp, scope?: ParentNode) {
  await act(async () => button(label, scope).click());
}

const inline = () => container.querySelector('[data-testid="letter-preview"]') as HTMLElement;
const preview = () => document.querySelector('[role="dialog"][aria-label="Prévia da abertura"]') as HTMLElement | null;
/** Índice da foto exibida, lido do indicador (o que a pessoa vê). */
const shown = (scope: ParentNode) =>
  [...scope.querySelectorAll("[aria-current]")].findIndex((b) => b.getAttribute("aria-current") === "true");
/** Player de música da carta (a prévia do painel Música tem outro título). */
const letterPlayers = () => document.querySelectorAll('iframe[title="Música da cartinha"]');
const anyPlayers = () => document.querySelectorAll("iframe");
const envelope = () => preview()!.querySelector<HTMLButtonElement>("button.ps-stage__hit")!;

async function openEditor(cart: Cart = CART) {
  window.history.replaceState(null, "", "/criar?etapa=ver");
  localStorage.setItem("antero:session", JSON.stringify(SESSION));
  fetchCart.mockResolvedValue({ cart });
  await act(async () => root.render(<CreateFlow />));
  await tick();
}

async function openPreview() {
  await click(/Ver como Anna vai abrir/);
  expect(preview()).not.toBeNull();
  syncIntersections(); // envelope fechado: a folha escondida está fora da tela
}

/** Clique real no envelope e fim da animação de abertura. */
async function openEnvelope() {
  await act(async () => envelope().click());
  await tick(OPENING_MS);
  syncIntersections(); // a folha apareceu
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  resetCartInitPrefetch();
  patchCart.mockImplementation(async () => ({ cart: CART }));
  observers = [];
  globalThis.IntersectionObserver = class {
    constructor(private cb: IntersectionObserverCallback) {}
    observe(el: Element) {
      observers.push({ cb: this.cb, el });
    }
    disconnect() {
      observers = observers.filter((o) => o.cb !== this.cb);
    }
    unobserve() {}
  } as unknown as typeof IntersectionObserver;
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
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

describe("prévia inline do editor", () => {
  it("fotos estáticas (sem autoplay) e sem player, com a navegação manual funcionando", async () => {
    await openEditor();
    expect(shown(inline())).toBe(0);
    await tick(INTERVAL * 4);
    expect(shown(inline())).toBe(0);
    expect(anyPlayers()).toHaveLength(0);
    await act(async () => inline().querySelector<HTMLButtonElement>('[aria-label="Próxima foto"]')!.click());
    expect(shown(inline())).toBe(1);
    await tick(INTERVAL * 4);
    expect(shown(inline())).toBe(1);
    expect(anyPlayers()).toHaveLength(0);
  });

  it("com o preview completo aberto, a inline continua parada e muda", async () => {
    await openEditor();
    await openPreview();
    await openEnvelope();
    await tick(INTERVAL * 2);
    expect(shown(inline())).toBe(0);
    expect(inline().querySelector("iframe")).toBeNull();
  });
});

describe("preview completo: abertura", () => {
  it("fechado: sem player e sem autoplay (o timer não conta com o envelope fechado)", async () => {
    await openEditor();
    await openPreview();
    expect(preview()!.querySelector('[data-state="closed"]')).not.toBeNull();
    expect(anyPlayers()).toHaveLength(0);
    await tick(INTERVAL * 4);
    expect(anyPlayers()).toHaveLength(0);
    expect(shown(preview()!)).toBe(0);
  });

  it("depois do clique: um player com autoplay, no próprio gesto, e fotos passando a cada 3000 ms", async () => {
    await openEditor();
    await openPreview();
    // O iframe existe já no `click` (dentro do gesto do usuário), antes de a animação acabar.
    await act(async () => envelope().click());
    const frame = preview()!.querySelector<HTMLIFrameElement>("#musica-da-cartinha iframe");
    expect(frame?.src).toContain(`/embed/${MUSIC.videoId}`);
    expect(frame?.src).toContain("autoplay=1");
    await tick(OPENING_MS);
    syncIntersections();
    expect(letterPlayers()).toHaveLength(1);
    expect(anyPlayers()).toHaveLength(1); // um só player

    expect(shown(preview()!)).toBe(0);
    await tick(INTERVAL);
    expect(shown(preview()!)).toBe(1);
    await tick(INTERVAL);
    expect(shown(preview()!)).toBe(2);
    await tick(INTERVAL);
    expect(shown(preview()!)).toBe(0); // volta à primeira
  });

  it("setas e indicadores manuais continuam valendo", async () => {
    await openEditor();
    await openPreview();
    await openEnvelope();
    const arrow = preview()!.querySelector<HTMLButtonElement>('[aria-label="Próxima foto"]')!;
    await act(async () => arrow.click());
    expect(shown(preview()!)).toBe(1);
    await act(async () => preview()!.querySelector<HTMLButtonElement>('[aria-label="Ir para a foto 3"]')!.click());
    expect(shown(preview()!)).toBe(2);
    await tick(INTERVAL);
    expect(shown(preview()!)).toBe(0);
  });

  it("sem música escolhida: abre e passa as fotos, sem player", async () => {
    await openEditor({ ...CART, music: null });
    await openPreview();
    await openEnvelope();
    await tick(INTERVAL);
    expect(shown(preview()!)).toBe(1);
    expect(anyPlayers()).toHaveLength(0);
  });

  it("sem compartilhar, sem convite de criação e sem salvar nada", async () => {
    await openEditor();
    const saves = await settledSaves();
    await openPreview();
    await openEnvelope();
    await tick(5000);
    expect(preview()!.textContent).not.toContain("Compartilhar que ganhei");
    expect(preview()!.querySelector(".ps-invite")).toBeNull();
    expect(preview()!.textContent).not.toContain("Toca quando o envelope abrir");
    expect(patchCart).toHaveBeenCalledTimes(saves);
  });
});

describe("preview completo: sair encerra player e timers e preserva o rascunho", () => {
  /** Timers vivos com o editor parado e o preview fechado: a linha de base. */
  async function baseline() {
    const saves = await settledSaves();
    return { timers: vi.getTimerCount(), saves };
  }

  async function startedPreview() {
    await openEditor();
    const base = await baseline();
    await openPreview();
    await openEnvelope();
    expect(letterPlayers()).toHaveLength(1);
    await tick(INTERVAL);
    expect(shown(preview()!)).toBe(1);
    return base;
  }

  async function expectClean(base: { timers: number; saves: number }) {
    expect(preview()).toBeNull();
    expect(anyPlayers()).toHaveLength(0);
    expect(document.body.style.overflow).toBe("");
    await tick(INTERVAL * 4); // se sobrasse um timer, a foto da prévia inline andaria
    expect(shown(inline())).toBe(0);
    expect(anyPlayers()).toHaveLength(0);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(base.timers);
    // rascunho intacto: nada foi salvo e a música escolhida continua lá
    expect(patchCart).toHaveBeenCalledTimes(base.saves);
    expect(container.textContent).toContain("Nossa música");
  }

  /** Reabre: envelope fechado, sem player, e a música volta só com um novo clique. */
  async function expectReopenIsFresh() {
    await openPreview();
    expect(preview()!.querySelector('[data-state="closed"]')).not.toBeNull();
    expect(anyPlayers()).toHaveLength(0);
    await tick(INTERVAL * 3);
    expect(anyPlayers()).toHaveLength(0);
    expect(shown(preview()!)).toBe(0);
    await openEnvelope();
    expect(letterPlayers()).toHaveLength(1);
    await tick(INTERVAL);
    expect(shown(preview()!)).toBe(1);
  }

  it('botão "Voltar para a edição"', async () => {
    const base = await startedPreview();
    await click("Voltar para a edição", preview()!);
    await expectClean(base);
    await expectReopenIsFresh();
  });

  it("Esc", async () => {
    const base = await startedPreview();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await expectClean(base);
    await expectReopenIsFresh();
  });

  it("Voltar do navegador", async () => {
    const base = await startedPreview();
    await act(async () => {
      window.history.replaceState(null, "", "/criar?etapa=ver");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expectClean(base);
    await expectReopenIsFresh();
  });

  it("fechar com o envelope ainda fechado também não deixa nada", async () => {
    await openEditor();
    const base = await baseline();
    await openPreview();
    await click("Voltar para a edição", preview()!);
    await expectClean(base);
  });

  it("fechar no meio da animação de abertura (player já montado no clique)", async () => {
    await openEditor();
    const base = await baseline();
    await openPreview();
    await act(async () => envelope().click());
    expect(letterPlayers()).toHaveLength(1);
    await tick(500);
    await click("Voltar para a edição", preview()!);
    await expectClean(base);
  });

  it("sair de /criar (desmontar o editor) destrói o player e os timers", async () => {
    await openEditor();
    await openPreview();
    await openEnvelope();
    expect(letterPlayers()).toHaveLength(1);
    await act(async () => root.unmount());
    root = createRoot(container);
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("prévia musical do painel Música continua separada", () => {
  it("ouvir no painel não é o player da abertura, e fechar o painel a encerra", async () => {
    await openEditor();
    await click("Música");
    const panel = [...container.querySelectorAll('[role="dialog"]')].find((d) => d.querySelector("h2")?.textContent === "Música")!;
    await click("Ouvir prévia", panel);
    expect(document.querySelectorAll('iframe[title="Prévia da música"]')).toHaveLength(1);
    await click("Pronto", panel);
    await tick(100); // o "voltar" do histórico termina antes de abrir o preview
    expect(document.querySelectorAll('iframe[title="Prévia da música"]')).toHaveLength(0);
    // e depois disso o preview completo ainda abre com um só player
    await openPreview();
    await openEnvelope();
    expect(anyPlayers()).toHaveLength(1);
    expect(letterPlayers()).toHaveLength(1);
  });
});
