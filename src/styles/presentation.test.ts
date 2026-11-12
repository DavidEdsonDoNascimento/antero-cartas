/**
 * Apresentação 2.0 — o que este CSS não pode fazer.
 *
 * `globals.css` é compartilhado com a carta legada, o editor e o checkout; CSS
 * fora de `@layer` vence qualquer utilidade do Tailwind. Como em
 * `paperLight.test.ts`, estes testes travam o escopo em `.ps`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const raw = readFileSync(fileURLToPath(new URL("./presentation.css", import.meta.url)), "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

function stripBlocks(source: string, at: string) {
  const names: string[] = [];
  let out = "";
  let i = 0;
  while (i < source.length) {
    const start = source.indexOf(at, i);
    if (start < 0) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, start);
    const open = source.indexOf("{", start);
    names.push(source.slice(start + at.length, open).trim());
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

const { rest, names: keyframes } = stripBlocks(css, "@keyframes");

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

describe("escopo do CSS da apresentação", () => {
  const selectors = [...rest.matchAll(/([^{}]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((s) => s && !s.startsWith("@"))
    .flatMap(splitSelectorList);

  it("tem regras para testar", () => {
    expect(selectors.length).toBeGreaterThan(80);
  });

  it("todo seletor começa em .ps — nada de elemento solto, :root, html ou body", () => {
    expect(selectors.filter((s) => !/^\.ps(?![a-z0-9_])|^\.ps-/.test(s))).toEqual([]);
  });

  it("todo @keyframes tem prefixo ps-", () => {
    expect(keyframes.length).toBeGreaterThan(5);
    expect(keyframes.filter((n) => !n.startsWith("ps-"))).toEqual([]);
  });

  it("não usa @layer, @import nem @font-face", () => {
    expect(css).not.toMatch(/@layer|@import|@font-face/);
  });

  it("nenhuma animação infinita (WCAG 2.2.2: nada se mexe para sempre)", () => {
    expect(css).not.toMatch(/infinite/);
  });

  it("efeitos somem com movimento reduzido", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce\)\s*\{\s*\.ps-fx\s*\{\s*display:\s*none/);
  });

  it("o grão de papel só em pseudo-elementos (não vira candidato a LCP)", () => {
    const rules = [...rest.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[2].includes("var(--ps-grain)"));
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.map((m) => m[1].trim()).filter((s) => !/::(before|after)\s*$/.test(s))).toEqual([]);
  });

  it("não carrega imagem externa", () => {
    expect(css).not.toMatch(/url\(\s*["']?https?:/);
  });
});

/** Corpo da primeira regra cujo seletor é exatamente `selector`. */
function rule(selector: string): string {
  const m = rest.match(new RegExp(`(?:^|})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  return m?.[1] ?? "";
}

describe("abertura pelo envelope (v2.1)", () => {
  it("o botão tem a MESMA geometria do envelope (88% de largura, 560/336, mesma base)", () => {
    const env = rule(".ps-env");
    const hit = rule(".ps-stage__hit");
    for (const decl of ["left: 6%", "width: 88%", "bottom: calc(4 * var(--u))", "aspect-ratio: 560 / 336"]) {
      expect(env, `.ps-env ${decl}`).toContain(decl);
      expect(hit, `.ps-stage__hit ${decl}`).toContain(decl);
    }
  });

  it("o botão fica acima de todas as camadas do envelope (a mais alta é o lacre, z 7)", () => {
    expect(rule(".ps-seal")).toContain("z-index: 7");
    expect(rule(".ps-stage__hit")).toMatch(/z-index:\s*8/);
  });

  it("tem anel de foco visível e ignora toque durante a abertura", () => {
    expect(css).toMatch(/\.ps-stage__hit:focus-visible[^{]*\{[^}]*outline:\s*3px solid/);
    expect(css).toMatch(/\.ps-stage\[data-state="opening"\] \.ps-stage__hit\s*\{[^}]*pointer-events:\s*none/);
  });

  it("o selo de música nunca bloqueia o toque", () => {
    expect(rule(".ps-music-tag")).toContain("pointer-events: none");
  });

  it("a animação das notinhas é finita e só roda sem movimento reduzido", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.ps-music-tag__note\s*\{[^}]*animation:\s*ps-note-float\s+[\d.]+s\s+ease-in-out\s+[\d.]+s\s+3\s+both/,
    );
    // fora do bloco `no-preference`, as notinhas ficam invisíveis e sem animação
    expect(rule(".ps-music-tag__note")).toContain("opacity: 0");
    expect(rule(".ps-music-tag__note")).not.toContain("animation");
    expect(css).not.toMatch(/equalizer|ps-bar/);
  });

  it("dica e selo saem de cena ao abrir sem mudar a altura da seção (o envelope não pula)", () => {
    expect(css).toMatch(/\.ps-closed\[data-opening\] \.ps-hint,\s*\.ps-closed\[data-opening\] \.ps-music-tag\s*\{\s*opacity:\s*0/);
  });
});
