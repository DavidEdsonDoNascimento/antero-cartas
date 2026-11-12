// @vitest-environment jsdom
/**
 * Auto-avanço do carrossel de fotos nas cartas publicadas (legada e 2.0).
 *
 * O carrossel é o MESMO componente nos dois renderizadores (`CardPreview` ←
 * `CardExperience`, e `LetterSheet` ← `RecipientExperience`), então o contrato é
 * fixado nele e depois conferido pelos dois caminhos reais.
 *
 * Contrato: um timer vivo por vez; cada troca (automática ou manual) agenda a
 * próxima um intervalo inteiro depois; re-render do pai não reinicia nada; pausa
 * só por aba oculta, fora da tela, movimento reduzido ou foco de teclado — NUNCA
 * por hover/toque (era o que deixava a carta "parada").
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CartMedia } from "@/lib/types";
import { demoCart } from "@/content/demoCart";
import { getPreset } from "@/content/presentation/presets";
import { framingStyle } from "@/lib/photoFraming";
import { PhotoCarousel } from "./PhotoCarousel";
import { CardExperience } from "./CardExperience";
import { RecipientExperience } from "@/components/presentation/RecipientExperience";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const INTERVAL = 3000;

let container: HTMLDivElement;
let root: Root;
let reduced = false;
let observers: { cb: IntersectionObserverCallback; el: Element }[] = [];

/** IntersectionObserver controlável: nada dispara sozinho; o teste decide. */
function reportIntersecting(isIntersecting: boolean, within?: Element) {
  for (const o of observers) {
    if (within && !within.contains(o.el)) continue;
    act(() => o.cb([{ isIntersecting, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver));
  }
}

function setTabHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  observers = [];
  window.matchMedia = ((q: string) => ({
    matches: q.includes("reduce") && reduced,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setTabHidden(false);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function photo(n: number, framing: CartMedia["framing"] = null): CartMedia {
  return {
    id: `m${n}`,
    cartId: "cart_1",
    type: "photo",
    url: `https://exemplo/m${n}.jpg`,
    storageKey: null,
    position: n - 1,
    framing,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(i + 1));

function carousel(media: CartMedia[], props: Partial<Parameters<typeof PhotoCarousel>[0]> = {}) {
  return <PhotoCarousel media={media} accent="#000" mutedColor="#666" autoAdvance {...props} />;
}
function mount(node: React.ReactElement) {
  act(() => root.render(node));
}
function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
/** Índice exibido, lido do indicador (a mesma fonte que a pessoa vê). */
function shown(scope: ParentNode = container): number {
  return [...scope.querySelectorAll("[aria-current]")].findIndex((b) => b.getAttribute("aria-current") === "true");
}
function click(label: string) {
  const b = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  act(() => b.click());
}

describe("PhotoCarousel — auto-avanço", () => {
  it("1. uma foto: sem timer e sem transição", () => {
    mount(carousel(photos(1)));
    expect(vi.getTimerCount()).toBe(0);
    tick(INTERVAL * 5);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("[aria-current]")).toBeNull();
  });

  it("2. duas fotos: avança sozinha depois do intervalo (e não antes)", () => {
    mount(carousel(photos(2)));
    expect(shown()).toBe(0);
    tick(INTERVAL - 1);
    expect(shown()).toBe(0);
    tick(1);
    expect(shown()).toBe(1);
  });

  it("3. três fotos: 1 → 2 → 3 em sequência", () => {
    mount(carousel(photos(3)));
    const seen = [shown()];
    for (let i = 0; i < 2; i++) {
      tick(INTERVAL);
      seen.push(shown());
    }
    expect(seen).toEqual([0, 1, 2]);
  });

  it("4. na última foto volta para a primeira e segue girando", () => {
    mount(carousel(photos(3)));
    for (let i = 0; i < 3; i++) tick(INTERVAL); // um passo por vez: o React re-renderiza entre eles
    expect(shown()).toBe(0);
    tick(INTERVAL);
    expect(shown()).toBe(1);
  });

  it("5. seta próxima avança uma foto", () => {
    mount(carousel(photos(3)));
    click("Próxima foto");
    expect(shown()).toBe(1);
  });

  it("6. seta anterior volta uma foto (e da primeira vai para a última)", () => {
    mount(carousel(photos(3)));
    click("Foto anterior");
    expect(shown()).toBe(2);
    click("Foto anterior");
    expect(shown()).toBe(1);
  });

  it("7. depois de interação manual o autoplay continua, sem salto duplicado", () => {
    mount(carousel(photos(3)));
    tick(INTERVAL - 500); // quase na hora de trocar…
    click("Próxima foto"); // …e a pessoa avança manualmente
    expect(shown()).toBe(1);
    tick(INTERVAL - 1); // o timer antigo NÃO pode disparar agora
    expect(shown()).toBe(1);
    tick(1); // um intervalo inteiro depois da interação
    expect(shown()).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("7b. clicar no indicador também reagenda a partir do clique", () => {
    mount(carousel(photos(3)));
    tick(INTERVAL - 100);
    click("Ir para a foto 3");
    expect(shown()).toBe(2);
    tick(INTERVAL);
    expect(shown()).toBe(0);
  });

  it("8. desmontar remove o timer", () => {
    mount(carousel(photos(3)));
    expect(vi.getTimerCount()).toBe(1);
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container); // o afterEach desmonta de novo
  });

  it("9. remontar não acumula intervalos", () => {
    for (let i = 0; i < 4; i++) {
      mount(carousel(photos(3)));
      act(() => root.unmount());
      root = createRoot(container);
    }
    mount(carousel(photos(3)));
    expect(vi.getTimerCount()).toBe(1);
    tick(INTERVAL);
    expect(shown()).toBe(1); // um único passo, não vários
  });

  it("10. re-render do pai (props novas a cada vez) não reinicia nem duplica o timer", () => {
    mount(carousel(photos(3)));
    tick(INTERVAL - 500);
    // O pai re-renderiza (ex.: contador "Juntos há" a cada segundo), com array novo.
    for (let i = 0; i < 10; i++) mount(carousel(photos(3), { tilt: -1.5 }));
    expect(vi.getTimerCount()).toBe(1);
    tick(500); // se o re-render reiniciasse o timer, ainda seria 0
    expect(shown()).toBe(1);
  });

  it("11. aba oculta pausa; ao voltar, retoma", () => {
    mount(carousel(photos(3)));
    setTabHidden(true);
    expect(vi.getTimerCount()).toBe(0);
    tick(INTERVAL * 3);
    expect(shown()).toBe(0);
    setTabHidden(false);
    tick(INTERVAL);
    expect(shown()).toBe(1);
  });

  it("12. movimento reduzido: nenhuma troca automática (a manual segue)", () => {
    reduced = true;
    mount(carousel(photos(3)));
    expect(vi.getTimerCount()).toBe(0);
    tick(INTERVAL * 3);
    expect(shown()).toBe(0);
    click("Próxima foto");
    expect(shown()).toBe(1);
  });

  it("fora da tela não conta tempo; ao aparecer, a primeira foto ganha o intervalo inteiro", () => {
    mount(carousel(photos(3)));
    reportIntersecting(false);
    tick(INTERVAL * 4);
    expect(shown()).toBe(0);
    reportIntersecting(true);
    tick(INTERVAL - 1);
    expect(shown()).toBe(0);
    tick(1);
    expect(shown()).toBe(1);
  });

  it("autoAdvance desligado (prévia do editor): sem timer", () => {
    mount(carousel(photos(3), { autoAdvance: false }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("REGRESSÃO: hover/ponteiro e clique na foto NÃO deixam o carrossel parado", () => {
    mount(carousel(photos(3)));
    const group = container.querySelector<HTMLElement>('[role="group"]')!;
    act(() => {
      group.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
      group.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 10 }));
      group.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: 10 }));
      // Foco por clique/toque (não é :focus-visible).
      group.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    tick(INTERVAL);
    expect(shown()).toBe(1);
    tick(INTERVAL);
    expect(shown()).toBe(2);
  });

  it("foco de teclado pausa; sair do carrossel retoma", () => {
    mount(carousel(photos(3)));
    const group = container.querySelector<HTMLElement>('[role="group"]')!;
    const real = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, sel: string) {
      return sel === ":focus-visible" ? true : real.call(this, sel);
    });
    act(() => {
      group.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    tick(INTERVAL * 3);
    expect(shown()).toBe(0);
    act(() => {
      group.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    });
    tick(INTERVAL);
    expect(shown()).toBe(1);
  });
});

describe("enquadramento e metadados", () => {
  it("15. o autoplay só muda o índice: ordem, moldura e enquadramento das fotos ficam intactos", () => {
    const media = [
      photo(1, null),
      photo(2, { x: 0.5, y: 0.12, zoom: 1.6 }),
      photo(3, { x: 0.2, y: 0.8, zoom: 1 }),
    ];
    mount(carousel(media));
    const frameOf = () => [...container.querySelectorAll("img")].map((i) => [i.alt, i.getAttribute("src"), i.style.objectPosition, i.style.transform]);
    const before = frameOf();
    tick(INTERVAL * 4);
    const after = frameOf();
    expect(after).toEqual(before);
    media.forEach((m, i) => {
      const img = container.querySelectorAll("img")[i];
      expect(img.style.objectPosition).toBe(framingStyle(m.framing).objectPosition ?? "");
    });
    expect([...container.querySelectorAll("img")].map((i) => i.alt)).toEqual(["Foto 1 de 3", "Foto 2 de 3", "Foto 3 de 3"]);
  });
});

describe("cartas publicadas pelos dois caminhos de renderização", () => {
  it("13. carta LEGADA: abre o envelope, não clica em nada e as fotos avançam", () => {
    const cart = demoCart();
    mount(<CardExperience cart={{ ...cart, showRelationshipCounter: true }} share={null} />);
    expect(container.querySelector('[role="group"]')).toBeNull(); // envelope fechado
    const open = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Abrir"))!;
    act(() => open.click());
    expect(shown()).toBe(0);
    tick(INTERVAL);
    expect(shown()).toBe(1);
    tick(INTERVAL);
    expect(shown()).toBe(2);
    tick(INTERVAL);
    expect(shown()).toBe(0);
    // O contador "Juntos há" re-renderiza a carta a cada segundo: um timer só.
    expect(vi.getTimerCount()).toBeLessThanOrEqual(3); // carrossel + contador (+ nenhum extra)
  });

  describe("14. carta 2.0 (RecipientExperience)", () => {
    const preset = getPreset("romantico");
    const cart = demoCart();
    const letter = { ...cart, music: null };
    const experience = (preview = false) => (
      <RecipientExperience
        letter={letter}
        preset={preset}
        effect="petalas"
        scene={null}
        envelope={null}
        share={null}
        preview={preview}
      />
    );

    it("a folha já existe escondida: só conta tempo depois de aberta, e o envelope não reinicia", () => {
      mount(experience());
      const sheet = container.querySelector<HTMLElement>(".ps-open")!;
      expect(sheet.hidden).toBe(true);
      reportIntersecting(false, sheet); // escondida = fora da tela
      tick(INTERVAL * 3);
      expect(shown(sheet)).toBe(0);

      act(() => container.querySelector<HTMLButtonElement>(".ps-stage__hit")!.click());
      tick(1900); // animação de abertura
      expect(sheet.hidden).toBe(false);
      expect(container.querySelector(".ps-closed")).toBeNull();
      reportIntersecting(true, sheet);

      expect(shown(sheet)).toBe(0); // começa pela primeira foto
      tick(INTERVAL);
      expect(shown(sheet)).toBe(1);
      tick(INTERVAL);
      expect(shown(sheet)).toBe(2);
      tick(INTERVAL);
      expect(shown(sheet)).toBe(0);
      expect(container.querySelector(".ps-closed")).toBeNull(); // trocar foto não reabre nada
    });

    it("navegação manual não derruba o autoplay na carta 2.0", () => {
      mount(experience());
      act(() => container.querySelector<HTMLButtonElement>(".ps-stage__hit")!.click());
      tick(1900);
      click("Próxima foto");
      expect(shown()).toBe(1);
      tick(INTERVAL);
      expect(shown()).toBe(2);
    });

    it("prévia do editor (preview): fotos paradas, sem timer do carrossel", () => {
      mount(experience(true));
      const before = vi.getTimerCount();
      act(() => container.querySelector<HTMLButtonElement>(".ps-stage__hit")!.click());
      tick(1900);
      tick(INTERVAL * 3);
      expect(shown()).toBe(0);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(before);
    });
  });
});

describe("16. /presente/ continua sem carrossel", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  it.each(["src/components/share/PublicGiftView.tsx", "src/components/share/GiftPeek.tsx", "src/app/presente/[publicId]/page.tsx"])(
    "%s não usa carrossel nem timer",
    (rel) => {
      let source: string;
      try {
        source = readFileSync(path.join(ROOT, rel), "utf8");
      } catch {
        return; // rota com outro nome: a fronteira estrutural em shareBoundary.test.ts cobre a pasta inteira
      }
      expect(source).not.toMatch(/PhotoCarousel|autoAdvance|setInterval|setTimeout/);
    },
  );
});
