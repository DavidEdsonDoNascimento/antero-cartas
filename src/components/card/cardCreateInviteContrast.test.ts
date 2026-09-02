/**
 * Contraste WCAG AA dos pares REALMENTE renderizados pelos CTAs da cartinha
 * pública — bloco final (`CardCreateInvite`), selo de criação (`CardCreateSeal`)
 * e indicador de música (`CardMusicBadge`) — nos quatro temas.
 *
 * Mesmo método de `src/content/themes.test.ts` (auditoria visual, PR 1): cada
 * verificação espelha uma combinação concreta de cores do componente, não os
 * campos do tema isolados. Foi assim que o Delicado escondeu um botão de 1,08:1
 * até a auditoria — `accent` e `envelopeBg` pareciam válidos separados e só
 * quebravam juntos.
 *
 * Arquivo próprio (não um `describe` em `themes.test.ts`) para manter a mudança
 * autocontida e não mexer num arquivo que pertence ao roteiro da task 016.
 * `describe.each(themes)` continua pegando qualquer tema novo ou alterado.
 *
 * Limites: 4,5:1 para texto/ícone (nada aqui é "texto grande" pelo WCAG — o
 * maior é o título do bloco, `text-base` 16px medium); 3,0:1 para o disco do
 * selo / a pílula do badge como elemento não-textual sobre o `envelopeBg`
 * (SC 1.4.11).
 */
import { describe, it, expect } from "vitest";
import { themes } from "@/content/themes";
import { contrastHex, WCAG_AA } from "@/lib/contrast";

describe.each(themes)("tema $id ($label)", (theme) => {
  describe("bloco de conversão (cartinha aberta)", () => {
    /**
     * `onEnvelope` é declarado em `ThemeConfig` com mínimo de 3:1 (uso original:
     * nome do destinatário, texto grande). Aqui carrega um título de 16px —
     * texto NORMAL —, por isso a exigência sobe para 4,5:1. Se um tema futuro
     * entrar com `onEnvelope` entre 3:1 e 4,5:1, este teste avisa.
     */
    it('título "Gostou desta surpresa?" (16px) — onEnvelope sobre envelopeBg', () => {
      expect(contrastHex(theme.onEnvelope, theme.envelopeBg)).toBeGreaterThanOrEqual(
        WCAG_AA.text,
      );
    });

    it("subtítulo — onEnvelopeMuted sobre envelopeBg", () => {
      expect(contrastHex(theme.onEnvelopeMuted, theme.envelopeBg)).toBeGreaterThanOrEqual(
        WCAG_AA.text,
      );
    });

    it('botão "Criar minha cartinha" — onAccent sobre accent', () => {
      expect(contrastHex(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(WCAG_AA.text);
    });

    it("assinatura da marca — onEnvelopeMuted sobre envelopeBg", () => {
      expect(contrastHex(theme.onEnvelopeMuted, theme.envelopeBg)).toBeGreaterThanOrEqual(
        WCAG_AA.text,
      );
    });
  });

  describe("selo de criação e indicador de música (pílula accent, borda onEnvelope)", () => {
    it("texto/glifo sobre a pílula — onAccent sobre accent", () => {
      expect(contrastHex(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(WCAG_AA.text);
    });

    it("a pílula como forma sobre o envelope — accent sobre envelopeBg (≥3:1)", () => {
      // No Delicado fica no limite (~3,37); a borda abaixo é o que garante a
      // aresta nítida.
      expect(contrastHex(theme.accent, theme.envelopeBg)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });

    it("a borda que recorta a pílula — onEnvelope sobre envelopeBg (≥3:1 em TODOS os temas)", () => {
      // `onEnvelope` (não `onAccent`, que iguala o `envelopeBg` nos temas
      // escuros): anel branco nos envelopes escuros, anel vinho no Delicado.
      expect(contrastHex(theme.onEnvelope, theme.envelopeBg)).toBeGreaterThanOrEqual(
        WCAG_AA.largeTextOrNonText,
      );
    });
  });
});
