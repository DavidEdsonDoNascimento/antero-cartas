/**
 * Contraste de cor (WCAG 2.1) — usado para validar os temas da carta pública
 * em `src/content/themes.test.ts` e, no código de produção, apenas como
 * utilitário puro (sem custo em runtime além do necessário).
 *
 * Implementa luminância relativa sRGB (fórmula do próprio W3C) e a razão de
 * contraste (L1+0.05)/(L2+0.05). Aceita alpha para simular texto/overlay
 * translúcido sobre um fundo sólido — é assim que o produto usa opacidade em
 * vários lugares (ex.: `text-white/70`).
 */

export type RGB = [number, number, number];

/** Converte "#rgb" ou "#rrggbb" em [r,g,b] (0-255). Lança em formato inválido. */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Cor hexadecimal inválida: "${hex}"`);
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Luminância relativa (0 a 1) de uma cor sRGB. */
export function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/**
 * Simula `fg` renderizado com opacidade `alpha` (0-1) sobre o fundo sólido
 * `bg` — o mesmo resultado visual que `color-mix()`/`rgba()` produzem.
 */
export function over(fg: RGB, bg: RGB, alpha: number): RGB {
  return [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha))) as RGB;
}

/** Razão de contraste WCAG entre duas cores sRGB (1 a 21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Atalho: razão de contraste direto entre dois hex. */
export function contrastHex(fgHex: string, bgHex: string): number {
  return contrastRatio(hexToRgb(fgHex), hexToRgb(bgHex));
}

/** Mínimos WCAG 2.1 AA usados nesta auditoria. */
export const WCAG_AA = {
  /** Texto normal (a maioria do produto: 12-16px, peso regular/medium). */
  text: 4.5,
  /** Texto grande (≥24px regular ou ≥18.66px/14pt bold) e componentes não-textuais de UI (SC 1.4.11). */
  largeTextOrNonText: 3.0,
} as const;
