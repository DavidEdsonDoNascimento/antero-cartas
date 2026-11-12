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
