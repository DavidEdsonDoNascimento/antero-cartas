import { describe, it, expect } from "vitest";
import { parseEmailMode } from "./emailMode";

describe("parseEmailMode", () => {
  it("aceita 'mock'", () => {
    expect(parseEmailMode("mock")).toBe("mock");
  });

  it("aceita 'real'", () => {
    expect(parseEmailMode("real")).toBe("real");
  });

  it("variável ausente (undefined) lança — sem padrão implícito", () => {
    expect(() => parseEmailMode(undefined)).toThrow(/não está definida/i);
  });

  it("string vazia lança", () => {
    expect(() => parseEmailMode("")).toThrow(/valor inválido/i);
  });

  it("erro de digitação lança (não vira mock silenciosamente)", () => {
    expect(() => parseEmailMode("moock")).toThrow(/valor inválido/i);
    expect(() => parseEmailMode("raal")).toThrow(/valor inválido/i);
  });

  it.each([
    ["REAL", "maiúsculas"],
    ["Mock", "capitalizado"],
    ["banana", "valor desconhecido"],
    ["prod", "nome de outro ambiente"],
    [" mock", "espaço à esquerda"],
    ["mock ", "espaço à direita"],
    ["true", "booleano"],
  ])("rejeita %o (%s)", (value) => {
    expect(() => parseEmailMode(value)).toThrow(/valor inválido/i);
  });

  it("a mensagem de erro nunca ecoa o valor recebido", () => {
    const segredo = "re_1234567890_super_secreto";
    try {
      parseEmailMode(segredo);
      throw new Error("deveria ter lançado");
    } catch (err) {
      expect((err as Error).message).not.toContain(segredo);
    }
  });
});
