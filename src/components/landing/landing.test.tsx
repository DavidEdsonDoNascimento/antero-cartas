/**
 * Landing "Papel e Luz": estrutura, acessibilidade básica e — acima de tudo —
 * honestidade do conteúdo. Esta página fala de dinheiro e de promessa de
 * entrega; nada de prova social inventada, número sem fonte ou selo sem dado.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { plans, formatBRL } from "@/config/plans";
import { faq } from "@/content/faq";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/components/card/CardPreview", () => ({
  CardPreview: ({ cart }: { cart: { theme: string } }) => <div data-testid="preview" data-theme={cart.theme} />,
}));

const { Hero } = await import("./Hero");
const { HowItWorks } = await import("./HowItWorks");
const { Plans } = await import("./Plans");
const { Faq } = await import("./Faq");
const { FinalCta } = await import("./FinalCta");
const { Header } = await import("./Header");
const { Footer } = await import("./Footer");
const { ThemeShowcase } = await import("./ThemeShowcase");

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");

const page = [Header, Hero, HowItWorks, ThemeShowcase, Plans, Faq, FinalCta, Footer]
  .map((C) => renderToStaticMarkup(<C />))
  .join("\n");

describe("hero", () => {
  const html = renderToStaticMarkup(<Hero />);

  it("tem um único h1 e o CTA principal leva a /criar", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]+href="\/criar"[^>]*>Criar minha cartinha/);
  });

  it("o CTA secundário leva à vitrine de exemplos na própria página", () => {
    expect(html).toMatch(/<a[^>]+href="#exemplos"[^>]*>Ver um exemplo<\/a>/);
  });

  it("a cena é decorativa para leitor de tela e começa fechada", () => {
    expect(html).toContain('data-state="closed"');
    expect(html).toMatch(/class="pl-scene" aria-hidden="true"/);
  });

  it("o botão de rever tem nome acessível", () => {
    expect(html).toMatch(/<button[^>]*class="pl-stage__hit"[^>]*><span class="pl-sr">Ver a carta de exemplo abrir de novo<\/span>/);
  });

  it("avisa que o exemplo é fictício", () => {
    expect(html).toContain("Exemplo fictício");
  });

  it("não depende de imagem externa", () => {
    expect(html).not.toMatch(/<img|https?:\/\//);
  });
});

describe("planos", () => {
  const html = renderToStaticMarkup(<Plans />);

  it("mostra preço e itens vindos da configuração dos planos", () => {
    for (const plan of plans) {
      // formatBRL usa espaço não separável entre "R$" e o valor.
      expect(html.replace(/\u00a0/g, " ")).toContain(formatBRL(plan.priceCents).replace(/\u00a0/g, " "));
      for (const feature of plan.features) expect(html).toContain(feature);
    }
  });

  it("não exibe a etiqueta 'Mais escolhido' (não há dado que a sustente)", () => {
    expect(plans.some((p) => p.badge)).toBe(true); // o selo existe no editor…
    expect(html).not.toMatch(/Mais escolhido/i); // …mas não é prometido na landing
  });

  it("informa pagamento único e as duas formas de pagamento reais", () => {
    expect(html).toContain("pagamento único");
    expect(html).toContain("sem mensalidade");
    expect(html).toContain(">Pix<");
    expect(html).toContain("Cartão");
  });

  it("um único CTA, porque o plano é escolhido no fim do fluxo", () => {
    expect(html.match(/href="\/criar"/g)).toHaveLength(1);
    expect(html).not.toMatch(/Criar com o plano/);
  });
});

describe("dúvidas", () => {
  const html = renderToStaticMarkup(<Faq />);

  it("usa <details>, com a primeira pergunta aberta", () => {
    expect(html.match(/<details/g)).toHaveLength(faq.length);
    expect(html.match(/<details[^>]*open/g)).toHaveLength(1);
  });

  it("são as perguntas essenciais, em número enxuto", () => {
    expect(faq.length).toBeGreaterThanOrEqual(5);
    expect(faq.length).toBeLessThanOrEqual(7);
  });
});

describe("como funciona", () => {
  it("são três passos, em lista ordenada", () => {
    const html = renderToStaticMarkup(<HowItWorks />);
    expect(html).toMatch(/<ol class="pl-steps"/);
    expect(html.match(/<li class="pl-step"/g)).toHaveLength(3);
  });
});

describe("conteúdo honesto", () => {
  it.each([
    ["depoimentos", /depoimento/i],
    ["nomes dos exemplos de depoimento", /Mariana|Rafael|Beatriz/],
    ["estrelas de avaliação", /★|⭐/],
    ["prova social numérica", /\d[\d.]*\s*(mil\b|clientes|casais|pessoas|cartas enviadas)/i],
    ["promessa de tempo sem medição", /\b\d+\s*(min|minutos)\b/i],
    ["selo de popularidade", /Mais escolhido|mais vendido|mais popular/i],
    ["garantia (desligada na configuração)", /garantia/i],
    ["urgência artificial", /últimas? (vagas|unidades)|só hoje|oferta/i],
  ])("a página não tem %s", (_nome, pattern) => {
    expect(page).not.toMatch(pattern);
  });

  it("o arquivo da página não importa os depoimentos de demonstração", () => {
    expect(read("src/app/page.tsx")).not.toMatch(/testimonials|Testimonials/);
  });

  it("nenhum link fica sem destino", () => {
    expect(page).not.toMatch(/href="#"|href=""/);
    expect(page).toMatch(/href="\/termos"/);
    expect(page).toMatch(/href="\/privacidade"/);
  });
});

describe("acessibilidade básica", () => {
  it("cada seção principal tem um título ligado por aria-labelledby", () => {
    for (const id of ["pl-hero-title", "pl-how-title", "pl-themes-title", "pl-plans-title", "pl-faq-title", "pl-final-title"]) {
      expect(page).toContain(`aria-labelledby="${id}"`);
      expect(page).toContain(`id="${id}"`);
    }
  });

  it("os atalhos do cabeçalho apontam para seções que existem", () => {
    for (const id of ["como-funciona", "exemplos", "planos", "duvidas"]) {
      expect(page).toContain(`href="#${id}"`);
      expect(page).toContain(`id="${id}"`);
    }
  });

  it("os ícones decorativos ficam fora da árvore de acessibilidade", () => {
    // A cena da hero é um bloco aria-hidden inteiro (testado na hero); aqui, o resto.
    const rest = [Header, HowItWorks, ThemeShowcase, Plans, Faq, FinalCta, Footer]
      .map((C) => renderToStaticMarkup(<C />))
      .join("\n");
    const svgs = rest.match(/<svg[^>]*>/g) ?? [];
    expect(svgs.length).toBeGreaterThan(10);
    expect(svgs.filter((s) => !/aria-hidden/.test(s))).toEqual([]);
  });
});

describe("isolamento das cartas e do app", () => {
  it("o layout raiz e o globals.css não ganharam nada da nova identidade", () => {
    const layout = read("src/app/layout.tsx");
    const globals = read("src/app/globals.css");
    expect(layout).not.toMatch(/Fraunces|DM_Sans|paper-light/);
    expect(globals).not.toMatch(/--pl-|\.pl\b|Fraunces|DM Sans/);
  });

  it("os renderizadores e temas das cartas não conhecem a identidade nova", () => {
    for (const file of [
      "src/components/card/CardPreview.tsx",
      "src/components/card/CardExperience.tsx",
      "src/components/card/PhotoCarousel.tsx",
      "src/content/themes.ts",
    ]) {
      // `pl-7` & cia são utilidades do Tailwind (padding-left): só o prefixo de letras conta.
      expect(read(file), file).not.toMatch(/--pl-|paper-light|\bpl-(?![\d[])/);
    }
  });

  it("as fontes novas só são carregadas pela landing", () => {
    const users = ["src/app/page.tsx"];
    const forbidden = [
      "src/app/layout.tsx",
      "src/app/criar/page.tsx",
      "src/app/checkout/[cartId]/page.tsx",
      "src/app/c/[slug]/page.tsx",
      "src/app/demonstracao/page.tsx",
    ];
    for (const f of users) expect(read(f)).toContain("landing/fonts");
    for (const f of forbidden) expect(read(f), f).not.toContain("landing/fonts");
  });
});

describe("vitrine de exemplos", () => {
  it("lista os quatro temas legados, na ordem da configuração", () => {
    const html = renderToStaticMarkup(<ThemeShowcase />);
    for (const label of ["Romântico", "Elegante", "Delicado", "Celebração"]) expect(html).toContain(label);
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toContain('data-theme="romantico"');
  });
});
