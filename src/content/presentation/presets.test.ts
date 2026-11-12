import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRESENTATION,
  EFFECT_IDS,
  PRESENTATION_IDS,
  getPreset,
  parsePresentationOptions,
  presetForLegacyTheme,
  presets,
  resolveEffect,
  resolveExperience,
  selectablePresets,
} from "./presets";
import { themes } from "@/content/themes";
import { contrastHex, WCAG_AA } from "@/lib/contrast";

describe("registro de estilos", () => {
  it("ids são exatamente os publicados (cartas pagas guardam estes ids: nunca renomeie)", () => {
    expect(presets.map((p) => p.id)).toEqual([...PRESENTATION_IDS]);
    expect(PRESENTATION_IDS).toEqual(["papel-luz", "romantico", "noturno", "floral", "delicado"]);
    expect(EFFECT_IDS).toEqual(["none", "petalas", "borboletas", "brilho"]);
  });

  it("Papel e Luz é o padrão e os cinco estão prontos", () => {
    expect(DEFAULT_PRESENTATION).toBe("papel-luz");
    expect(selectablePresets().map((p) => p.id)).toEqual([...PRESENTATION_IDS]);
  });

  it("cada estilo tem efeito padrão permitido e sempre deixa desligar", () => {
    for (const p of presets) {
      expect(p.effects.allowed).toContain(p.effects.default);
      expect(p.effects.allowed).toContain("none");
      expect(p.effects.allowed.length).toBeLessThanOrEqual(4);
    }
  });

  it("cada estilo aponta para um tema legado que existe (fallback de rollback)", () => {
    const legacy = new Set(themes.map((t) => t.id));
    for (const p of presets) expect(legacy.has(p.legacyTheme)).toBe(true);
  });

  it("estilos são visualmente distintos: nenhuma cena, papel ou envelope repetido", () => {
    const sig = (p: (typeof presets)[number]) => [p.scene.base, p.letter.cardBg, p.envelope.paper[0]].join();
    expect(new Set(presets.map(sig)).size).toBe(presets.length);
  });
});

describe("resolução", () => {
  it("id desconhecido cai no padrão", () => {
    expect(getPreset("nao-existe").id).toBe("papel-luz");
    expect(getPreset(null).id).toBe("papel-luz");
  });

  it("efeito inválido, de outro estilo ou opções malformadas caem no padrão do estilo", () => {
    const noturno = getPreset("noturno");
    expect(resolveEffect(noturno, { v: 1, effect: "brilho" })).toBe("brilho");
    expect(resolveEffect(noturno, { v: 1, effect: "borboletas" })).toBe("brilho");
    expect(resolveEffect(noturno, { v: 1, effect: "fogos" })).toBe("brilho");
    expect(resolveEffect(noturno, { v: 2, effect: "petalas" })).toBe("brilho");
    expect(resolveEffect(noturno, "lixo")).toBe("brilho");
    expect(resolveEffect(noturno, { v: 1, effect: "none" })).toBe("none");
  });

  it("parsePresentationOptions não aceita nada fora do contrato", () => {
    expect(parsePresentationOptions({ v: 1, effect: "petalas", extra: 1 })).toEqual({ v: 1, effect: "petalas" });
    expect(parsePresentationOptions([1])).toBeNull();
    expect(parsePresentationOptions(null)).toBeNull();
  });

  it("carta sem estilo é legada; com estilo (mesmo desconhecido) é nova", () => {
    expect(resolveExperience({ presentation: null }).kind).toBe("legacy");
    expect(resolveExperience({}).kind).toBe("legacy");
    expect(resolveExperience({ presentation: "floral" })).toMatchObject({
      kind: "presentation",
      preset: { id: "floral" },
      effect: "borboletas",
    });
    expect(resolveExperience({ presentation: "futuro" })).toMatchObject({
      kind: "presentation",
      preset: { id: "papel-luz" },
    });
  });

  it("tema legado → estilo mais próximo", () => {
    expect(presetForLegacyTheme("romantico")).toBe("romantico");
    expect(presetForLegacyTheme("elegante")).toBe("noturno");
    expect(presetForLegacyTheme("celebracao")).toBe("floral");
    expect(presetForLegacyTheme("delicado")).toBe("delicado");
    expect(presetForLegacyTheme("xyz")).toBe("papel-luz");
  });
});

/**
 * Pares de cor REALMENTE desenhados pela folha v2 (`LetterSheet`), pela cena
 * (`RecipientExperience`, `PublicGiftView`) e pelas peças reaproveitadas
 * (`CardCreateInvite`, `CardMusicBadge`).
 */
describe.each(presets)("contraste do estilo $id", (p) => {
  const L = p.letter;
  it("texto da carta e texto secundário sobre o papel (4,5:1)", () => {
    expect(contrastHex(L.ink, L.cardBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
    expect(contrastHex(L.inkMuted, L.cardBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
  });
  it("ornamento e indicador do carrossel sobre o papel (3:1)", () => {
    expect(contrastHex(L.accentOnCard, L.cardBg)).toBeGreaterThanOrEqual(WCAG_AA.largeTextOrNonText);
  });
  it("botões sobre accent (4,5:1)", () => {
    expect(contrastHex(L.onAccent, L.accent)).toBeGreaterThanOrEqual(WCAG_AA.text);
  });
  it("selo de criação e convite final sobre o fundo (envelopeBg)", () => {
    expect(contrastHex(L.onEnvelope, L.envelopeBg)).toBeGreaterThanOrEqual(WCAG_AA.largeTextOrNonText);
    expect(contrastHex(L.onEnvelopeMuted, L.envelopeBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
  });
  it("texto da cena sobre o véu e botão principal (4,5:1)", () => {
    expect(contrastHex(p.scene.text, p.scene.textBackdrop)).toBeGreaterThanOrEqual(WCAG_AA.text);
    expect(contrastHex(p.scene.textMuted, p.scene.textBackdrop)).toBeGreaterThanOrEqual(WCAG_AA.text);
    expect(contrastHex(p.scene.onButton, p.scene.button)).toBeGreaterThanOrEqual(WCAG_AA.text);
  });
});
