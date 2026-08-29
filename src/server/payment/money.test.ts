import { describe, it, expect } from "vitest";
import { toCentsExact } from "./money";

describe("toCentsExact", () => {
  it("converte um valor exato de duas casas decimais", () => {
    expect(toCentsExact(18.9)).toBe(1890);
    expect(toCentsExact(48.9)).toBe(4890);
    expect(toCentsExact(0.01)).toBe(1);
    expect(toCentsExact(1)).toBe(100);
  });

  it("não usa comparação de ponto flutuante vulnerável — valores clássicos de armadilha", () => {
    // 0.1 + 0.2 !== 0.3 em ponto flutuante puro; a função precisa acertar
    // mesmo assim, porque a validação é por reconstrução, não por soma.
    expect(toCentsExact(0.1 + 0.2)).toBe(30);
    expect(toCentsExact(19.99)).toBe(1999);
    expect(toCentsExact(100.1)).toBe(10010);
  });

  it("rejeita valores com casas decimais incompatíveis com centavos", () => {
    expect(toCentsExact(18.905)).toBeNull();
    expect(toCentsExact(18.001)).toBeNull();
    expect(toCentsExact(0.001)).toBeNull();
  });

  it("rejeita não-finito, negativo, zero e não-número", () => {
    expect(toCentsExact(NaN)).toBeNull();
    expect(toCentsExact(Infinity)).toBeNull();
    expect(toCentsExact(-Infinity)).toBeNull();
    expect(toCentsExact(-18.9)).toBeNull();
    expect(toCentsExact(0)).toBeNull();
    expect(toCentsExact(null)).toBeNull();
    expect(toCentsExact(undefined)).toBeNull();
  });
});
