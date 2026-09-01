import { describe, it, expect } from "vitest";
import { hexToRgb, relativeLuminance, over, contrastRatio, contrastHex } from "@/lib/contrast";

describe("hexToRgb", () => {
  it("converte hex de 6 dígitos", () => {
    expect(hexToRgb("#681d35")).toEqual([0x68, 0x1d, 0x35]);
  });

  it("expande hex de 3 dígitos", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("#000")).toEqual([0, 0, 0]);
  });

  it("rejeita formato inválido", () => {
    expect(() => hexToRgb("#ggg")).toThrow();
    expect(() => hexToRgb("not-a-color")).toThrow();
  });
});

describe("relativeLuminance", () => {
  it("preto = 0, branco = 1 (valores de referência do W3C)", () => {
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio / contrastHex", () => {
  it("preto sobre branco = 21:1 (máximo possível)", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });

  it("cor contra ela mesma = 1:1 (mínimo possível)", () => {
    expect(contrastHex("#681d35", "#681d35")).toBeCloseTo(1, 5);
  });

  it("é simétrico (ordem dos argumentos não importa)", () => {
    const a = contrastHex("#681d35", "#fff9f4");
    const b = contrastHex("#fff9f4", "#681d35");
    expect(a).toBeCloseTo(b, 10);
  });

  it("bate com um par conhecido (vinho da marca sobre creme da marca)", () => {
    // Valor de referência calculado independentemente para esta auditoria.
    expect(contrastHex("#681d35", "#fff9f4")).toBeCloseTo(11.07, 1);
  });
});

describe("over (simula opacidade sobre um fundo sólido)", () => {
  it("alpha 1 = a própria cor de primeiro plano", () => {
    expect(over([255, 255, 255], [0, 0, 0], 1)).toEqual([255, 255, 255]);
  });

  it("alpha 0 = o próprio fundo", () => {
    expect(over([255, 255, 255], [10, 20, 30], 0)).toEqual([10, 20, 30]);
  });

  it("alpha 0.5 = média exata dos dois canais", () => {
    expect(over([200, 200, 200], [0, 0, 0], 0.5)).toEqual([100, 100, 100]);
  });
});
