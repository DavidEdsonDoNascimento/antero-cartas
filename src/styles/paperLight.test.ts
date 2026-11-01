/**
 * Papel e Luz — o que este CSS NÃO pode fazer, e a paleta que ele promete.
 *
 * O risco real desta identidade é vazar para fora da landing: o `globals.css`
 * é compartilhado com o editor, o checkout e as cartas publicadas, e CSS fora
 * de `@layer` vence qualquer utilidade do Tailwind (a causa raiz do bug do
 * `font-script`, ver PR 1 da task 016). Estes testes travam o escopo.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { contrastHex, WCAG_AA } from "@/lib/contrast";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

const raw = read("src/styles/paper-light.css");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/** Remove `@keyframes nome { … }` (chaves balanceadas) e devolve o resto + os nomes. */
function stripKeyframes(source: string) {
  const names: string[] = [];
  let out = "";
  let i = 0;
  while (i < source.length) {
    const at = source.indexOf("@keyframes", i);
    if (at < 0) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, at);
    const open = source.indexOf("{", at);
    names.push(source.slice(at + "@keyframes".length, open).trim());
    let depth = 0;
    let j = open;
    do {
      if (source[j] === "{") depth++;
      if (source[j] === "}") depth--;
      j++;
    } while (depth > 0 && j < source.length);
    i = j;
  }
  return { rest: out, names };
}

/** Texto dentro das chaves do primeiro bloco que começa em `header`. */
function blockOf(source: string, header: string): string {
  const at = source.indexOf(header);
  if (at < 0) return "";
  const open = source.indexOf("{", at);
  let depth = 0;
  let j = open;
  do {
    if (source[j] === "{") depth++;
    if (source[j] === "}") depth--;
    j++;
  } while (depth > 0 && j < source.length);
  return source.slice(open + 1, j - 1);
}

const { rest, names: keyframeNames } = stripKeyframes(css);

/** Divide uma lista de seletores só nas vírgulas de nível superior (`:is(a, b)` fica inteiro). */
function splitSelectorList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

describe("escopo do CSS da identidade", () => {
  const selectors = [...rest.matchAll(/([^{}]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((s) => s && !s.startsWith("@"))
    .flatMap(splitSelectorList);

  it("tem regras para testar", () => {
    expect(selectors.length).toBeGreaterThan(100);
  });

  it("todo seletor começa em .pl — nada de elemento solto, :root, html ou body", () => {
    const outside = selectors.filter((s) => !/^\.pl(?![a-z0-9_])|^\.pl-/.test(s));
    expect(outside).toEqual([]);
  });

  it("todo @keyframes tem prefixo pl-", () => {
    expect(keyframeNames.length).toBeGreaterThan(5);
    expect(keyframeNames.filter((n) => !n.startsWith("pl-"))).toEqual([]);
  });

  it("não usa @layer, @import nem @font-face (as fontes vêm do next/font)", () => {
    expect(css).not.toMatch(/@layer|@import|@font-face/);
  });

  it("o contexto tipográfico legado é restaurado nas ilhas (.pl-legacy)", () => {
    const legacy = blockOf(css, ".pl-legacy {");
    expect(legacy).toContain("font-family: var(--font-sans)");
    expect(legacy).toContain("color: var(--foreground)");
  });
});

describe("desempenho (LCP)", () => {
  it("o grão de papel só aparece em pseudo-elementos, nunca em um elemento real", () => {
    // Um <div> com `background-image: url(data:…)` vira candidato a LCP. A camada de grão do envelope
    // era exatamente isso: sob CPU 4× mais lenta, o LCP da página saltava de ~450 ms (o texto) para
    // 870–1.360 ms (o grão). Pseudo-elementos não contam; o do envelope agora é um filtro dentro do SVG.
    const rules = [...rest.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[2].includes("var(--pl-grain)"));
    expect(rules.length).toBeGreaterThan(0);
    const real = rules.map((m) => m[1].trim()).filter((sel) => !/::(before|after)\s*$/.test(sel));
    expect(real).toEqual([]);
    expect(css).not.toContain(".pl-grain {");
  });

  it("o grão do bolso e da aba do envelope vive em ::after, e não em elementos próprios nem em filtro SVG", () => {
    const scene = readFileSync(fileURLToPath(new URL("../components/landing/EnvelopeScene.tsx", import.meta.url)), "utf8");
    expect(scene).not.toMatch(/className="pl-grain/);
    // `feTurbulence` dentro do SVG (tentativa anterior) é caro de rasterizar e atrasa a pintura do texto
    // sob CPU lenta: o LCP oscilava entre 890 e 1.390 ms. O ladrilho de 180 px em ::after é barato.
    expect(scene).not.toContain("feTurbulence");
    expect(css).toMatch(/\.pl-sheen::after\s*\{[^}]*var\(--pl-grain\)/);
    expect(css).toMatch(/\.pl-flap-out::after\s*\{[^}]*var\(--pl-grain\)/);
  });
});

describe("foco do teclado", () => {
  const focus = blockOf(css, ".pl :is(a, button, summary, [tabindex]):focus-visible:not(.pl-legacy *)");

  it("tem anel próprio em outline (não depende de box-shadow, que os botões usam)", () => {
    expect(focus).toMatch(/outline:\s*3px solid var\(--pl-wine\)/);
    expect(focus).toMatch(/outline-offset:\s*3px/);
  });

  it("o anel de .pl tem especificidade maior que a de qualquer botão com sombra própria", () => {
    // `.pl :is(...)` (1 classe) + `:focus-visible` (1 pseudo-classe) + `:not(.pl-legacy *)` (1 classe) ≥ 3.
    // Um botão é `.pl-btn--primary` (1 classe). O anel precisa vencer sem depender da ordem dos arquivos.
    expect(css).toMatch(/\.pl :is\(a, button, summary, \[tabindex\]\):focus-visible:not\(\.pl-legacy \*\)/);
  });

  it("não toca nos controles das cartas (ilha legada)", () => {
    expect(css).toContain(":not(.pl-legacy *)");
  });

  it("o anel do trecho escuro é branco e o cabeçalho fixo não cobre o foco", () => {
    expect(blockOf(css, ".pl .pl-final :is(a, button):focus-visible:not(.pl-legacy *)")).toContain("outline-color: #fff");
    expect(css).toMatch(/scroll-margin-block:\s*92px/);
  });

  it("toda regra de foco que sobrescreve o anel tem especificidade igual ou maior que a do anel base", () => {
    // O anel base soma 4 classes/pseudo-classes. Uma sobrescrita com menos (ex.: o branco do trecho
    // escuro, que chegou a perder e deixou o anel vinho sobre fundo vinho) simplesmente não vale.
    const overrides = [".pl .pl-btn--primary:focus-visible", ".pl .pl-btn--gold:focus-visible", ".pl .pl-final :is(a, button):focus-visible"];
    for (const o of overrides) expect(css, o).toContain(`${o}:not(.pl-legacy *)`);
  });

  it("o contraste do anel (vinho sobre papel e branco sobre vinho escuro) passa de 3:1", () => {
    const wine = raw.match(/--pl-wine:\s*(#[0-9a-fA-F]{6})/)![1];
    const deep = raw.match(/--pl-wine-deep:\s*(#[0-9a-fA-F]{6})/)![1];
    expect(contrastHex(wine, "#fbf7f2")).toBeGreaterThanOrEqual(WCAG_AA.largeTextOrNonText);
    expect(contrastHex("#ffffff", deep)).toBeGreaterThanOrEqual(WCAG_AA.largeTextOrNonText);
  });
});

describe("navegadores sem unidades de container (cqw)", () => {
  const noCq = blockOf(css, "@supports not (width: 1cqw)");

  it("toda medida da cena passa por --u: nenhuma unidade cqw solta", () => {
    // Só a definição de --u e os testes de recurso `@supports (width: 1cqw)` podem citar a unidade.
    expect(css.replace("--u: 1cqw", "").replaceAll("(width: 1cqw)", "")).not.toMatch(/\d\s*cqw/);
    expect(css).toContain("--u: 1cqw");
  });

  it("sem cqw, --u ganha uma aproximação em vw para cada largura de layout", () => {
    expect(css).toMatch(/--u:\s*calc\(\(100vw - 40px\) \/ 100\)/);
    expect(css).toMatch(/--u:\s*min\(6\.2px, calc\(\(100vw - 56px\) \/ 100\)\)/);
    expect(css).toMatch(/--u:\s*calc\(\(min\(100vw, 1200px\) - 140px\) \* 0\.0051\)/);
  });

  it("o palco ganha tamanho explícito, sem depender de aspect-ratio nem de container", () => {
    expect(noCq).toContain("height: calc(98 * var(--u))");
    expect(noCq).toContain(".pl-env");
    expect(noCq).toContain(".pl-photo__img");
    // sem animação, nada de "toque para ver de novo"
    expect(noCq).toMatch(/\.pl-stage__hit,\s*\.pl-stage__again\s*\{\s*display:\s*none/);
  });

  it("a cena NUNCA some: nenhuma regra esconde a hero ou o palco", () => {
    expect(css).not.toMatch(/\.pl-hero__stage\s*\{[^}]*display:\s*none/);
    expect(css).not.toMatch(/\.pl-stage\s*\{[^}]*display:\s*none/);
  });

  it("o estado fechado e a animação só existem onde há cqw: sem ele, a cena nasce aberta", () => {
    const supported = blockOf(css, "@supports (width: 1cqw) {\n  @media (prefers-reduced-motion: no-preference)");
    expect(supported).toContain('data-state="closed"');
    expect(supported).toContain('data-state="opening"');
  });
});

describe("estado base = envelope aberto (movimento reduzido e navegador sem cqw)", () => {
  it("sem animação, a aba fechada fica recolhida e o lacre ausente", () => {
    // Era um defeito real: a carta saía por cima, mas a aba fechada e o lacre continuavam
    // desenhados na frente do envelope, uma cena impossível.
    expect(blockOf(css, ".pl-flap-out {")).toContain("transform: scaleY(0)");
    expect(blockOf(css, ".pl-seal {")).toContain("opacity: 0");
  });

  it("só o estado fechado da animação devolve a aba e o lacre", () => {
    const supported = blockOf(css, "@supports (width: 1cqw) {\n  @media (prefers-reduced-motion: no-preference)");
    expect(blockOf(supported, '.pl-stage[data-state="closed"] .pl-seal {')).toContain("opacity: 1");
    expect(blockOf(supported, '.pl-stage[data-state="closed"] .pl-flap-out {')).toContain("transform: scaleY(1)");
  });
});

describe("movimento", () => {
  it("o estado inicial fechado e todas as animações só valem com movimento permitido", () => {
    const allowed = blockOf(css, "@media (prefers-reduced-motion: no-preference)");
    const outside = css.replace(allowed, "");
    expect(allowed).toContain('data-state="closed"');
    expect(allowed).toContain('data-state="opening"');
    // Fora do bloco, só a definição das keyframes e a regra de movimento reduzido.
    const stray = stripKeyframes(outside).rest.match(/data-state|animation(?:-[a-z]+)?:(?!\s*none)/g);
    expect(stray).toBeNull();
  });

  it("com movimento reduzido nada anima e o botão de rever some", () => {
    const reduced = blockOf(css, "@media (prefers-reduced-motion: reduce)");
    expect(reduced).toMatch(/animation:\s*none\s*!important/);
    expect(reduced).toMatch(/transition:\s*none\s*!important/);
    expect(reduced).toContain(".pl-stage__hit");
  });

  it("a abertura inteira dura menos de 5 s (WCAG 2.2.2) e não repete", () => {
    const opening = blockOf(css, "@media (prefers-reduced-motion: no-preference)");
    let longest = 0;
    for (const m of opening.matchAll(/animation:\s*pl-[a-z-]+\s+([\d.]+)s[^;]*?([\d.]+)s\s+both/g)) {
      longest = Math.max(longest, Number(m[1]) + Number(m[2]));
    }
    expect(longest).toBeGreaterThan(2);
    expect(longest).toBeLessThan(5);
    expect(opening).not.toMatch(/infinite/);
  });

  it("anima só transform e opacity (nada que force layout)", () => {
    const animated = [...css.matchAll(/@keyframes pl-[a-z-]+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
    const props = new Set([...animated.matchAll(/([a-z-]+):\s*[^;{]+;/g)].map((m) => m[1]));
    expect([...props].filter((p) => !["transform", "opacity"].includes(p))).toEqual([]);
  });
});

describe("paleta e contraste (WCAG 2.2 AA)", () => {
  const token = (name: string) => raw.match(new RegExp(`--pl-${name}:\\s*(#[0-9a-fA-F]{6})`))![1];
  const c = {
    paper: token("paper"),
    paper2: token("paper-2"),
    ink: token("ink"),
    ink2: token("ink-2"),
    wine: token("wine"),
    wineDeep: token("wine-deep"),
    wineNight: token("wine-night"),
    gold: token("gold"),
    goldInk: token("gold-ink"),
    rose: token("rose"),
    line: token("line"),
  };

  it("usa exatamente a paleta aprovada", () => {
    expect(c.paper.toLowerCase()).toBe("#fbf7f2");
    expect(c.ink.toLowerCase()).toBe("#342729");
    expect(c.wine.toLowerCase()).toBe("#782b45");
    expect(c.rose.toLowerCase()).toBe("#dcaeb4");
    expect(c.gold.toLowerCase()).toBe("#b99161");
  });

  it.each([
    ["texto principal sobre papel", "ink", "paper", 7],
    ["texto principal sobre papel-2", "ink", "paper2", 7],
    ["texto secundário sobre papel", "ink2", "paper", WCAG_AA.text],
    ["texto secundário sobre papel-2", "ink2", "paper2", WCAG_AA.text],
    ["vinho (links) sobre papel", "wine", "paper", WCAG_AA.text],
    ["etiqueta dourada escura sobre papel", "goldInk", "paper", WCAG_AA.text],
    ["etiqueta dourada escura sobre papel-2", "goldInk", "paper2", WCAG_AA.text],
    ["texto do botão dourado (tinta sobre ouro)", "ink", "gold", WCAG_AA.text],
    ["borda dos botões e campos (não textual)", "line", "paper", WCAG_AA.largeTextOrNonText],
  ] as const)("%s", (_nome, fg, bg, min) => {
    expect(contrastHex(c[fg], c[bg])).toBeGreaterThanOrEqual(min);
  });

  it.each([
    ["botão principal (branco sobre vinho)", "#ffffff", "wine"],
    ["botão principal em hover (branco sobre vinho-escuro)", "#ffffff", "wineDeep"],
    ["título da chamada final", "#ffffff", "wineDeep"],
    ["texto da chamada final", "#f0e1e4", "wineDeep"],
    ["destaque em itálico da chamada final", "#f1c9d2", "wineDeep"],
    ["texto da chamada final no fim do degradê", "#f0e1e4", "wineNight"],
  ] as const)("%s", (_nome, fg, bg) => {
    expect(contrastHex(fg, c[bg])).toBeGreaterThanOrEqual(WCAG_AA.text);
  });

  it("dourado e rosé reprovam como texto sobre papel — por isso nunca viram `color:`", () => {
    expect(contrastHex(c.gold, c.paper)).toBeLessThan(WCAG_AA.text);
    expect(contrastHex(c.rose, c.paper)).toBeLessThan(WCAG_AA.largeTextOrNonText);
    expect(css).not.toMatch(/(^|[;\s{])color:\s*var\(--pl-(gold|rose)\)/);
  });
});
