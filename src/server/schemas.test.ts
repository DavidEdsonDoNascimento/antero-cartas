import { describe, it, expect } from "vitest";
import {
  draftUpdateSchema,
  reorderSchema,
  createOrderSchema,
  mediaFramingSchema,
} from "@/server/schemas";

describe("draftUpdateSchema", () => {
  it("aceita um patch parcial válido", () => {
    const res = draftUpdateSchema.safeParse({ title: "Para você", showRelationshipCounter: true });
    expect(res.success).toBe(true);
  });

  it("aceita objeto vazio (nenhum campo enviado)", () => {
    expect(draftUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("rejeita recipientType fora do enum", () => {
    const res = draftUpdateSchema.safeParse({ recipientType: "alienigena" });
    expect(res.success).toBe(false);
  });

  it("rejeita título acima do limite", () => {
    const res = draftUpdateSchema.safeParse({ title: "a".repeat(500) });
    expect(res.success).toBe(false);
  });

  it("rejeita campos desconhecidos (strict)", () => {
    const res = draftUpdateSchema.safeParse({ hackedField: "x" });
    expect(res.success).toBe(false);
  });

  it("aceita música válida e null", () => {
    expect(
      draftUpdateSchema.safeParse({
        music: {
          videoId: "2Vv-BfVoq4g",
          youtubeUrl: "https://www.youtube.com/watch?v=2Vv-BfVoq4g",
          source: "manual",
        },
      }).success,
    ).toBe(true);
    expect(draftUpdateSchema.safeParse({ music: null }).success).toBe(true);
  });

  it("rejeita videoId de música com formato inválido", () => {
    const res = draftUpdateSchema.safeParse({
      music: { videoId: "curto", youtubeUrl: "https://youtube.com/watch?v=curto", source: "manual" },
    });
    expect(res.success).toBe(false);
  });
});

describe("reorderSchema", () => {
  it("aceita uma lista de ids", () => {
    expect(reorderSchema.safeParse({ order: ["a", "b", "c"] }).success).toBe(true);
  });
  it("rejeita lista vazia", () => {
    expect(reorderSchema.safeParse({ order: [] }).success).toBe(false);
  });
});

describe("createOrderSchema", () => {
  const base = {
    cartId: "cart_1",
    planType: "LIMITED" as const,
    customerName: "Ana Silva",
    customerEmail: "ana@example.com",
    acceptTerms: true as const,
  };

  it("aceita um pedido válido", () => {
    expect(createOrderSchema.safeParse(base).success).toBe(true);
  });

  it("rejeita e-mail inválido", () => {
    expect(
      createOrderSchema.safeParse({ ...base, customerEmail: "não-é-email" }).success,
    ).toBe(false);
  });

  it("rejeita quando os termos não são aceitos", () => {
    expect(createOrderSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
  });

  it("rejeita nome vazio", () => {
    expect(createOrderSchema.safeParse({ ...base, customerName: "" }).success).toBe(false);
  });
});

describe("mediaFramingSchema — o cliente não é a última palavra", () => {
  it("aceita um enquadramento válido", () => {
    const res = mediaFramingSchema.safeParse({ framing: { x: 0.25, y: 0.9, zoom: 2 } });
    expect(res.success).toBe(true);
  });

  it("aceita null (restaurar o padrão)", () => {
    expect(mediaFramingSchema.safeParse({ framing: null }).success).toBe(true);
  });

  it("rejeita ponto focal fora de 0..1", () => {
    expect(mediaFramingSchema.safeParse({ framing: { x: -0.1, y: 0.5, zoom: 1 } }).success).toBe(
      false,
    );
    expect(mediaFramingSchema.safeParse({ framing: { x: 0.5, y: 1.2, zoom: 1 } }).success).toBe(
      false,
    );
  });

  it("rejeita zoom fora da faixa permitida", () => {
    expect(mediaFramingSchema.safeParse({ framing: { x: 0.5, y: 0.5, zoom: 0.5 } }).success).toBe(
      false,
    );
    expect(mediaFramingSchema.safeParse({ framing: { x: 0.5, y: 0.5, zoom: 10 } }).success).toBe(
      false,
    );
  });

  it("rejeita NaN e Infinity", () => {
    expect(mediaFramingSchema.safeParse({ framing: { x: NaN, y: 0.5, zoom: 1 } }).success).toBe(
      false,
    );
    expect(
      mediaFramingSchema.safeParse({ framing: { x: 0.5, y: 0.5, zoom: Infinity } }).success,
    ).toBe(false);
  });

  it("rejeita deslocamento em pixels — o contrato é normalizado, não em px", () => {
    const res = mediaFramingSchema.safeParse({
      framing: { x: 0.5, y: 0.5, zoom: 1, offsetX: 120 },
    });
    expect(res.success).toBe(false);
  });

  it("rejeita campo desconhecido no corpo", () => {
    expect(
      mediaFramingSchema.safeParse({ framing: null, cartId: "outro_rascunho" }).success,
    ).toBe(false);
  });

  it("rejeita corpo sem a chave framing", () => {
    expect(mediaFramingSchema.safeParse({}).success).toBe(false);
  });
});
