import { describe, it, expect } from "vitest";
import {
  sanitizeAnalyticsUrl,
  sanitizeAnalyticsProps,
  isSafeAnalyticsKey,
  isSafeAnalyticsValue,
} from "./analyticsPrivacy";

const ORIGIN = "https://cartas.anterosistemas.com.br";

describe("sanitizeAnalyticsUrl", () => {
  it("remove o slug da carta — é o link privado, nunca pode sair do navegador", () => {
    const url = sanitizeAnalyticsUrl(`${ORIGIN}/c/carta-do-joao-a1b2c3`);
    expect(url).toBe(`${ORIGIN}/c/[slug]`);
    expect(url).not.toContain("joao");
    expect(url).not.toContain("a1b2c3");
  });

  it("remove o id do pedido e preserva o restante do caminho", () => {
    expect(sanitizeAnalyticsUrl(`${ORIGIN}/pedido/cmrzbq6fp000204l2vjhtgvzv/sucesso`)).toBe(
      `${ORIGIN}/pedido/[orderId]/sucesso`,
    );
  });

  it("remove o id do carrinho no checkout", () => {
    expect(sanitizeAnalyticsUrl(`${ORIGIN}/checkout/cmrzbpt5c000104l2f1nt0n1f`)).toBe(
      `${ORIGIN}/checkout/[cartId]`,
    );
  });

  it("descarta query string e fragmento, inclusive em rota privada", () => {
    expect(sanitizeAnalyticsUrl(`${ORIGIN}/c/segredo?token=abc123#pos`)).toBe(
      `${ORIGIN}/c/[slug]`,
    );
    expect(sanitizeAnalyticsUrl(`${ORIGIN}/criar?utm_source=whatsapp`)).toBe(
      `${ORIGIN}/criar`,
    );
  });

  it("preserva rotas públicas sem identificador", () => {
    expect(sanitizeAnalyticsUrl(`${ORIGIN}/`)).toBe(`${ORIGIN}/`);
    expect(sanitizeAnalyticsUrl(`${ORIGIN}/demonstracao`)).toBe(`${ORIGIN}/demonstracao`);
  });

  it("não quebra com URL inválida", () => {
    expect(sanitizeAnalyticsUrl("não é url")).toBe("/");
    expect(sanitizeAnalyticsUrl("")).toBe("/");
  });
});

describe("sanitizeAnalyticsProps", () => {
  it("preserva as propriedades agregadas que o produto realmente usa", () => {
    expect(
      sanitizeAnalyticsProps({
        plan: "premium",
        theme: "romantico",
        photos: 3,
        hasMusic: true,
        code: "network",
      }),
    ).toEqual({
      plan: "premium",
      theme: "romantico",
      photos: 3,
      hasMusic: true,
      code: "network",
    });
  });

  it("descarta chaves de dado pessoal, incluindo variações compostas", () => {
    expect(
      sanitizeAnalyticsProps({
        plan: "basico",
        recipientName: "Maria",
        buyer_email: "a@b.com",
        cpf: "12345678901",
        telefone: "11999998888",
        editToken: "abc",
        cartSlug: "carta-secreta",
      }),
    ).toEqual({ plan: "basico" });
  });

  it("descarta título e conteúdo da carta mesmo com chave de aparência inocente", () => {
    const result = sanitizeAnalyticsProps({
      titulo: "Feliz aniversário, amor",
      mensagem: "Um texto longo de carta que jamais deveria virar telemetria.",
    });
    expect(result).toEqual({});
  });

  it("descarta valor que parece dado pessoal mesmo sob chave permitida", () => {
    expect(sanitizeAnalyticsProps({ origem: "maria@exemplo.com" })).toEqual({});
    expect(sanitizeAnalyticsProps({ origem: "123.456.789-01" })).toEqual({});
    expect(sanitizeAnalyticsProps({ origem: "11999998888" })).toEqual({});
    expect(sanitizeAnalyticsProps({ origem: `${ORIGIN}/c/segredo` })).toEqual({});
  });

  it("descarta texto livre longo — é conteúdo, não rótulo", () => {
    expect(isSafeAnalyticsValue("a".repeat(41))).toBe(false);
    expect(isSafeAnalyticsValue("a".repeat(40))).toBe(true);
  });

  it("não descarta números nem booleanos", () => {
    expect(isSafeAnalyticsValue(3)).toBe(true);
    expect(isSafeAnalyticsValue(true)).toBe(true);
    expect(isSafeAnalyticsValue(null)).toBe(true);
  });

  it("reconhece chaves seguras e inseguras", () => {
    expect(isSafeAnalyticsKey("plan")).toBe(true);
    expect(isSafeAnalyticsKey("count")).toBe(true);
    expect(isSafeAnalyticsKey("EMAIL")).toBe(false);
    expect(isSafeAnalyticsKey("shareUrl")).toBe(false);
  });
});
