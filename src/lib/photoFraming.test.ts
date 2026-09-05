/**
 * Regra de enquadramento das fotos.
 *
 * O ponto mais importante destes testes é o primeiro bloco: uma foto SEM
 * metadados precisa continuar sendo renderizada exatamente como era antes do
 * recurso existir — `object-fit: cover` centralizado, sem `object-position` e
 * sem `transform`. É esse contrato que garante que cartas já publicadas não
 * mudem de aparência por causa desta mudança.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_FRAMING,
  MAX_ZOOM,
  MIN_ZOOM,
  clampFraming,
  framingOverflow,
  framingStyle,
  isDefaultFraming,
  panBy,
} from "@/lib/photoFraming";

describe("compatibilidade com fotos antigas (sem metadados)", () => {
  it("renderiza `null` com o recorte de sempre: só cover, nada mais", () => {
    expect(framingStyle(null)).toEqual({ objectFit: "cover" });
    expect(framingStyle(undefined)).toEqual({ objectFit: "cover" });
  });

  it("trata o enquadramento padrão como ausência de ajuste", () => {
    expect(isDefaultFraming(null)).toBe(true);
    expect(isDefaultFraming({ x: 0.5, y: 0.5, zoom: 1 })).toBe(true);
    expect(framingStyle({ x: 0.5, y: 0.5, zoom: 1 })).toEqual({ objectFit: "cover" });
  });

  it("uma foto sem ajuste não ganha transform nem object-position", () => {
    const style = framingStyle(null);
    expect(style).not.toHaveProperty("transform");
    expect(style).not.toHaveProperty("objectPosition");
  });

  it("clampFraming devolve o padrão para entrada ausente", () => {
    expect(clampFraming(null)).toEqual(DEFAULT_FRAMING);
    expect(clampFraming(undefined)).toEqual(DEFAULT_FRAMING);
    expect(clampFraming({})).toEqual(DEFAULT_FRAMING);
  });
});

describe("clampFraming", () => {
  it("mantém valores válidos", () => {
    expect(clampFraming({ x: 0.2, y: 0.85, zoom: 1.4 })).toEqual({ x: 0.2, y: 0.85, zoom: 1.4 });
  });

  it("corta valores fora de faixa em vez de recusá-los", () => {
    expect(clampFraming({ x: -3, y: 42, zoom: 99 })).toEqual({ x: 0, y: 1, zoom: MAX_ZOOM });
    expect(clampFraming({ x: 0.5, y: 0.5, zoom: 0.1 })).toEqual({ x: 0.5, y: 0.5, zoom: MIN_ZOOM });
  });

  it("ignora valores não numéricos e cai no padrão de cada eixo", () => {
    const bogus = { x: NaN, y: Infinity, zoom: "2" } as unknown as { x: number; y: number; zoom: number };
    expect(clampFraming(bogus)).toEqual(DEFAULT_FRAMING);
  });

  it("arredonda para 4 casas — não guarda ruído de ponto flutuante", () => {
    expect(clampFraming({ x: 0.123456789, y: 0.5, zoom: 1 }).x).toBe(0.1235);
  });
});

describe("framingStyle", () => {
  it("aplica o ponto focal como object-position", () => {
    expect(framingStyle({ x: 0.25, y: 0, zoom: 1 })).toEqual({
      objectFit: "cover",
      objectPosition: "25% 0%",
    });
  });

  it("ancora o zoom no MESMO ponto focal — é isso que mantém o rosto parado", () => {
    const style = framingStyle({ x: 0.3, y: 0.2, zoom: 1.5 });
    expect(style.objectPosition).toBe("30% 20%");
    expect(style.transformOrigin).toBe("30% 20%");
    expect(style.transform).toBe("scale(1.5)");
  });

  it("normaliza valores fora de faixa vindos do banco antes de renderizar", () => {
    expect(framingStyle({ x: 5, y: -5, zoom: 100 })).toEqual({
      objectFit: "cover",
      objectPosition: "100% 0%",
      transform: `scale(${MAX_ZOOM})`,
      transformOrigin: "100% 0%",
    });
  });
});

describe("framingOverflow — quanto da foto sobra para fora da moldura", () => {
  const frame = { width: 400, height: 300 }; // 4:3

  it("foto vertical numa moldura horizontal sobra só na vertical", () => {
    // 300×400 em 400×300: cover escala por largura (400/300), altura vira 533.
    const over = framingOverflow(frame, { width: 300, height: 400 }, 1);
    expect(over.width).toBe(0);
    expect(Math.round(over.height)).toBe(233);
  });

  it("foto com a proporção exata da moldura não sobra em eixo nenhum", () => {
    expect(framingOverflow(frame, { width: 800, height: 600 }, 1)).toEqual({
      width: 0,
      height: 0,
    });
  });

  it("com zoom, passa a sobrar nos dois eixos", () => {
    const over = framingOverflow(frame, { width: 800, height: 600 }, 2);
    expect(over.width).toBe(400);
    expect(over.height).toBe(300);
  });

  it("dimensões inválidas não produzem NaN", () => {
    expect(framingOverflow(frame, { width: 0, height: 0 }, 1)).toEqual({ width: 0, height: 0 });
  });
});

describe("panBy — arraste em pixels vira posição normalizada", () => {
  const centered = { x: 0.5, y: 0.5, zoom: 1 };

  it("arrastar a foto para baixo revela a parte de CIMA (o topo da cabeça)", () => {
    // Curso de 200px: arrastar 100px para baixo move meio curso.
    const next = panBy(centered, { x: 0, y: 100 }, { width: 0, height: 200 });
    expect(next.y).toBe(0);
    expect(next.x).toBe(0.5); // sem sobra horizontal, o eixo não se move
  });

  it("nunca ultrapassa as bordas (a moldura nunca fica com faixa vazia)", () => {
    const far = panBy(centered, { x: -9999, y: 9999 }, { width: 200, height: 200 });
    expect(far.x).toBe(1);
    expect(far.y).toBe(0);
  });

  it("preserva o zoom", () => {
    expect(panBy({ x: 0.5, y: 0.5, zoom: 2.5 }, { x: 10, y: 0 }, { width: 100, height: 100 }).zoom)
      .toBe(2.5);
  });

  it("sem curso disponível, arrastar não muda nada", () => {
    expect(panBy(centered, { x: 50, y: 50 }, { width: 0, height: 0 })).toEqual(centered);
  });
});
