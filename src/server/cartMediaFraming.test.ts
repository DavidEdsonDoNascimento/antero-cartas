/**
 * Ajuste de enquadramento no servidor: autorização, gravação e convivência
 * com a reordenação.
 *
 * Roda contra um banco falso em memória (não é teste de integração): o que
 * está sob teste é a REGRA do serviço — quem pode escrever, em qual foto, e
 * o que exatamente é escrito. Os testes com banco real continuam em
 * `phase2.integration.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { hashEditToken } from "@/lib/editToken";
import { ApiError } from "@/server/errors";

interface MediaRow {
  id: string;
  cartId: string;
  type: string;
  url: string;
  storageKey: string;
  position: number;
  focalX: number | null;
  focalY: number | null;
  zoom: number | null;
  createdAt: Date;
}

const db = vi.hoisted(() => ({
  carts: new Map<string, Record<string, unknown>>(),
  media: [] as unknown[],
}));

const prismaMock = vi.hoisted(() => ({
  cart: { findUnique: vi.fn() },
  cartMedia: { findFirst: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

const TOKEN = "token-de-edicao-valido";
const OTHER_TOKEN = "token-de-outro-rascunho";

function cartRow(id: string, token: string, status = "DRAFT"): Record<string, unknown> {
  const now = new Date();
  return {
    id,
    editTokenHash: hashEditToken(token),
    slug: null,
    status,
    recipientType: "namorada",
    recipientName: "Ana",
    occasion: "declaracao",
    title: "Para você",
    message: "oi",
    senderName: "Lucas",
    signature: "",
    theme: "romantico",
    musicVideoId: null,
    musicUrl: null,
    musicTitle: null,
    musicChannelTitle: null,
    musicThumbnailUrl: null,
    musicSource: null,
    relationshipStartDate: null,
    showRelationshipCounter: false,
    planType: null,
    expiresAt: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function mediaRow(id: string, cartId: string, position: number, framing?: Partial<MediaRow>): MediaRow {
  return {
    id,
    cartId,
    type: "photo",
    url: `https://exemplo/${id}.jpg`,
    storageKey: `carts/${cartId}/${id}.jpg`,
    position,
    focalX: null,
    focalY: null,
    zoom: null,
    createdAt: new Date(),
    ...framing,
  };
}

let cartService: typeof import("@/server/cartService");

beforeAll(async () => {
  cartService = await import("@/server/cartService");
});

beforeEach(() => {
  db.carts = new Map();
  db.media = [];
  db.carts.set("cart_1", cartRow("cart_1", TOKEN));
  db.carts.set("cart_2", cartRow("cart_2", OTHER_TOKEN));
  db.media = [
    mediaRow("m1", "cart_1", 0),
    mediaRow("m2", "cart_1", 1),
    mediaRow("alheia", "cart_2", 0),
  ];

  prismaMock.cart.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const row = db.carts.get(where.id);
    if (!row) return null;
    const media = (db.media as MediaRow[])
      .filter((m) => m.cartId === where.id)
      .sort((a, b) => a.position - b.position);
    return { ...row, media };
  });
  prismaMock.cartMedia.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; cartId: string } }) =>
      (db.media as MediaRow[]).find((m) => m.id === where.id && m.cartId === where.cartId) ?? null,
  );
  prismaMock.cartMedia.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Partial<MediaRow> }) => {
      const row = (db.media as MediaRow[]).find((m) => m.id === where.id);
      if (!row) throw new Error("registro inexistente");
      Object.assign(row, data);
      return row;
    },
  );
  prismaMock.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
});

function stored(id: string): MediaRow {
  return (db.media as MediaRow[]).find((m) => m.id === id)!;
}

describe("updateMediaFraming — autorização", () => {
  it("recusa sem token de edição", async () => {
    await expect(
      cartService.updateMediaFraming("cart_1", null, "m1", { x: 0.2, y: 0.2, zoom: 1.5 }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("recusa token inválido", async () => {
    await expect(
      cartService.updateMediaFraming("cart_1", "token-errado", "m1", null),
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(prismaMock.cartMedia.update).not.toHaveBeenCalled();
  });

  it("NÃO permite ajustar a foto de outro rascunho, mesmo com um token válido", async () => {
    // "alheia" existe e o token é legítimo — só que para OUTRA carta.
    await expect(
      cartService.updateMediaFraming("cart_1", TOKEN, "alheia", { x: 0, y: 0, zoom: 2 }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(prismaMock.cartMedia.update).not.toHaveBeenCalled();
    expect(stored("alheia").focalX).toBeNull();
  });

  it("recusa carta que não pode mais ser editada", async () => {
    db.carts.set("cart_1", cartRow("cart_1", TOKEN, "PUBLISHED"));
    await expect(
      cartService.updateMediaFraming("cart_1", TOKEN, "m1", { x: 0.1, y: 0.1, zoom: 1.2 }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(prismaMock.cartMedia.update).not.toHaveBeenCalled();
  });
});

describe("updateMediaFraming — persistência", () => {
  it("grava o enquadramento e devolve a carta já com ele", async () => {
    const cart = await cartService.updateMediaFraming("cart_1", TOKEN, "m1", {
      x: 0.31,
      y: 0.08,
      zoom: 1.75,
    });
    expect(stored("m1")).toMatchObject({ focalX: 0.31, focalY: 0.08, zoom: 1.75 });
    expect(cart.media.find((m) => m.id === "m1")?.framing).toEqual({
      x: 0.31,
      y: 0.08,
      zoom: 1.75,
    });
  });

  it("ajusta uma foto sem tocar nas outras", async () => {
    await cartService.updateMediaFraming("cart_1", TOKEN, "m1", { x: 0, y: 0, zoom: 2 });
    expect(stored("m2")).toMatchObject({ focalX: null, focalY: null, zoom: null });
  });

  it("null limpa o ajuste e a foto volta a ser 'sem metadados'", async () => {
    await cartService.updateMediaFraming("cart_1", TOKEN, "m1", { x: 0.2, y: 0.2, zoom: 1.4 });
    const cart = await cartService.updateMediaFraming("cart_1", TOKEN, "m1", null);
    expect(stored("m1")).toMatchObject({ focalX: null, focalY: null, zoom: null });
    expect(cart.media.find((m) => m.id === "m1")?.framing).toBeNull();
  });

  it("corta valores fora de faixa antes de gravar (defesa em profundidade)", async () => {
    await cartService.updateMediaFraming("cart_1", TOKEN, "m1", {
      x: 9,
      y: -9,
      zoom: 99,
    });
    expect(stored("m1")).toMatchObject({ focalX: 1, focalY: 0, zoom: 3 });
  });

  it("nunca reescreve a imagem: só as três colunas de enquadramento mudam", async () => {
    await cartService.updateMediaFraming("cart_1", TOKEN, "m1", { x: 0.4, y: 0.4, zoom: 1.1 });
    const [{ data }] = prismaMock.cartMedia.update.mock.calls.map((c) => c[0]);
    expect(Object.keys(data).sort()).toEqual(["focalX", "focalY", "zoom"]);
  });
});

describe("o ajuste sobrevive à ordenação", () => {
  it("trocar a capa preserva o enquadramento de cada foto", async () => {
    await cartService.updateMediaFraming("cart_1", TOKEN, "m2", { x: 0.9, y: 0.1, zoom: 2 });

    // "m2" vira capa: a ordem muda, o enquadramento acompanha a FOTO.
    const cart = await cartService.reorderMedia("cart_1", TOKEN, ["m2", "m1"]);

    expect(cart.media.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(cart.media[0].framing).toEqual({ x: 0.9, y: 0.1, zoom: 2 });
    expect(cart.media[1].framing).toBeNull();
  });

  it("reordenar escreve apenas `position` — não encosta no enquadramento", async () => {
    await cartService.updateMediaFraming("cart_1", TOKEN, "m1", { x: 0.2, y: 0.7, zoom: 1.5 });
    prismaMock.cartMedia.update.mockClear();

    await cartService.reorderMedia("cart_1", TOKEN, ["m2", "m1"]);

    for (const [args] of prismaMock.cartMedia.update.mock.calls) {
      expect(Object.keys(args.data)).toEqual(["position"]);
    }
    expect(stored("m1")).toMatchObject({ focalX: 0.2, focalY: 0.7, zoom: 1.5 });
  });
});
