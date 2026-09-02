// @vitest-environment jsdom
/**
 * Integração do convite dentro da experiência da cartinha pública.
 *
 * O teste isolado do componente (CardCreateInvite.test.tsx) prova que o
 * convite se comporta. Aqui provamos as três coisas que só aparecem quando
 * ele está montado na cartinha de verdade:
 *
 * 1. O convite do estado fechado NÃO abre o envelope. É a regra que sustenta
 *    a hierarquia inteira — se clicar nele abrisse a carta, ele teria virado
 *    um segundo botão de abrir, disfarçado de link.
 * 2. O bloco final vem DEPOIS da ação de compartilhar e FORA do contêiner
 *    dela. Compartilhar é para quem recebeu a cartinha; criar é para quem só
 *    passou por ela.
 * 3. Nenhum dado da cartinha exibida chega ao CTA. A cartinha usada abaixo é
 *    recheada de sentinelas justamente para que qualquer vazamento apareça.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Cart } from "@/lib/types";
import { CardExperience } from "./CardExperience";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

/**
 * Valores propositalmente distintos e improváveis: se algum deles aparecer no
 * CTA, é vazamento — não coincidência.
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

/** O CTA de criação, identificado pelo destino — nunca pelo texto. */
function cta(): HTMLAnchorElement {
  const found = container.querySelector<HTMLAnchorElement>('a[href="/criar"]');
  expect(found, "CTA para /criar não encontrado").not.toBeNull();
  return found!;
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
  it("mostra o convite discreto com link para /criar", () => {
    render();
    expect(isOpen()).toBe(false);
    expect(container.textContent).toContain("Quer criar uma surpresa assim?");
    expect(cta().textContent).toBe("Criar uma cartinha");
  });

  it("o convite NÃO abre o envelope quando clicado", () => {
    render();
    act(() => cta().click());
    expect(isOpen()).toBe(false);
    // e o envelope continua lá, esperando a ação principal
    expect(container.textContent).toContain("Uma surpresa foi preparada para você");
  });

  it("o botão 'Abrir minha carta' continua abrindo (não houve regressão)", () => {
    render();
    act(() => openButton().click());
    expect(isOpen()).toBe(true);
  });

  it("o convite vem depois do botão de abrir, na ordem do documento", () => {
    render();
    const posicao = openButton().compareDocumentPosition(cta());
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("existe exatamente um caminho para /criar", () => {
    render();
    expect(container.querySelectorAll('a[href="/criar"]')).toHaveLength(1);
  });
});

describe("estado aberto", () => {
  beforeEach(() => {
    render();
    act(() => openButton().click());
  });

  it("mostra o bloco de conversão com link para /criar", () => {
    expect(isOpen()).toBe(true);
    expect(container.textContent).toContain("Gostou desta surpresa? 💌");
    expect(container.textContent).toContain(
      "Crie uma cartinha para alguém especial em poucos minutos.",
    );
    expect(cta().textContent).toBe("Criar minha cartinha");
  });

  it("o bloco fica DEPOIS da ação de compartilhar no WhatsApp", () => {
    const whatsapp = container.querySelector<HTMLAnchorElement>('a[href*="wa.me"]');
    expect(whatsapp).not.toBeNull();
    const posicao = whatsapp!.compareDocumentPosition(cta());
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o bloco fica FORA do contêiner de ações do WhatsApp", () => {
    const whatsapp = container.querySelector<HTMLAnchorElement>('a[href*="wa.me"]');
    expect(whatsapp!.parentElement!.contains(cta())).toBe(false);
  });

  it("não sobrepõe nada: nenhum elemento do convite é fixed/absolute/sticky", () => {
    const bloco = cta().closest("div.mt-8");
    expect(bloco).not.toBeNull();
    for (const el of [bloco!, ...Array.from(bloco!.querySelectorAll("*"))]) {
      expect(el.className).not.toMatch(/\b(fixed|absolute|sticky)\b/);
    }
  });

  it("existe exatamente um caminho para /criar", () => {
    expect(container.querySelectorAll('a[href="/criar"]')).toHaveLength(1);
  });

  it("o botão de compartilhar continua intacto (não houve regressão)", () => {
    const whatsapp = container.querySelector<HTMLAnchorElement>('a[href*="wa.me"]');
    expect(whatsapp!.textContent).toBe("Compartilhar no WhatsApp");
  });
});

describe("nenhum dado da cartinha vaza para o CTA", () => {
  it.each(["fechado", "aberto"] as const)("estado %s", (estado) => {
    render();
    if (estado === "aberto") act(() => openButton().click());

    const html = cta().outerHTML;
    for (const [campo, valor] of Object.entries(SENTINELAS)) {
      expect(html, `"${campo}" apareceu no CTA`).not.toContain(valor);
    }
    // O destino é literal, sem query string, sem UTM, sem identificador.
    expect(cta().getAttribute("href")).toBe("/criar");
  });

  it("o href não carrega query string em nenhum estado", () => {
    render();
    expect(cta().getAttribute("href")).not.toContain("?");
    act(() => openButton().click());
    expect(cta().getAttribute("href")).not.toContain("?");
  });
});

describe("cartinha sem música e sem fotos", () => {
  it("o bloco final continua presente e no fim", () => {
    render({ ...CART, music: null, media: [] });
    act(() => openButton().click());
    expect(container.textContent).toContain("Gostou desta surpresa? 💌");
    expect(container.querySelectorAll('a[href="/criar"]')).toHaveLength(1);
  });
});
