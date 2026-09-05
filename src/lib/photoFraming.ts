/**
 * Enquadramento das fotos da cartinha — fonte ÚNICA da regra de exibição.
 *
 * O problema que este módulo resolve: a foto é exibida numa moldura de
 * proporção fixa (`CARD_PHOTO_ASPECT`) com `object-fit: cover`. Sem mais
 * nenhuma informação, o navegador recorta pelo centro (`object-position:
 * 50% 50%`), e uma foto vertical perde topo e base — foi assim que a parte
 * de cima de uma cabeça sumiu numa carta real.
 *
 * A correção NÃO mexe no arquivo enviado: guarda só três números por foto —
 * o ponto da imagem que deve ficar no centro da moldura (`x`/`y`, ambos
 * normalizados em 0..1) e um multiplicador de zoom sobre o enquadramento
 * "cover". Nada de deslocamento em pixels: a mesma metadata vale para a
 * miniatura quadrada da etapa Extras, para a moldura 4:3 da carta e para
 * qualquer tamanho de tela.
 *
 * Prévia e carta pública consomem `framingStyle()` — não existe segundo
 * caminho de renderização por onde as duas possam divergir.
 */

import type { CSSProperties } from "react";

export interface PhotoFraming {
  /** Ponto focal horizontal: 0 = borda esquerda da foto, 1 = borda direita. */
  x: number;
  /** Ponto focal vertical: 0 = topo da foto, 1 = base. */
  y: number;
  /** Multiplicador sobre o enquadramento "cover". 1 = sem zoom. */
  zoom: number;
}

/**
 * Proporção da moldura de foto na carta (carrossel) — número, não string,
 * para servir tanto ao CSS (`aspect-ratio` é unitless) quanto às contas do
 * editor. Fonte única: o editor precisa mostrar EXATAMENTE a moldura que vai
 * recortar a foto na carta.
 */
export const CARD_PHOTO_ASPECT = 4 / 3;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/**
 * Ausência de ajuste. Igual ao comportamento histórico: `object-cover`
 * centralizado, sem zoom — por isso fotos e cartas antigas (sem metadados)
 * continuam exatamente como sempre foram.
 */
export const DEFAULT_FRAMING: PhotoFraming = { x: 0.5, y: 0.5, zoom: 1 };

/** 4 casas bastam: 1/10000 da largura da foto é bem menos que um pixel. */
function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function clampNumber(n: unknown, min: number, max: number, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n)
    ? round(Math.min(max, Math.max(min, n)))
    : fallback;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Normaliza qualquer entrada (cliente, banco antigo, JSON malformado) num
 * enquadramento válido. Também usada no servidor — o cliente nunca é a
 * última palavra sobre esses valores.
 */
export function clampFraming(input: Partial<PhotoFraming> | null | undefined): PhotoFraming {
  if (!input) return DEFAULT_FRAMING;
  return {
    x: clampNumber(input.x, 0, 1, DEFAULT_FRAMING.x),
    y: clampNumber(input.y, 0, 1, DEFAULT_FRAMING.y),
    zoom: clampNumber(input.zoom, MIN_ZOOM, MAX_ZOOM, DEFAULT_FRAMING.zoom),
  };
}

export function isDefaultFraming(framing: PhotoFraming | null | undefined): boolean {
  if (!framing) return true;
  const f = clampFraming(framing);
  return f.x === DEFAULT_FRAMING.x && f.y === DEFAULT_FRAMING.y && f.zoom === DEFAULT_FRAMING.zoom;
}

function pct(n: number): string {
  return `${round(n * 100)}%`;
}

/**
 * Estilo da <img> dentro de uma moldura com `overflow: hidden`.
 *
 * Como funciona: `object-position: X% Y%` alinha o ponto X%/Y% da IMAGEM com
 * o ponto X%/Y% da MOLDURA — um enquadramento que, por construção, nunca
 * deixa faixa vazia (em 0% encosta a borda inicial, em 100% a final). O zoom
 * entra como `scale()` ancorado no MESMO ponto (`transform-origin`), então o
 * ponto escolhido pelo cliente fica parado enquanto o resto se expande à
 * volta dele; como a origem está dentro da moldura e a escala é ≥ 1, a
 * moldura continua totalmente coberta.
 *
 * Sem ajuste, devolve só `object-fit: cover` — exatamente o que a carta
 * renderizava antes deste recurso existir.
 */
export function framingStyle(framing: PhotoFraming | null | undefined): CSSProperties {
  if (isDefaultFraming(framing)) return { objectFit: "cover" };
  const { x, y, zoom } = clampFraming(framing);
  const origin = `${pct(x)} ${pct(y)}`;
  return {
    objectFit: "cover",
    objectPosition: origin,
    ...(zoom > MIN_ZOOM ? { transform: `scale(${zoom})`, transformOrigin: origin } : {}),
  };
}

// --- Apoio ao editor de enquadramento ---------------------------------------

export interface Size {
  width: number;
  height: number;
}

/**
 * Quanto a foto "sobra" para fora da moldura, em pixels, nos dois eixos.
 * É exatamente o curso disponível para arrastar: mover `x` de 0 a 1 desloca
 * a imagem em `overflow.width` pixels (ver `panBy`). Sobra 0 num eixo
 * significa que não há o que arrastar nele.
 */
export function framingOverflow(frame: Size, natural: Size, zoom: number): Size {
  if (frame.width <= 0 || frame.height <= 0 || natural.width <= 0 || natural.height <= 0) {
    return { width: 0, height: 0 };
  }
  const cover = Math.max(frame.width / natural.width, frame.height / natural.height);
  const scale = cover * clampNumber(zoom, MIN_ZOOM, MAX_ZOOM, MIN_ZOOM);
  return {
    width: Math.max(0, natural.width * scale - frame.width),
    height: Math.max(0, natural.height * scale - frame.height),
  };
}

/**
 * Converte um arraste em pixels na variação normalizada de `x`/`y`.
 * Arrastar para a direita revela a parte esquerda da foto, então o ponto
 * focal anda no sentido contrário — daí o sinal negativo.
 */
export function panBy(
  framing: PhotoFraming,
  delta: { x: number; y: number },
  overflow: Size,
): PhotoFraming {
  return {
    ...framing,
    x: overflow.width > 0 ? round(clamp01(framing.x - delta.x / overflow.width)) : framing.x,
    y: overflow.height > 0 ? round(clamp01(framing.y - delta.y / overflow.height)) : framing.y,
  };
}
