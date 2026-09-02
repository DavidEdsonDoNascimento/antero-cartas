// @vitest-environment jsdom
/**
 * Selo de criação + indicador de música flutuantes na cartinha pública.
 *
 * O que estes testes protegem, além da renderização:
 *
 * 1. O selo navega SÓ no clique — nunca por hover/toque/foco. `CreateCta` cria
 *    um rascunho no banco em `onPointerEnter`; é esse gesto (não o clique) que
 *    precisa ser inerte aqui. O evento de analytics é o único efeito observável,
 *    então serve de sensor.
 * 2. O indicador de música NUNCA afirma reprodução: o código só sabe que a
 *    cartinha TEM música (`cart.music != null`). No estado fechado é
 *    informativo e não focável; no aberto é um link para o player.
 * 3. Sem `layout` real (jsdom não tem `IntersectionObserver`), os flutuantes
 *    simplesmente não se escondem — comportamento seguro.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { themes, getTheme } from "@/content/themes";
import { CardFloatingActions } from "./CardFloatingActions";
import { CardCreateSeal } from "./CardCreateSeal";
import { CardMusicBadge } from "./CardMusicBadge";

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  container.addEventListener("click", (e) => e.preventDefault(), true);
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderDock(props: {
  opened?: boolean;
  hasMusic?: boolean;
  themeId?: "romantico" | "elegante" | "delicado" | "celebracao";
}) {
  const { opened = false, hasMusic = false, themeId = "romantico" } = props;
  act(() => {
    root = createRoot(container);
    root.render(
      <CardFloatingActions opened={opened} hasMusic={hasMusic} theme={getTheme(themeId)} />,
    );
  });
}

const seal = () => container.querySelector<HTMLAnchorElement>('a[href="/criar"]');
const musicLink = () => container.querySelector<HTMLAnchorElement>('a[href="#musica-da-cartinha"]');
const musicInfo = () =>
  container.querySelector<HTMLElement>('[aria-label="Esta cartinha tem música"]');

describe("selo de criação", () => {
  it("aparência: link para /criar, nome acessível, sem query string", () => {
    renderDock({});
    const a = seal()!;
    expect(a).not.toBeNull();
    expect(a.getAttribute("href")).toBe("/criar");
    expect(a.getAttribute("href")).not.toContain("?");
    expect(a.getAttribute("aria-label")).toBe("Criar a minha cartinha");
    expect(a.tagName).toBe("A");
  });

  it("aparece nos dois estados", () => {
    renderDock({ opened: false });
    expect(seal()).not.toBeNull();
    act(() => root.unmount());
    renderDock({ opened: true });
    expect(seal()).not.toBeNull();
  });

  it("clique válido registra UM evento com surface=seal e o estado certo", () => {
    renderDock({ opened: false, themeId: "elegante" });
    act(() => seal()!.click());
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("create_cta_from_card_clicked", {
      state: "closed",
      theme: "elegante",
      surface: "seal",
    });
  });

  it("no estado aberto o evento leva state=opened", () => {
    renderDock({ opened: true, themeId: "delicado" });
    act(() => seal()!.click());
    expect(track).toHaveBeenCalledWith("create_cta_from_card_clicked", {
      state: "opened",
      theme: "delicado",
      surface: "seal",
    });
  });

  it("passar o ponteiro, tocar ou focar NÃO dispara efeito nenhum", () => {
    renderDock({});
    const a = seal()!;
    act(() => {
      a.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      a.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      a.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      a.dispatchEvent(new MouseEvent("touchstart", { bubbles: true }));
      a.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
      a.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(track).not.toHaveBeenCalled();
  });

  it("o disco tem alvo de toque de 44px e fica só no mobile", () => {
    renderDock({});
    const a = seal()!;
    expect(a.querySelector("svg")).not.toBeNull(); // glifo do selo
    expect(a.closest(".lg\\:hidden")).not.toBeNull();
  });
});

describe("indicador de música", () => {
  it("não aparece quando a cartinha não tem música", () => {
    renderDock({ hasMusic: false, opened: false });
    expect(musicInfo()).toBeNull();
    expect(musicLink()).toBeNull();
    act(() => root.unmount());
    renderDock({ hasMusic: false, opened: true });
    expect(musicInfo()).toBeNull();
    expect(musicLink()).toBeNull();
  });

  it("fechado: informativo, não é link, não é focável", () => {
    renderDock({ hasMusic: true, opened: false });
    const info = musicInfo()!;
    expect(info).not.toBeNull();
    expect(info.tagName).not.toBe("A");
    expect(info.getAttribute("role")).toBe("img");
    expect(info.hasAttribute("href")).toBe(false);
    expect(info.hasAttribute("tabindex")).toBe(false);
    expect(info.getAttribute("role")).not.toBe("button");
    expect(musicLink()).toBeNull();
  });

  it("aberto: vira link para #musica-da-cartinha, focável, 44px", () => {
    renderDock({ hasMusic: true, opened: true });
    const a = musicLink()!;
    expect(a).not.toBeNull();
    expect(a.tagName).toBe("A");
    expect(a.textContent).toContain("Ir para música");
    expect(a.className).toContain("min-h-11");
  });

  it("nunca afirma que a música está tocando", () => {
    for (const opened of [false, true]) {
      renderDock({ hasMusic: true, opened });
      const text = container.textContent ?? "";
      for (const proibido of ["tocando", "tocando agora", "ao vivo", "reproduzindo", "está tocando"]) {
        expect(text.toLowerCase()).not.toContain(proibido);
      }
      act(() => root.unmount());
    }
    // remonta algo para o afterEach não quebrar
    renderDock({});
  });

  it("clique no indicador aberto registra card_music_indicator_clicked uma vez", () => {
    renderDock({ hasMusic: true, opened: true, themeId: "celebracao" });
    act(() => musicLink()!.click());
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("card_music_indicator_clicked", { theme: "celebracao" });
  });

  it("hover/toque/foco no indicador aberto não dispara nada", () => {
    renderDock({ hasMusic: true, opened: true });
    const a = musicLink()!;
    act(() => {
      a.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      a.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      a.dispatchEvent(new MouseEvent("touchstart", { bubbles: true }));
      a.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(track).not.toHaveBeenCalled();
  });

  it("só o pulso do estado fechado anima — nunca em loop", () => {
    renderDock({ hasMusic: true, opened: false });
    expect(container.querySelector(".animate-music-pulse")).not.toBeNull();
    act(() => root.unmount());
    renderDock({ hasMusic: true, opened: true });
    expect(container.querySelector(".animate-music-pulse")).toBeNull();
  });
});

describe("posicionamento — cantos opostos, só mobile", () => {
  it("música à esquerda, selo à direita, ambos lg:hidden e fixed", () => {
    renderDock({ hasMusic: true, opened: false });
    const musicDock = musicInfo()!.closest("div")!;
    const sealDock = seal()!.closest(".card-float-dock")!;
    expect(musicDock.className).toMatch(/left-\[var\(--card-float-inset-l\)\]/);
    expect(musicDock.className).toContain("lg:hidden");
    expect(musicDock.className).toContain("fixed");
    expect(sealDock.className).toMatch(/right-\[var\(--card-float-inset-r\)\]/);
    expect(sealDock.className).toContain("lg:hidden");
    expect(sealDock.className).toContain("fixed");
  });

  it("os dois carregam a classe .card-float-dock (some em paisagem baixa via CSS)", () => {
    renderDock({ hasMusic: true, opened: false });
    expect(container.querySelectorAll(".card-float-dock")).toHaveLength(2);
  });
});

describe("componentes isolados nos quatro temas", () => {
  it.each(themes)("selo tema $id usa accent/onAccent do tema", (theme) => {
    act(() => {
      root = createRoot(container);
      root.render(<CardCreateSeal theme={theme} state="closed" />);
    });
    const a = container.querySelector("a")!;
    expect(a.style.background).toBeTruthy();
    expect(a.style.color).toBeTruthy();
    expect(a.style.border).toContain("1px solid");
  });

  it.each(themes)("badge tema $id não usa cor fixa", (theme) => {
    act(() => {
      root = createRoot(container);
      root.render(<CardMusicBadge theme={theme} state="closed" />);
    });
    const el = container.querySelector('[role="img"]')!;
    expect(el.getAttribute("style")).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(el.getAttribute("style")).toContain("border");
  });
});
