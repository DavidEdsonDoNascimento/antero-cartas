import { describe, it, expect } from "vitest";
import { dbToDomainCart, type DbCartRow } from "@/lib/cartMapping";

function baseRow(overrides: Partial<DbCartRow> = {}): DbCartRow {
  return {
    id: "cart_1",
    slug: null,
    status: "DRAFT",
    recipientType: "namorada",
    recipientName: "Ana",
    occasion: "declaracao",
    title: "Título",
    message: "Mensagem",
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
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    media: [],
    ...overrides,
  };
}

describe("dbToDomainCart", () => {
  it("mapeia campos simples e datas para ISO string", () => {
    const cart = dbToDomainCart(baseRow());
    expect(cart.id).toBe("cart_1");
    expect(cart.recipientName).toBe("Ana");
    expect(cart.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(cart.music).toBeNull();
  });

  it("monta SelectedMusic a partir dos campos achatados quando há musicVideoId", () => {
    const cart = dbToDomainCart(
      baseRow({
        musicVideoId: "2Vv-BfVoq4g",
        musicUrl: "https://www.youtube.com/watch?v=2Vv-BfVoq4g",
        musicTitle: "Perfect",
        musicChannelTitle: "Ed Sheeran",
        musicSource: "SEARCH",
      }),
    );
    expect(cart.music).toEqual({
      videoId: "2Vv-BfVoq4g",
      youtubeUrl: "https://www.youtube.com/watch?v=2Vv-BfVoq4g",
      title: "Perfect",
      channelTitle: "Ed Sheeran",
      thumbnailUrl: undefined,
      source: "search",
    });
  });

  it("ordena as mídias pela posição, independente da ordem de entrada", () => {
    const cart = dbToDomainCart(
      baseRow({
        media: [
          {
            id: "m2",
            cartId: "cart_1",
            type: "photo",
            url: "u2",
            storageKey: "k2",
            position: 1,
            createdAt: new Date(),
          },
          {
            id: "m1",
            cartId: "cart_1",
            type: "photo",
            url: "u1",
            storageKey: "k1",
            position: 0,
            createdAt: new Date(),
          },
        ],
      }),
    );
    expect(cart.media.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("nunca inclui editTokenHash ou outros campos internos no resultado", () => {
    const cart = dbToDomainCart(baseRow());
    expect(cart).not.toHaveProperty("editTokenHash");
  });
});
