// @vitest-environment jsdom
/**
 * Bloco de conversão no fim da cartinha pública ABERTA.
 *
 * O que estes testes protegem, além da renderização:
 *
 * 1. O destino é a string fixa "/criar" — o componente nem recebe o `cart`,
 *    então não existe caminho por onde um dado da cartinha visualizada possa
 *    escorrer para o link.
 * 2. O clique manda exatamente um evento, com rótulos agregados e nada mais.
 *    A verificação passa as props pelo `sanitizeAnalyticsProps` REAL (não pelo
 *    mock) para provar que nenhuma delas seria descartada — inclusive o
 *    `surface`, acrescentado para separar "selo" de "bloco final".
 * 3. Funciona nos quatro temas.
 *
 * O convite do estado FECHADO virou o selo (`CardCreateSeal`) — testado em
 * `cardFloatingActions.test.tsx`.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { themes, getTheme } from "@/content/themes";
import type { ThemeId } from "@/lib/types";
import { sanitizeAnalyticsProps } from "@/lib/analyticsPrivacy";
import { CardCreateInvite } from "./CardCreateInvite";

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  // Impede o jsdom de tentar navegar de verdade ao clicar num <a> (a fase de
  // captura roda antes dos handlers do React, que continuam sendo chamados).
  container.addEventListener("click", (e) => e.preventDefault(), true);
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(themeId: ThemeId = "romantico") {
  act(() => {
    root = createRoot(container);
    root.render(<CardCreateInvite theme={getTheme(themeId)} />);
  });
}

/** O único link do bloco. */
function link(): HTMLAnchorElement {
  const anchors = container.querySelectorAll("a");
  expect(anchors).toHaveLength(1);
  return anchors[0] as HTMLAnchorElement;
}

describe("renderização", () => {
  it("mostra pergunta, promessa, botão e assinatura", () => {
    render();
    const text = container.textContent ?? "";
    expect(text).toContain("Gostou desta surpresa? 💌");
    expect(text).toContain("Crie uma cartinha para alguém especial em poucos minutos.");
    expect(text).toContain("Antero Cartas");
    expect(link().textContent).toBe("Criar minha cartinha");
  });

  it("aponta para /criar, sem query string", () => {
    render();
    expect(link().getAttribute("href")).toBe("/criar");
    expect(link().getAttribute("href")).not.toContain("?");
  });

  it("tem exatamente um botão no bloco", () => {
    render();
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("é o alvo #card-final-cta do IntersectionObserver do selo", () => {
    render();
    expect(container.querySelector("#card-final-cta")).not.toBeNull();
  });

  it("separa do bloco de ações com mt-8 e um divisor decorativo", () => {
    render();
    expect(container.firstElementChild?.className).toContain("mt-8");
    const divider = container.querySelector("[aria-hidden]");
    expect(divider).not.toBeNull();
    // Divisor derivado do token do tema — nunca uma cor fixa, que quebraria
    // no Delicado (único tema com envelope claro).
    expect(divider!.getAttribute("style")).toContain("color-mix");
  });

  it("reserva alvo de toque de 44px", () => {
    render();
    expect(link().className).toContain("min-h-11");
  });

  it("não flutua — sem fixed/sticky/absolute", () => {
    render();
    for (const el of [container.firstElementChild!, ...Array.from(container.querySelectorAll("*"))]) {
      expect(el.className).not.toMatch(/\b(fixed|sticky|absolute)\b/);
    }
  });

  it("não exibe preço, urgência nem promessa comercial", () => {
    render();
    const text = container.textContent ?? "";
    for (const proibido of ["R$", "partir de", "Sem cadastro", "grátis", "desconto", "oferta"]) {
      expect(text).not.toContain(proibido);
    }
  });
});

describe.each(themes)("tema $id ($label)", (theme) => {
  it("renderiza usando as cores do tema", () => {
    act(() => {
      root = createRoot(container);
      root.render(<CardCreateInvite theme={theme} />);
    });
    const a = link();
    expect(a.getAttribute("href")).toBe("/criar");
    // O botão reaproveita o par accent/onAccent do "Abrir minha carta".
    expect(a.style.background).toBeTruthy();
    expect(a.style.color).toBeTruthy();
  });
});

describe("acessibilidade", () => {
  it("o link tem nome acessível e não está escondido de leitores de tela", () => {
    render();
    const a = link();
    expect(a.textContent?.trim().length).toBeGreaterThan(0);
    expect(a.getAttribute("aria-hidden")).toBeNull();
    expect(a.closest("[aria-hidden='true']")).toBeNull();
  });

  it("é um <a> — o halo de foco global de globals.css cobre todo <a>", () => {
    render();
    expect(link().tagName).toBe("A");
  });
});

describe("rastreamento", () => {
  it("registra um evento com state=opened e surface=final_block", () => {
    render("delicado");
    act(() => link().click());

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("create_cta_from_card_clicked", {
      state: "opened",
      theme: "delicado",
      surface: "final_block",
    });
  });

  it("envia somente state, theme e surface — nada de slug, nome, título ou URL", () => {
    render();
    act(() => link().click());
    const props = track.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["state", "surface", "theme"]);
  });

  it("as props sobrevivem intactas ao sanitizador real (nenhuma seria descartada)", () => {
    render();
    act(() => link().click());
    const props = track.mock.calls[0][1] as Parameters<typeof sanitizeAnalyticsProps>[0];
    expect(sanitizeAnalyticsProps(props)).toEqual(props);
  });

  it("não dispara nada antes do clique", () => {
    render();
    expect(track).not.toHaveBeenCalled();
  });

  it("passar o ponteiro, tocar ou focar não dispara efeito nenhum", () => {
    render();
    const a = link();
    act(() => {
      a.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      a.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      a.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      a.dispatchEvent(new MouseEvent("touchstart", { bubbles: true }));
      a.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(track).not.toHaveBeenCalled();
  });
});
