// @vitest-environment jsdom
/**
 * Convite para criar a própria cartinha, nas duas variantes.
 *
 * O que estes testes protegem, além da renderização:
 *
 * 1. O destino é a string fixa "/criar" — o componente nem recebe o `cart`,
 *    então não existe caminho por onde um dado da cartinha visualizada possa
 *    escorrer para o link.
 * 2. O clique manda exatamente um evento, com dois rótulos agregados e nada
 *    mais. A verificação passa as props pelo `sanitizeAnalyticsProps` REAL
 *    (não pelo mock) para provar que nenhuma delas seria descartada — se
 *    alguém trocar `theme` por `title` amanhã, o filtro comeria o campo em
 *    silêncio em produção e este teste falha antes disso.
 * 3. As duas variantes funcionam nos quatro temas.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ThemeId } from "@/lib/types";
import { themes, getTheme } from "@/content/themes";
import { sanitizeAnalyticsProps } from "@/lib/analyticsPrivacy";
import { CardCreateInvite, type CardCreateInviteVariant } from "./CardCreateInvite";

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

function render(variant: CardCreateInviteVariant, themeId: ThemeId = "romantico") {
  act(() => {
    root = createRoot(container);
    root.render(<CardCreateInvite variant={variant} theme={getTheme(themeId)} />);
  });
}

/** O único link do convite (cada variante tem exatamente um). */
function link(): HTMLAnchorElement {
  const anchors = container.querySelectorAll("a");
  expect(anchors).toHaveLength(1);
  return anchors[0] as HTMLAnchorElement;
}

describe("variante discreta (cartinha fechada)", () => {
  it("mostra a pergunta e o link, com a copy aprovada", () => {
    render("discreta");
    expect(container.textContent).toContain("Quer criar uma surpresa assim?");
    expect(link().textContent).toBe("Criar uma cartinha");
  });

  it("aponta para /criar", () => {
    render("discreta");
    expect(link().getAttribute("href")).toBe("/criar");
  });

  it("é um link, nunca um botão — não pode parecer a ação principal", () => {
    render("discreta");
    expect(link().tagName).toBe("A");
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("não tem fundo nem borda próprios (subordinação visual ao 'Abrir minha carta')", () => {
    render("discreta");
    const cls = link().className;
    expect(cls).not.toMatch(/\bbg-/);
    expect(cls).not.toMatch(/\bborder\b/);
    // A cor vem do tom apagado do tema, não de uma superfície.
    expect(link().style.background).toBe("");
  });

  it("reserva alvo de toque de 44px", () => {
    render("discreta");
    expect(link().className).toContain("min-h-11");
  });

  it("só a chamada é clicável — a pergunta é texto comum", () => {
    render("discreta");
    const question = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("Quer criar uma surpresa assim?"),
    );
    expect(question).toBeDefined();
    expect(question!.querySelector("a")).toBeNull();
  });
});

describe("variante destaque (cartinha aberta)", () => {
  it("mostra pergunta, promessa, botão e assinatura", () => {
    render("destaque");
    const text = container.textContent ?? "";
    expect(text).toContain("Gostou desta surpresa? 💌");
    expect(text).toContain("Crie uma cartinha para alguém especial em poucos minutos.");
    expect(text).toContain("Antero Cartas");
    expect(link().textContent).toBe("Criar minha cartinha");
  });

  it("aponta para /criar", () => {
    render("destaque");
    expect(link().getAttribute("href")).toBe("/criar");
  });

  it("tem exatamente um botão no bloco", () => {
    render("destaque");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("separa do bloco de ações com mt-8 e um divisor decorativo", () => {
    render("destaque");
    expect(container.firstElementChild?.className).toContain("mt-8");
    const divider = container.querySelector("[aria-hidden]");
    expect(divider).not.toBeNull();
    // Divisor derivado do token do tema — nunca uma cor fixa, que quebraria
    // no Delicado (único tema com envelope claro).
    expect(divider!.getAttribute("style")).toContain("color-mix");
  });

  it("reserva alvo de toque de 44px", () => {
    render("destaque");
    expect(link().className).toContain("min-h-11");
  });

  it("não exibe preço, urgência nem promessa comercial", () => {
    render("destaque");
    const text = container.textContent ?? "";
    for (const proibido of ["R$", "partir de", "Sem cadastro", "grátis", "desconto", "oferta"]) {
      expect(text).not.toContain(proibido);
    }
  });
});

describe.each(themes)("tema $id ($label)", (theme) => {
  it.each(["discreta", "destaque"] as const)(
    "renderiza a variante %s usando as cores do tema",
    (variant) => {
      act(() => {
        root = createRoot(container);
        root.render(<CardCreateInvite variant={variant} theme={theme} />);
      });

      const a = link();
      expect(a.getAttribute("href")).toBe("/criar");
      expect(a.textContent?.trim()).toBeTruthy();

      if (variant === "discreta") {
        expect(a.style.color).toBeTruthy();
      } else {
        // O botão reaproveita o par accent/onAccent do "Abrir minha carta".
        expect(a.style.background).toBeTruthy();
        expect(a.style.color).toBeTruthy();
      }
    },
  );
});

describe("acessibilidade", () => {
  it.each(["discreta", "destaque"] as const)(
    "variante %s: o link tem nome acessível e não está escondido de leitores de tela",
    (variant) => {
      render(variant);
      const a = link();
      expect(a.textContent?.trim().length).toBeGreaterThan(0);
      expect(a.getAttribute("aria-hidden")).toBeNull();
      expect(a.closest("[aria-hidden='true']")).toBeNull();
    },
  );

  it.each(["discreta", "destaque"] as const)(
    "variante %s: é um <a> — o halo de foco global de globals.css cobre todo <a>",
    (variant) => {
      render(variant);
      expect(link().tagName).toBe("A");
    },
  );
});

describe("rastreamento", () => {
  it.each([
    ["discreta", "closed"],
    ["destaque", "opened"],
  ] as const)("variante %s registra um evento com state=%s", (variant, state) => {
    render(variant, "delicado");
    act(() => link().click());

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("create_cta_from_card_clicked", {
      state,
      theme: "delicado",
    });
  });

  it("envia somente state e theme — nada de slug, nome, título ou URL", () => {
    render("destaque");
    act(() => link().click());

    const props = track.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["state", "theme"]);
  });

  it("as props sobrevivem intactas ao sanitizador real (nenhuma seria descartada)", () => {
    render("destaque");
    act(() => link().click());

    const props = track.mock.calls[0][1] as Parameters<typeof sanitizeAnalyticsProps>[0];
    expect(sanitizeAnalyticsProps(props)).toEqual(props);
  });

  it("não dispara nada antes do clique", () => {
    render("discreta");
    expect(track).not.toHaveBeenCalled();
  });

  /**
   * A regra que motivou o componente inteiro: em `/c/[slug]` nada pode
   * acontecer por hover. `CreateCta` cria um rascunho no banco em
   * `onPointerEnter`, e é esse gesto — não o clique — que precisa ser inerte
   * aqui. O evento de analytics é o único efeito observável do convite, então
   * usá-lo como sensor prova que nenhum handler está pendurado no ponteiro.
   */
  it.each(["discreta", "destaque"] as const)(
    "variante %s: passar o ponteiro, tocar ou focar não dispara efeito nenhum",
    (variant) => {
      render(variant);
      const a = link();

      act(() => {
        a.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
        a.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        a.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        a.dispatchEvent(new MouseEvent("touchstart", { bubbles: true }));
        a.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      });

      expect(track).not.toHaveBeenCalled();
    },
  );
});
