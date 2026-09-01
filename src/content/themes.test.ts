import { describe, it, expect } from "vitest";
import { themes } from "@/content/themes";
import { contrastHex, hexToRgb, over, contrastRatio, WCAG_AA } from "@/lib/contrast";

/**
 * Auditoria visual, PR 1 — docs/tasks-pending/016_revisao_visual_v1.md
 *
 * Cada verificação abaixo espelha um par de cores REALMENTE renderizado em
 * `CardExperience.tsx` / `CardPreview.tsx` / `PhotoCarousel.tsx` — não os
 * campos crus do tema isolados. Isso existe para nunca mais deixar passar o
 * que passou antes: o tema Delicado tinha `accent` e `envelopeBg` que,
 * cada um isoladamente, "pareciam" cores válidas — só quebravam quando
 * combinados no botão "Abrir minha carta" (1,08:1 medido).
 *
 * Se um tema novo for adicionado ou um destes campos for alterado sem
 * atualizar o outro lado do par, este arquivo falha o CI.
 */

const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];

describe.each(themes)("tema $id ($label)", (theme) => {
  const rgb = {
    envelopeBg: hexToRgb(theme.envelopeBg),
    cardBg: hexToRgb(theme.cardBg),
    ink: hexToRgb(theme.ink),
    accent: hexToRgb(theme.accent),
    onEnvelope: hexToRgb(theme.onEnvelope),
    onEnvelopeMuted: hexToRgb(theme.onEnvelopeMuted),
    onAccent: hexToRgb(theme.onAccent),
    accentOnCard: hexToRgb(theme.accentOnCard),
    inkMuted: hexToRgb(theme.inkMuted),
  };

  describe("envelope fechado (CardExperience > ClosedEnvelope)", () => {
    it('kicker "Uma surpresa foi preparada para você" — onEnvelopeMuted sobre envelopeBg (texto normal)', () => {
      expect(contrastRatio(rgb.onEnvelopeMuted, rgb.envelopeBg)).toBeGreaterThanOrEqual(
        WCAG_AA.text,
      );
    });

    it("nome do destinatário (script, texto grande) — onEnvelope sobre envelopeBg", () => {
      expect(contrastRatio(rgb.onEnvelope, rgb.envelopeBg)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });

    it('botão "Abrir minha carta" — onAccent sobre accent (texto normal)', () => {
      expect(contrastRatio(rgb.onAccent, rgb.accent)).toBeGreaterThanOrEqual(WCAG_AA.text);
    });

    it("selo do envelope (glifo, não-textual) — onAccent sobre accent", () => {
      expect(contrastRatio(rgb.onAccent, rgb.accent)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });

    it("aba do envelope (dobra, não-textual) — cardBg 50% preto vs cardBg", () => {
      const flap = over(rgb.cardBg, BLACK, 0.5);
      expect(contrastRatio(rgb.cardBg, flap)).toBeGreaterThanOrEqual(WCAG_AA.largeTextOrNonText);
    });

    it("accent do envelope é distinguível do envelopeBg (selo, não-textual)", () => {
      expect(contrastRatio(rgb.accent, rgb.envelopeBg)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });
  });

  describe("player de música (CardExperience > OpenCardMusic, véu bg-black/55)", () => {
    const scrim = over(BLACK, rgb.envelopeBg, 0.55);

    it("título da faixa — white/85 sobre o véu", () => {
      const text = over(WHITE, scrim, 0.85);
      expect(contrastRatio(text, scrim)).toBeGreaterThanOrEqual(WCAG_AA.text);
    });

    it('rodapé "reprodução depende..." / link "Ver no YouTube" — white/70 sobre o véu', () => {
      const text = over(WHITE, scrim, 0.7);
      expect(contrastRatio(text, scrim)).toBeGreaterThanOrEqual(WCAG_AA.text);
    });
  });

  describe("carta aberta (CardPreview)", () => {
    it("título da carta — ink sobre cardBg (texto grande, script/serif)", () => {
      expect(contrastRatio(rgb.ink, rgb.cardBg)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });

    it("ornamento junto ao título (ícone, não-textual) — accentOnCard sobre cardBg", () => {
      expect(contrastRatio(rgb.accentOnCard, rgb.cardBg)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });

    it('"Para <nome>" — inkMuted sobre cardBg (texto normal)', () => {
      expect(contrastRatio(rgb.inkMuted, rgb.cardBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
    });

    it("mensagem da carta — ink a 92% sobre cardBg (texto normal)", () => {
      const text = over(rgb.ink, rgb.cardBg, 0.92);
      expect(contrastRatio(text, rgb.cardBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
    });

    it("divisor decorativo (não-textual) — accentOnCard sobre cardBg", () => {
      expect(contrastRatio(rgb.accentOnCard, rgb.cardBg)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });

    it("assinatura em destaque (nome, script) — ink sobre cardBg (texto grande)", () => {
      expect(contrastRatio(rgb.ink, rgb.cardBg)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });

    it('frase de assinatura (itálico, texto normal) — inkMuted sobre cardBg', () => {
      expect(contrastRatio(rgb.inkMuted, rgb.cardBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
    });

    describe("contador de tempo juntos (fundo accent a 13,3% sobre cardBg)", () => {
      const counterBg = over(rgb.accent, rgb.cardBg, 0x22 / 255);

      it('rótulo "Juntos há" — inkMuted sobre o fundo do contador', () => {
        expect(contrastRatio(rgb.inkMuted, counterBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
      });

      it("valor em destaque (negrito) — ink sobre o fundo do contador", () => {
        expect(contrastRatio(rgb.ink, counterBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
      });

      it("linha `Xh Ym Zs` — inkMuted sobre o fundo do contador", () => {
        expect(contrastRatio(rgb.inkMuted, counterBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
      });
    });

    describe("indicador de música (fundo black/5 sobre cardBg)", () => {
      const rowBg = over(BLACK, rgb.cardBg, 0.05);

      it("título da faixa (medium) — ink sobre o fundo da linha", () => {
        expect(contrastRatio(rgb.ink, rowBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
      });

      it("canal / legenda — inkMuted sobre o fundo da linha", () => {
        expect(contrastRatio(rgb.inkMuted, rowBg)).toBeGreaterThanOrEqual(WCAG_AA.text);
      });
    });
  });

  describe("PhotoCarousel", () => {
    it("indicador ativo (não-textual) — accentOnCard sobre cardBg", () => {
      expect(contrastRatio(rgb.accentOnCard, rgb.cardBg)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });

    it("indicador inativo (não-textual) — inkMuted sobre cardBg", () => {
      expect(contrastRatio(rgb.inkMuted, rgb.cardBg)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });
  });
});

describe("contrato entre temas (evita regressão ao editar um campo isolado)", () => {
  it("todo tema define os cinco campos derivados exigidos por ThemeConfig", () => {
    for (const t of themes) {
      for (const field of [
        "onEnvelope",
        "onEnvelopeMuted",
        "onAccent",
        "accentOnCard",
        "inkMuted",
      ] as const) {
        expect(t[field], `${t.id}.${field}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it("cada valor derivado passa em contrastHex idêntico ao usado via hexToRgb/contrastRatio (sanity check do helper)", () => {
    for (const t of themes) {
      expect(contrastHex(t.onAccent, t.accent)).toBeCloseTo(
        contrastRatio(hexToRgb(t.onAccent), hexToRgb(t.accent)),
        10,
      );
    }
  });
});
