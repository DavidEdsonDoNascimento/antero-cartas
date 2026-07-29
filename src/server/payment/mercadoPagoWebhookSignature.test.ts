import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyMercadoPagoSignature } from "./mercadoPagoWebhookSignature";

const SECRET = "test-secret-123";

/** Constrói um x-signature válido do jeito que o Mercado Pago documenta. */
function buildValidSignature(dataId: string, requestId: string, ts: string, secret = SECRET): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("verifyMercadoPagoSignature", () => {
  it("aceita uma assinatura válida", () => {
    const xSignature = buildValidSignature("123456789", "req-1", "1700000000000");
    expect(
      verifyMercadoPagoSignature({
        xSignature,
        xRequestId: "req-1",
        dataId: "123456789",
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it("aceita data.id em maiúsculas na entrada (normaliza para minúsculas no manifest)", () => {
    const xSignature = buildValidSignature("123456789", "req-1", "1700000000000");
    expect(
      verifyMercadoPagoSignature({
        xSignature,
        xRequestId: "req-1",
        dataId: "123456789",
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it("rejeita quando o segredo está errado", () => {
    const xSignature = buildValidSignature("123456789", "req-1", "1700000000000", "outro-segredo");
    expect(
      verifyMercadoPagoSignature({
        xSignature,
        xRequestId: "req-1",
        dataId: "123456789",
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejeita quando o data.id foi adulterado", () => {
    const xSignature = buildValidSignature("123456789", "req-1", "1700000000000");
    expect(
      verifyMercadoPagoSignature({
        xSignature,
        xRequestId: "req-1",
        dataId: "999999999", // não é o id usado para construir o manifest original
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejeita quando o x-request-id foi adulterado", () => {
    const xSignature = buildValidSignature("123456789", "req-1", "1700000000000");
    expect(
      verifyMercadoPagoSignature({
        xSignature,
        xRequestId: "req-outro",
        dataId: "123456789",
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejeita sem segredo configurado (fail-closed)", () => {
    const xSignature = buildValidSignature("123456789", "req-1", "1700000000000");
    expect(
      verifyMercadoPagoSignature({
        xSignature,
        xRequestId: "req-1",
        dataId: "123456789",
        secret: "",
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        xSignature,
        xRequestId: "req-1",
        dataId: "123456789",
        secret: undefined,
      }),
    ).toBe(false);
  });

  it("rejeita cabeçalho x-signature ausente", () => {
    expect(
      verifyMercadoPagoSignature({
        xSignature: null,
        xRequestId: "req-1",
        dataId: "123456789",
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejeita x-request-id ausente", () => {
    const xSignature = buildValidSignature("123456789", "req-1", "1700000000000");
    expect(
      verifyMercadoPagoSignature({
        xSignature,
        xRequestId: null,
        dataId: "123456789",
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejeita x-signature malformado (sem ts ou v1)", () => {
    expect(
      verifyMercadoPagoSignature({
        xSignature: "banana",
        xRequestId: "req-1",
        dataId: "123456789",
        secret: SECRET,
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        xSignature: "ts=1700000000000",
        xRequestId: "req-1",
        dataId: "123456789",
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejeita v1 de tamanho diferente sem lançar erro", () => {
    expect(
      verifyMercadoPagoSignature({
        xSignature: "ts=1700000000000,v1=curto",
        xRequestId: "req-1",
        dataId: "123456789",
        secret: SECRET,
      }),
    ).toBe(false);
  });
});
