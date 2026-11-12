import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { EnvelopeScene } from "@/components/landing/EnvelopeScene";

/**
 * A hero da landing passou a usar as camadas de `envelopeArt` (as mesmas do
 * envelope das cartas). Com o mesmo CSS, HTML idêntico = pixels idênticos: a
 * captura foi gravada antes da extração e não pode mudar com ela.
 */
describe("envelope da landing depois da extração", () => {
  it("gera exatamente o mesmo HTML de antes", () => {
    const before = readFileSync("src/components/landing/__fixtures__/envelopeScene.html", "utf8").trim();
    expect(renderToStaticMarkup(<EnvelopeScene />)).toBe(before);
  });
});
