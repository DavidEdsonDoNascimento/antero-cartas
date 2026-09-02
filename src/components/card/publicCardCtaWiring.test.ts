/**
 * Guardas estruturais do CTA da cartinha pública.
 *
 * Estas regras não são verificáveis renderizando o componente: elas dizem
 * respeito ao que o arquivo PODE importar e a onde o CTA NÃO pode aparecer.
 * Mesmo recurso (e mesmo motivo) de `previewFabSpacing.test.ts` — quando o
 * comportamento a proteger não cabe no DOM, blinda-se a estrutura da correção.
 *
 * A regra mais importante é a primeira. `CreateCta` dispara
 * `prefetchCartInit()` em `onPointerEnter`, ou seja, um `POST /api/carts` que
 * grava uma linha `Cart` no banco por hover. Na landing isso é intencional
 * (D45); numa rota compartilhada em massa seria escrita anônima no banco a
 * cada dedo que passa — e, para quem enviou a cartinha, ainda apagaria
 * `antero:session` ao abrir o próprio link. Alguém "consertando" a latência do
 * CTA um dia vai olhar para `CreateCta` e achar que é reuso óbvio. Não é.
 *
 * Os testes leem o código SEM COMENTÁRIOS de propósito: o cabeçalho de
 * `CardCreateInvite.tsx` cita `CreateCta` e `prefetchCartInit` pelo nome,
 * justamente para explicar por que não são usados, e uma busca ingênua por
 * texto acusaria falso positivo.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");

/** Remove comentários de bloco e de linha, preservando `https://` em strings. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Especificadores de módulo de todo `from "..."` do arquivo. */
function importedModules(source: string): string[] {
  return [...codeOnly(source).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

const INVITE = "src/components/card/CardCreateInvite.tsx";
const EXPERIENCE = "src/components/card/CardExperience.tsx";
const PREVIEW = "src/components/card/CardPreview.tsx";
const PUBLIC_PAGE = "src/app/c/[slug]/page.tsx";

describe("a cartinha pública é somente leitura — nada de criar rascunho", () => {
  it.each([INVITE, EXPERIENCE])(
    "%s não importa CreateCta nem o módulo de inicialização de rascunho",
    (arquivo) => {
      const modulos = importedModules(read(arquivo));
      for (const modulo of modulos) {
        expect(modulo, `${arquivo} importa "${modulo}"`).not.toMatch(/CreateCta|draftInit/);
      }
    },
  );

  it.each([INVITE, EXPERIENCE])(
    "%s não importa o cliente HTTP, a sessão do rascunho nem o storage local",
    (arquivo) => {
      const modulos = importedModules(read(arquivo));
      for (const proibido of ["@/lib/api", "@/lib/cartSession", "@/lib/storage"]) {
        expect(modulos, `${arquivo} importa ${proibido}`).not.toContain(proibido);
      }
    },
  );

  it.each([INVITE, EXPERIENCE])(
    "%s não chama nenhuma função que crie ou resolva rascunho",
    (arquivo) => {
      const codigo = codeOnly(read(arquivo));
      for (const fn of [
        "prefetchCartInit",
        "resolveCartInit",
        "getCartInit",
        "createDraft",
        "saveSession",
        "loadSession",
        "clearSession",
      ]) {
        expect(codigo, `${arquivo} usa ${fn}`).not.toContain(`${fn}(`);
      }
    },
  );

  it.each([INVITE, EXPERIENCE])("%s não toca em localStorage nem faz fetch", (arquivo) => {
    const codigo = codeOnly(read(arquivo));
    expect(codigo).not.toContain("localStorage");
    expect(codigo).not.toContain("sessionStorage");
    expect(codigo).not.toContain("fetch(");
    // Import dinâmico esconderia qualquer um dos acima.
    expect(codigo).not.toMatch(/\bimport\s*\(/);
  });
});

describe("destino do CTA", () => {
  it("o convite usa next/link e um destino literal, sem query string", () => {
    const codigo = codeOnly(read(INVITE));
    expect(importedModules(read(INVITE))).toContain("next/link");
    expect(codigo).toMatch(/DESTINATION\s*=\s*["']\/criar["']/);
    // Sem `?origem=`, sem UTM, sem template string no href.
    expect(codigo).not.toContain("origem=");
    expect(codigo).not.toContain("utm_");
    expect(codigo).not.toMatch(/href=\{`/);
  });

  it("a cartinha indisponível aponta direto para /criar, não para a landing", () => {
    const codigo = codeOnly(read(PUBLIC_PAGE));
    expect(codigo).toContain('href="/criar"');
    expect(codigo).not.toContain('href="/"');
  });
});

describe("o CTA não pode vazar para a jornada de criação", () => {
  it("CardPreview continua sem qualquer caminho para /criar", () => {
    // CardPreview é compartilhado com o preview ao vivo de /criar (desktop e
    // drawer mobile). Um CTA ali apareceria para quem já está criando.
    const fonte = read(PREVIEW);
    expect(fonte).not.toContain("/criar");
    expect(fonte).not.toContain("CardCreateInvite");
  });

  it("o convite é montado só por CardExperience", () => {
    const codigo = codeOnly(read(EXPERIENCE));
    expect(codigo).toContain("<CardCreateInvite");
    // Uma vez em cada estado — nunca duas no mesmo.
    expect(codigo.match(/<CardCreateInvite/g)).toHaveLength(2);
    expect(codigo).toContain('variant="discreta"');
    expect(codigo).toContain('variant="destaque"');
  });
});

describe("apresentação", () => {
  it("o convite não usa posicionamento flutuante em nenhuma variante", () => {
    const codigo = codeOnly(read(INVITE));
    expect(codigo).not.toMatch(/\b(fixed|sticky)\b/);
    expect(codigo).not.toContain("z-");
  });

  it("nenhuma cor fixa: toda cor do convite vem dos tokens do tema", () => {
    const codigo = codeOnly(read(INVITE));
    // Hex solto quebraria o Delicado, único tema com envelope claro.
    expect(codigo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(codigo).not.toMatch(/\b(bg|text)-(white|black|creme|vinho|dourado|rosa|grafite)\b/);
  });

  it("o halo de foco global cobre o <a> do convite", () => {
    // O convite não declara foco próprio: depende da regra global. Se alguém
    // remover o `a` de lá, os dois CTAs ficam sem foco visível.
    const css = codeOnly(read("src/app/globals.css"));
    expect(css).toMatch(/:where\(a,[^)]*\):focus-visible/);
    expect(css).toContain("box-shadow");
  });
});

describe("analytics", () => {
  it("o evento está declarado na união de eventos", () => {
    expect(read("src/lib/analytics.ts")).toContain('"create_cta_from_card_clicked"');
  });

  it("o convite não envia nenhum campo de conteúdo da cartinha", () => {
    const codigo = codeOnly(read(INVITE));
    // O componente sequer recebe o `cart`; isto blinda contra alguém passá-lo.
    expect(codigo).not.toMatch(/\bcart\b/);
    for (const campo of ["slug", "recipientName", "senderName", "message", "title", "music"]) {
      expect(codigo, `o convite referencia "${campo}"`).not.toContain(campo);
    }
  });

  it("sanitizeAnalyticsUrl não foi alterada por esta mudança", () => {
    // A investigação registrou que preservar query string exigiria aprovação
    // explícita; o MVP não depende disso.
    const codigo = codeOnly(read("src/lib/analyticsPrivacy.ts"));
    expect(codigo).toMatch(/return\s+`\$\{parsed\.origin\}\$\{path\}`/);
  });
});
