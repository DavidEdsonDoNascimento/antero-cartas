/**
 * Regressão do FAB "Ver preview" cobrindo o CTA final no mobile.
 *
 * O bug real é de LAYOUT: o botão é `position: fixed`, não empurra o conteúdo,
 * e a última linha do formulário ("Finalizar minha cartinha" / "Próxima etapa")
 * parava embaixo dele. Isso não dá para verificar aqui — o ambiente de teste
 * (node/jsdom) não faz layout: `getBoundingClientRect` devolve zeros e o
 * `calc()`/`env()` do CSS nunca é resolvido. Medir a sobreposição de verdade
 * exigiria um navegador headless (feito à mão na revisão desta correção, em
 * 360×800 / 390×844 / 390×667 / 820×1180 / 1440×900).
 *
 * O que dá para blindar sem simular medidas falsas é a ESTRUTURA da correção:
 * o espaço é reservado no conteúdo e continua amarrado à mesma medida que
 * posiciona o botão. Se alguém remover a reserva, ou desacoplar as duas
 * variáveis, ou mexer na altura do botão sem refazer a conta, um destes
 * asserts quebra.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");

const css = read("src/app/globals.css");
const flow = read("src/components/create/CreateFlow.tsx");

describe("FAB 'Ver preview' — reserva de espaço no mobile", () => {
  it("globals.css deriva --preview-fab-reserve de --preview-fab-inset (não podem divergir)", () => {
    // inset = distância da borda + área segura
    expect(css).toMatch(/--preview-fab-inset:\s*calc\([^;]*env\(safe-area-inset-bottom/);

    const reserve = css.match(/--preview-fab-reserve:\s*(calc\([^;]+)/)?.[1] ?? "";
    expect(reserve).toContain("var(--preview-fab-inset)");
    // altura do botão derivada de py-3 (1.5rem) + line-height do text-sm (1.25rem)
    expect(reserve).toMatch(/2\.75rem/);
  });

  it("o container da jornada reserva o padding-bottom no mobile e some em lg:", () => {
    expect(flow).toContain("pb-[var(--preview-fab-reserve)]");
    // a reserva não pode vazar para o desktop, onde o FAB nem aparece
    expect(flow).toMatch(/pb-\[var\(--preview-fab-reserve\)\][^"]*\blg:py-12\b/);
  });

  it("o FAB usa o mesmo inset para se posicionar e continua só no mobile", () => {
    expect(flow).toMatch(/bottom-\[var\(--preview-fab-inset\)\][^"]*\blg:hidden\b/);
  });
});
