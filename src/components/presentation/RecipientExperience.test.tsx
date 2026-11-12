// @vitest-environment jsdom
/**
 * Abertura da carta 2.0 (`RecipientExperience`): envelope fechado, abertura,
 * movimento reduzido, foco, música só depois do gesto e fallback sem JS.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPreset } from "@/content/presentation/presets";
import type { LetterContent } from "@/components/letter/LetterSheet";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
const { RecipientExperience } = await import("./RecipientExperience");

const LETTER: LetterContent = {
  title: "Para Ana",
  recipientName: "Ana",
  message: "Mensagem inteira da carta",
  senderName: "Lucas",
  signature: "Com carinho",
  media: [],
  music: { videoId: "abc123XYZab", youtubeUrl: "https://www.youtube.com/watch?v=abc123XYZab", title: "Canção", source: "manual" },
  relationshipStartDate: null,
  showRelationshipCounter: false,
};

let container: HTMLDivElement;
let root: Root;
let reduced = false;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  window.matchMedia = ((q: string) => ({
    matches: q.includes("reduce") && reduced,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof IntersectionObserver;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function render() {
  act(() =>
    root.render(
      <RecipientExperience
        letter={LETTER}
        preset={getPreset("romantico")}
        effect="petalas"
        scene={<div data-testid="scene" />}
        envelope={<div data-testid="envelope" />}
        share={<button type="button">Compartilhar que ganhei</button>}
      />,
    ),
  );
}

const openButton = () =>
  [...container.querySelectorAll("button")].find((b) => b.textContent === "Abrir minha carta")!;
const letterBlock = () => container.querySelector<HTMLElement>(".ps-open")!;

describe("RecipientExperience", () => {
  it("começa fechada: envelope, nome acessível, botão de abrir; carta no HTML mas escondida", () => {
    render();
    expect(container.querySelector('[data-state="closed"]')).not.toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Uma cartinha para Ana");
    expect(openButton()).toBeDefined();
    expect(letterBlock().hidden).toBe(true);
    expect(letterBlock().textContent).toContain("Mensagem inteira da carta");
    expect(container.querySelector("iframe")).toBeNull(); // música só depois do gesto
    expect(container.querySelector('.ps-fx[data-play]')).toBeNull();
  });

  it("sem JavaScript, o HTML do servidor traz a carta e o noscript que a mostra", () => {
    const html = renderToStaticMarkup(
      <RecipientExperience
        letter={LETTER}
        preset={getPreset("romantico")}
        effect="petalas"
        scene={null}
        envelope={null}
      />,
    );
    expect(html).toContain(".ps-open[hidden]{display:flex!important}");
    expect(html).toContain("Mensagem inteira da carta");
  });

  it("abre com animação: música no gesto, carta e efeitos ao fim, foco no título", () => {
    render();
    act(() => openButton().click());
    expect(container.querySelector('[data-state="opening"]')).not.toBeNull();
    expect(container.querySelector("iframe")).not.toBeNull();
    expect(letterBlock().hidden).toBe(false);

    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector(".ps-closed")).toBeNull();
    expect(container.querySelector(".ps-fx[data-play]")).not.toBeNull();
    expect(container.textContent).toContain("Compartilhar que ganhei");
    act(() => vi.advanceTimersByTime(100));
    expect(document.activeElement?.classList.contains("ps-sheet__title")).toBe(true);
    expect(container.querySelector("h1")?.textContent).toBe("Para Ana");
  });

  it("com movimento reduzido, abre na hora (sem etapa de animação)", () => {
    reduced = true;
    render();
    act(() => openButton().click());
    expect(container.querySelector(".ps-closed")).toBeNull();
    expect(container.querySelector('[data-state="opening"]')).toBeNull();
    expect(letterBlock().hidden).toBe(false);
  });

  it("prévia do editor: não toca música nem mostra compartilhar", () => {
    const onClose = vi.fn();
    act(() =>
      root.render(
        <RecipientExperience
          letter={LETTER}
          preset={getPreset("noturno")}
          effect="brilho"
          scene={null}
          envelope={null}
          preview
          onClose={onClose}
        />,
      ),
    );
    act(() => openButton().click());
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).not.toContain("Compartilhar que ganhei");
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent === "Voltar para a edição")!.click());
    expect(onClose).toHaveBeenCalled();
  });
});
