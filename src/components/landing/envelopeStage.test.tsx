// @vitest-environment jsdom
/**
 * Palco do envelope e vitrine de temas: comportamento no navegador.
 * A abertura só começa quando o palco entra na tela, "ver de novo" reinicia a
 * animação e o teclado troca de tema como numa lista de abas.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/components/card/CardPreview", () => ({
  CardPreview: ({ cart }: { cart: { theme: string } }) => <div data-testid="preview" data-theme={cart.theme} />,
}));

const { EnvelopeStage } = await import("./EnvelopeStage");
const { ThemeShowcase } = await import("./ThemeShowcase");

let container: HTMLDivElement;
let root: Root;
let observer: { cb: (entries: Array<{ isIntersecting: boolean }>) => void; disconnect: ReturnType<typeof vi.fn> } | null;

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  observer = null;
  class FakeIO {
    disconnect = vi.fn();
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
      observer = { cb, disconnect: this.disconnect };
    }
    observe() {}
  }
  vi.stubGlobal("IntersectionObserver", FakeIO);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const stage = () => container.querySelector(".pl-stage") as HTMLElement;

describe("EnvelopeStage", () => {
  it("nasce fechado e só abre quando entra na tela", async () => {
    await act(async () => root.render(<EnvelopeStage>cena</EnvelopeStage>));
    expect(stage().dataset.state).toBe("closed");

    await act(async () => observer!.cb([{ isIntersecting: false }]));
    expect(stage().dataset.state).toBe("closed");

    await act(async () => observer!.cb([{ isIntersecting: true }]));
    expect(stage().dataset.state).toBe("opening");
    expect(observer!.disconnect).toHaveBeenCalled(); // abre uma vez só
  });

  it("tocar no envelope reinicia a abertura, passando por um quadro fechado", async () => {
    await act(async () => root.render(<EnvelopeStage>cena</EnvelopeStage>));
    await act(async () => observer!.cb([{ isIntersecting: true }]));

    await act(async () => (container.querySelector(".pl-stage__hit") as HTMLButtonElement).click());
    expect(stage().dataset.state).toBe("closed");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(stage().dataset.state).toBe("opening");
  });

  it("sem IntersectionObserver, abre sozinho em vez de ficar fechado para sempre", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    await act(async () => root.render(<EnvelopeStage>cena</EnvelopeStage>));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(stage().dataset.state).toBe("opening");
  });
});

describe("ThemeShowcase", () => {
  const tabs = () => [...container.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
  const shown = () => container.querySelector('[data-testid="preview"]')!.getAttribute("data-theme");

  it("clicar em um tema mostra a mesma carta com aquele tema", async () => {
    await act(async () => root.render(<ThemeShowcase />));
    expect(shown()).toBe("romantico");

    await act(async () => tabs()[2].click());
    expect(shown()).toBe("delicado");
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "false", "true", "false"]);
  });

  it("setas, Home e End percorrem os temas, com foco rotativo", async () => {
    await act(async () => root.render(<ThemeShowcase />));
    const key = (k: string) =>
      act(async () => {
        tabs()[0].parentElement!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
      });

    await key("ArrowRight");
    expect(shown()).toBe("elegante");
    await key("End");
    expect(shown()).toBe("celebracao");
    await key("ArrowRight"); // dá a volta
    expect(shown()).toBe("romantico");
    await key("ArrowLeft");
    expect(shown()).toBe("celebracao");
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, -1, 0]);
  });

  it("o painel é ligado à aba selecionada", async () => {
    await act(async () => root.render(<ThemeShowcase />));
    const panel = container.querySelector('[role="tabpanel"]')!;
    const selected = tabs().find((t) => t.getAttribute("aria-selected") === "true")!;
    expect(panel.getAttribute("aria-labelledby")).toBe(selected.id);
    expect(selected.getAttribute("aria-controls")).toBe(panel.id);
  });
});
