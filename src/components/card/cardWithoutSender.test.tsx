// @vitest-environment jsdom
/**
 * Carta publicada sem remetente (decisão O1, relatório 2026-11-03).
 *
 * O servidor passou a publicar cartas com `senderName` vazio. A renderização
 * não muda: `CardPreview` já esconde o divisor e o bloco de assinatura quando
 * não há nome nem frase. Estes testes fixam isso na carta aberta de verdade
 * (`CardExperience`), para que nenhuma carta sem remetente abra com um
 * divisor solto, um "undefined" ou um espaço de assinatura vazio.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Cart } from "@/lib/types";
import { getTheme } from "@/content/themes";
import { CardExperience } from "./CardExperience";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const MESSAGE = "Mensagem da carta sem remetente";

function cart(overrides: Partial<Cart> = {}): Cart {
  const now = "2026-11-03T12:00:00.000Z";
  return {
    id: "cart_sem_remetente",
    slug: "slugdecartasemremetente12",
    status: "PUBLISHED",
    recipientType: "amigo",
    recipientName: "Ana",
    occasion: null,
    title: "Uma cartinha para você",
    message: MESSAGE,
    senderName: "",
    signature: "",
    theme: "romantico",
    music: null,
    relationshipStartDate: null,
    showRelationshipCounter: false,
    planType: "LIMITED",
    media: [],
    expiresAt: null,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

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

function renderOpened(c: Cart) {
  act(() => {
    root = createRoot(container);
    root.render(<CardExperience cart={c} shareUrl={`https://exemplo.test/c/${c.slug}`} />);
  });
  const open = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Abrir minha carta"),
  );
  expect(open, "botão 'Abrir minha carta' não encontrado").toBeDefined();
  act(() => open!.click());
  expect(container.textContent).toContain(MESSAGE);
}

/** O nome de quem envia, em destaque no fim da folha. */
function signatureName(): HTMLElement | null {
  return container.querySelector<HTMLElement>("p.font-script.text-2xl");
}

describe("carta aberta sem remetente", () => {
  it("abre com a mensagem e sem divisor, nome ou frase de assinatura", () => {
    const c = cart();
    renderOpened(c);

    expect(signatureName()).toBeNull();
    expect(container.textContent).not.toContain(getTheme(c.theme).divider);
    expect(container.textContent).not.toMatch(/undefined|null/);
  });

  it("remetente só com espaços é tratado como vazio", () => {
    renderOpened(cart({ senderName: "   " }));
    expect(signatureName()).toBeNull();
  });

  it("com frase de assinatura e sem nome, mostra só a frase", () => {
    const c = cart({ signature: "Com carinho" });
    renderOpened(c);

    expect(container.textContent).toContain("Com carinho");
    expect(container.textContent).toContain(getTheme(c.theme).divider);
    expect(signatureName()).toBeNull();
  });

  it("com remetente, continua mostrando o nome como antes", () => {
    renderOpened(cart({ senderName: "Lucas", signature: "Com carinho" }));

    expect(signatureName()?.textContent).toBe("Lucas");
    expect(container.textContent).toContain("Com carinho");
  });
});
