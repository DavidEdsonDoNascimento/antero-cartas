// @vitest-environment jsdom
/**
 * Enquadramento na renderização: a prévia da jornada de criação e a carta
 * pública precisam mostrar a MESMA coisa.
 *
 * Não é uma preocupação teórica: são dois pontos de entrada diferentes
 * (`CreateFlow` → `CardPreview live` e `/c/[slug]` → `CardExperience` →
 * `CardPreview`). Enquanto os dois passarem por `framingStyle`, não há por
 * onde divergir — e é isso que o primeiro teste fixa, comparando o estilo
 * inline de cada foto nos dois caminhos.
 *
 * O segundo contrato protegido aqui é a compatibilidade: foto sem
 * enquadramento (`framing: null`, o caso de tudo que já está publicado)
 * continua com o recorte centralizado de sempre, sem `transform` nenhum.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Cart, CartMedia } from "@/lib/types";
import { CardPreview } from "./CardPreview";
import { CardExperience } from "./CardExperience";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

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

function photo(id: string, framing: CartMedia["framing"]): CartMedia {
  return {
    id,
    cartId: "cart_1",
    type: "photo",
    url: `https://exemplo/${id}.jpg`,
    storageKey: `k_${id}`,
    position: Number(id.slice(1)) - 1,
    framing,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Foto antiga (nunca ajustada) e foto com o topo preservado. */
const MEDIA: CartMedia[] = [
  photo("m1", null),
  photo("m2", { x: 0.5, y: 0.12, zoom: 1.6 }),
];

function cartWith(media: CartMedia[]): Cart {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "cart_1",
    slug: "abc",
    status: "PUBLISHED",
    recipientType: "namorada",
    recipientName: "Ana",
    occasion: "declaracao",
    title: "Para você",
    message: "Uma mensagem.",
    senderName: "Lucas",
    signature: "Com carinho,",
    theme: "romantico",
    music: null,
    relationshipStartDate: null,
    showRelationshipCounter: false,
    planType: "PERMANENT",
    media,
    expiresAt: null,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function photoStyles(): string[] {
  return Array.from(container.querySelectorAll<HTMLImageElement>("img[alt^='Foto']")).map(
    (img) => img.getAttribute("style") ?? "",
  );
}

function renderPreview(cart: Cart) {
  act(() => {
    root = createRoot(container);
    root.render(<CardPreview cart={cart} live />);
  });
}

/** Carta pública: começa no envelope fechado, então abre. */
function renderPublicCard(cart: Cart) {
  act(() => {
    root = createRoot(container);
    root.render(<CardExperience cart={cart} shareUrl="https://exemplo/c/abc" />);
  });
  const open = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.getAttribute("aria-label") ?? "").startsWith("Abrir"),
  )!;
  act(() => open.click());
}

describe("prévia e carta pública", () => {
  it("renderizam as fotos com exatamente o mesmo enquadramento", () => {
    renderPublicCard(cartWith(MEDIA));
    const publicStyles = photoStyles();
    act(() => root.unmount());
    container.innerHTML = "";

    renderPreview(cartWith(MEDIA));
    const previewStyles = photoStyles();

    expect(publicStyles).toHaveLength(2);
    // A opacidade do crossfade faz parte do estilo dos dois lados; se algum
    // dia divergirem, é aqui que aparece.
    expect(previewStyles).toEqual(publicStyles);
  });

  it("mostram o ajuste salvo, não o recorte central", () => {
    renderPreview(cartWith(MEDIA));
    const [, adjusted] = photoStyles();
    expect(adjusted).toContain("object-position: 50% 12%");
    expect(adjusted).toContain("scale(1.6)");
    expect(adjusted).toContain("transform-origin: 50% 12%");
  });
});

describe("compatibilidade com o que já está publicado", () => {
  it("foto sem enquadramento continua com o recorte centralizado de sempre", () => {
    renderPreview(cartWith([photo("m1", null)]));
    const [legacy] = photoStyles();
    expect(legacy).toContain("object-fit: cover");
    expect(legacy).not.toContain("transform");
    expect(legacy).not.toContain("object-position");
  });

  it("uma carta inteira sem ajustes não muda em nada na carta pública", () => {
    renderPublicCard(cartWith([photo("m1", null), photo("m2", null)]));
    for (const style of photoStyles()) {
      expect(style).not.toContain("transform");
      expect(style).not.toContain("object-position");
    }
  });

  it("ajustar uma foto não afeta as vizinhas", () => {
    renderPreview(cartWith(MEDIA));
    const [untouched, adjusted] = photoStyles();
    expect(untouched).not.toContain("transform");
    expect(adjusted).toContain("scale(1.6)");
  });
});
