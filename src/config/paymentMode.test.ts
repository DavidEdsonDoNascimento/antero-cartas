import { describe, it, expect } from "vitest";
import {
  parsePaymentMode,
  assertPaymentModeConsistency,
  DEFAULT_PAYMENT_MODE,
} from "./paymentMode";

describe("parsePaymentMode", () => {
  it("aceita os dois valores válidos", () => {
    expect(parsePaymentMode("mock", "PAYMENT_MODE")).toBe("mock");
    expect(parsePaymentMode("real", "PAYMENT_MODE")).toBe("real");
  });

  it("variável ausente vira o padrão 'mock' (comportamento preservado)", () => {
    expect(parsePaymentMode(undefined, "PAYMENT_MODE")).toBe("mock");
    expect(DEFAULT_PAYMENT_MODE).toBe("mock");
  });

  it.each([
    ["REAL", "maiúsculas"],
    ["Real", "capitalizado"],
    ["MOCK", "maiúsculas"],
    ["prod", "nome de outro ambiente"],
    ["production", "nome de outro ambiente"],
    ["reall", "typo"],
    ["", "string vazia"],
    [" ", "só espaço"],
    [" real", "espaço à esquerda"],
    ["real ", "espaço à direita"],
    ["true", "booleano"],
  ])("rejeita %o (%s)", (value) => {
    expect(() => parsePaymentMode(value, "PAYMENT_MODE")).toThrow(/valor inválido/i);
  });

  it("a mensagem de erro nomeia a variável mas nunca ecoa o valor recebido", () => {
    // Um erro de configuração é justamente o caso em que a variável pode
    // conter algo que não deveria — e mensagem de erro vai parar em log.
    const segredo = "APP_USR-1234567890-super-secreto";
    try {
      parsePaymentMode(segredo, "PAYMENT_MODE");
      throw new Error("deveria ter lançado");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("PAYMENT_MODE");
      expect(message).not.toContain(segredo);
      expect(message).not.toContain("APP_USR");
    }
  });

  it("usa o nome de variável recebido na mensagem", () => {
    expect(() => parsePaymentMode("prod", "NEXT_PUBLIC_PAYMENT_MODE")).toThrow(
      /NEXT_PUBLIC_PAYMENT_MODE/,
    );
  });
});

describe("assertPaymentModeConsistency", () => {
  it("as duas ausentes é consistente e vale 'mock' (comportamento preservado)", () => {
    expect(assertPaymentModeConsistency(undefined, undefined)).toBe("mock");
  });

  it("modos iguais passam e devolvem o modo", () => {
    expect(assertPaymentModeConsistency("mock", "mock")).toBe("mock");
    expect(assertPaymentModeConsistency("real", "real")).toBe("real");
  });

  it("padrão aplicado antes de comparar: só uma definida como 'mock' é consistente", () => {
    expect(assertPaymentModeConsistency(undefined, "mock")).toBe("mock");
    expect(assertPaymentModeConsistency("mock", undefined)).toBe("mock");
  });

  it("meio caminho para cobrança real falha: só uma definida como 'real'", () => {
    expect(() => assertPaymentModeConsistency("real", undefined)).toThrow(/divergem/i);
    expect(() => assertPaymentModeConsistency(undefined, "real")).toThrow(/divergem/i);
  });

  it("valores válidos porém diferentes falham nos dois sentidos", () => {
    expect(() => assertPaymentModeConsistency("real", "mock")).toThrow(/divergem/i);
    expect(() => assertPaymentModeConsistency("mock", "real")).toThrow(/divergem/i);
  });

  it("a mensagem de divergência nomeia as duas variáveis e os dois modos", () => {
    expect(() => assertPaymentModeConsistency("real", "mock")).toThrow(/PAYMENT_MODE/);
    expect(() => assertPaymentModeConsistency("real", "mock")).toThrow(
      /NEXT_PUBLIC_PAYMENT_MODE/,
    );
    expect(() => assertPaymentModeConsistency("real", "mock")).toThrow(/"real"/);
    expect(() => assertPaymentModeConsistency("real", "mock")).toThrow(/"mock"/);
  });

  it("valor inválido em qualquer um dos lados falha como inválido, não como divergência", () => {
    expect(() => assertPaymentModeConsistency("REAL", "real")).toThrow(/valor inválido/i);
    expect(() => assertPaymentModeConsistency("real", "REAL")).toThrow(/valor inválido/i);
  });
});
