/**
 * Contraste WCAG AA dos pares REALMENTE renderizados por `CardCreateInvite`,
 * nos quatro temas.
 *
 * Mesmo método de `src/content/themes.test.ts` (auditoria visual, PR 1): cada
 * verificação espelha uma combinação concreta de cores do componente, não os
 * campos do tema isolados. Foi exatamente assim que o Delicado escondeu um
 * botão de 1,08:1 até a auditoria — `accent` e `envelopeBg` pareciam válidos
 * separados e só quebravam juntos.
 *
 * Arquivo próprio, e não um `describe` novo dentro de `themes.test.ts`, por
 * dois motivos: mantém esta mudança autocontida (fácil de revisar e de
 * reverter) e evita mexer num arquivo que pertence ao roteiro da task 016.
 * A cobertura não perde nada — `describe.each(themes)` continua pegando
 * qualquer tema novo ou alterado.
 *
 * Todos os limites aqui são 4,5:1 (texto normal). Nenhum texto do convite é
 * "texto grande" pela definição do WCAG (≥24px regular ou ≥18,66px bold): o
 * maior é o título do bloco aberto, em `text-base` (16px, medium).
 */
import { describe, it, expect } from "vitest";
import { themes } from "@/content/themes";
import { contrastHex, WCAG_AA } from "@/lib/contrast";

describe.each(themes)("tema $id ($label)", (theme) => {
  describe("convite discreto (cartinha fechada)", () => {
    it('pergunta "Quer criar uma surpresa assim?" — onEnvelopeMuted sobre envelopeBg', () => {
      expect(contrastHex(theme.onEnvelopeMuted, theme.envelopeBg)).toBeGreaterThanOrEqual(
        WCAG_AA.text,
      );
    });

    it('link "Criar uma cartinha" — onEnvelopeMuted sobre envelopeBg', () => {
      expect(contrastHex(theme.onEnvelopeMuted, theme.envelopeBg)).toBeGreaterThanOrEqual(
        WCAG_AA.text,
      );
    });
  });

  describe("bloco de conversão (cartinha aberta)", () => {
    /**
     * `onEnvelope` é declarado em `ThemeConfig` com mínimo de 3:1 porque seu
     * uso original é o nome do destinatário, em texto grande. Aqui ele carrega
     * um título de 16px, que é texto NORMAL — por isso a exigência sobe para
     * 4,5:1. Se um tema futuro entrar com `onEnvelope` entre 3:1 e 4,5:1, este
     * teste falha e avisa que o título precisa mudar de token ou de tamanho.
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
});
