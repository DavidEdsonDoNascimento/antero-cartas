// @vitest-environment jsdom
/**
 * Integração do selo de criação e do indicador de música dentro da experiência
 * da cartinha pública.
 *
 * Os testes isolados (`CardCreateInvite.test.tsx`, `cardFloatingActions.test.tsx`)
 * provam o comportamento dos componentes. Aqui provamos o que só aparece quando
 * eles estão montados na cartinha de verdade:
 *
 * 1. O selo do estado fechado NÃO abre o envelope. Se clicar nele abrisse a
 *    carta, ele teria virado um segundo botão de abrir, disfarçado de link.
 * 2. O bloco final vem DEPOIS da ação de compartilhar e FORA do contêiner dela.
 * 3. Os flutuantes são filhos DIRETOS da raiz — nunca dentro do `.animate-fade-up`
 *    do `OpenedLetter`, cujas keyframes de `translateY` criariam containing block
 *    e prenderiam o `position: fixed`.
 * 4. Nenhum dado da cartinha exibida chega ao selo ou ao bloco final. A cartinha
 *    é recheada de sentinelas para que qualquer vazamento apareça.
 * 5. O indicador de música só existe quando há música, e leva ao player.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Cart } from "@/lib/types";
import { CardExperience } from "./CardExperience";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

/**
 * Valores propositalmente distintos e improváveis: se algum deles aparecer nos
 * CTAs, é vazamento — não coincidência.
 */
const SENTINELAS = {
  recipientName: "Marifernanda Zaltron",
  title: "Nosso primeiro inverno juntos",
  message: "Voce virou o meu lugar preferido do mundo inteiro",
  senderName: "Thiagolino Verissimo",
  signature: "Com todo o meu carinho de sempre",
  musicTitle: "Cancao improvavel do teste",
  slug: "slugsecretodacartinha123",
};

const CART: Cart = {
  id: "cart_test",
  slug: SENTINELAS.slug,
  status: "PUBLISHED",
  recipientType: "namorada",
  recipientName: SENTINELAS.recipientName,
  occasion: "aniversario",
  title: SENTINELAS.title,
  message: SENTINELAS.message,
  senderName: SENTINELAS.senderName,
  signature: SENTINELAS.signature,
  theme: "romantico",
  music: {
    videoId: "abc123XYZ",
    youtubeUrl: "https://www.youtube.com/watch?v=abc123XYZ",
    title: SENTINELAS.musicTitle,
    channelTitle: "Canal de teste",
    source: "search",
  },
  relationshipStartDate: null,
  showRelationshipCounter: false,
  planType: "PERMANENT",
  media: [],
  expiresAt: null,
  publishedAt: "2026-08-01T12:00:00.000Z",
  createdAt: "2026-08-01T11:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const SHARE_URL = `https://exemplo.test/c/${SENTINELAS.slug}`;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  container.addEventListener("click", (e) => e.preventDefault(), true);
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(cart: Cart = CART) {
  act(() => {
    root = createRoot(container);
    root.render(<CardExperience cart={cart} shareUrl={SHARE_URL} />);
  });
}

/** Primeiro caminho para /criar (o helper histórico — qualquer um serve). */
function anyCreateLink(): HTMLAnchorElement {
  const found = container.querySelector<HTMLAnchorElement>('a[href="/criar"]');
  expect(found, "nenhum caminho para /criar encontrado").not.toBeNull();
  return found!;
}

function createLinks(): HTMLAnchorElement[] {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/criar"]'));
}

function finalBlock(): HTMLElement | null {
  return container.querySelector<HTMLElement>("#card-final-cta");
}

function openButton(): HTMLButtonElement {
  const botao = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Abrir minha carta"),
  );
  expect(botao, "botão 'Abrir minha carta' não encontrado").toBeDefined();
  return botao as HTMLButtonElement;
}

const isOpen = () => container.textContent?.includes(SENTINELAS.message) ?? false;

describe("estado fechado", () => {
  it("mostra o selo (link para /criar) e NÃO o bloco final", () => {
    render();
    expect(isOpen()).toBe(false);
    expect(anyCreateLink().getAttribute("href")).toBe("/criar");
    expect(finalBlock()).toBeNull();
  });

  it("todo caminho para /criar no estado fechado é um selo", () => {
    render();
    const links = createLinks();
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a.getAttribute("aria-label")).toBe("Criar a minha cartinha");
    }
  });

  it("o convite textual antigo não aparece mais", () => {
    render();
    expect(container.textContent).not.toContain("Quer criar uma surpresa assim?");
  });

  it("o selo NÃO abre o envelope quando clicado", () => {
    render();
    act(() => anyCreateLink().click());
    expect(isOpen()).toBe(false);
    expect(container.textContent).toContain("Uma surpresa foi preparada para você");
  });

  it("o botão 'Abrir minha carta' continua abrindo (não houve regressão)", () => {
    render();
    act(() => openButton().click());
    expect(isOpen()).toBe(true);
  });

  it("o selo vem depois do botão de abrir, na ordem do documento", () => {
    render();
    const posicao = openButton().compareDocumentPosition(anyCreateLink());
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("estado aberto", () => {
  beforeEach(() => {
    render();
    act(() => openButton().click());
  });

  it("mostra o bloco de conversão (#card-final-cta) com link para /criar", () => {
    expect(isOpen()).toBe(true);
    expect(finalBlock()).not.toBeNull();
    expect(container.textContent).toContain("Gostou desta surpresa? 💌");
    expect(finalBlock()!.querySelector('a[href="/criar"]')?.textContent).toBe(
      "Criar minha cartinha",
    );
  });

  it("o bloco final fica DEPOIS da ação de compartilhar no WhatsApp", () => {
    const whatsapp = container.querySelector<HTMLAnchorElement>('a[href*="wa.me"]');
    expect(whatsapp).not.toBeNull();
    const posicao = whatsapp!.compareDocumentPosition(finalBlock()!);
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o bloco final fica FORA do contêiner de ações do WhatsApp", () => {
    const whatsapp = container.querySelector<HTMLAnchorElement>('a[href*="wa.me"]');
    expect(whatsapp!.parentElement!.contains(finalBlock())).toBe(false);
  });

  it("o bloco final não flutua: nenhum elemento dele é fixed/absolute/sticky", () => {
    const bloco = finalBlock()!;
    for (const el of [bloco, ...Array.from(bloco.querySelectorAll("*"))]) {
      expect(el.className).not.toMatch(/\b(fixed|absolute|sticky)\b/);
    }
  });

  it("o selo flutuante é filho direto da raiz — fora do .animate-fade-up", () => {
    const flutuante = container.querySelector<HTMLAnchorElement>(
      '.card-float-dock a[href="/criar"]',
    );
    expect(flutuante).not.toBeNull();
    expect(flutuante!.closest(".animate-fade-up")).toBeNull();
  });

  it("o indicador de música leva ao player, e o player tem o id alvo", () => {
    const musicLink = container.querySelector<HTMLAnchorElement>(
      'a[href="#musica-da-cartinha"]',
    );
    expect(musicLink).not.toBeNull();
    expect(container.querySelector("#musica-da-cartinha")).not.toBeNull();
    expect(musicLink!.closest(".animate-fade-up")).toBeNull();
  });

  it("o botão de compartilhar continua intacto (não houve regressão)", () => {
    const whatsapp = container.querySelector<HTMLAnchorElement>('a[href*="wa.me"]');
    expect(whatsapp!.textContent).toBe("Compartilhar no WhatsApp");
  });
});

describe("nenhum dado da cartinha vaza para os CTAs", () => {
  it.each(["fechado", "aberto"] as const)("estado %s", (estado) => {
    render();
    if (estado === "aberto") act(() => openButton().click());

    const suspeitos = [
      ...createLinks(),
      ...Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')),
    ];
    expect(suspeitos.length).toBeGreaterThan(0);
    for (const a of suspeitos) {
      for (const [campo, valor] of Object.entries(SENTINELAS)) {
        expect(a.outerHTML, `"${campo}" apareceu num CTA`).not.toContain(valor);
      }
    }
    for (const a of createLinks()) {
      expect(a.getAttribute("href")).toBe("/criar"); // literal, sem query/UTM/id
    }
  });
});

describe("cartinha sem música e sem fotos", () => {
  it("o bloco final continua presente; nenhum indicador de música", () => {
    render({ ...CART, music: null, media: [] });
    act(() => openButton().click());
    expect(finalBlock()).not.toBeNull();
    expect(container.querySelector("#musica-da-cartinha")).toBeNull();
    expect(container.querySelector('[aria-label="Esta cartinha tem música"]')).toBeNull();
    expect(container.querySelector('a[href="#musica-da-cartinha"]')).toBeNull();
  });
});
