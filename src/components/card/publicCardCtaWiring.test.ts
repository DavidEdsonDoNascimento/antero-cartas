/**
 * Guardas estruturais dos CTAs da cartinha pública (selo flutuante, indicador
 * de música e bloco final).
 *
 * Estas regras não são verificáveis renderizando os componentes: dizem
 * respeito ao que os arquivos PODEM importar e a onde os CTAs NÃO podem
 * aparecer. Mesmo recurso (e mesmo motivo) de `previewFabSpacing.test.ts` —
 * quando o comportamento a proteger não cabe no DOM, blinda-se a estrutura.
 *
 * A regra mais importante é a primeira. `CreateCta` dispara `prefetchCartInit()`
 * em `onPointerEnter`, ou seja um `POST /api/carts` que grava uma linha `Cart`
 * no banco por hover. Na landing isso é intencional (D45); numa rota
 * compartilhada em massa seria escrita anônima a cada dedo que passa — e, para
 * quem enviou a cartinha, ainda apagaria `antero:session` ao abrir o próprio
 * link. Alguém "consertando" a latência do CTA um dia vai olhar para
 * `CreateCta` e achar que é reuso óbvio. Não é.
 *
 * Os testes leem o código SEM COMENTÁRIOS de propósito: os cabeçalhos citam
 * `CreateCta` e `prefetchCartInit` pelo nome, justamente para explicar por que
 * não são usados, e uma busca ingênua por texto acusaria falso positivo.
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
const SEAL = "src/components/card/CardCreateSeal.tsx";
const BADGE = "src/components/card/CardMusicBadge.tsx";
const DOCK = "src/components/card/CardFloatingActions.tsx";
const EXPERIENCE = "src/components/card/CardExperience.tsx";
const PREVIEW = "src/components/card/CardPreview.tsx";
const PUBLIC_PAGE = "src/app/c/[slug]/page.tsx";

/** Todos os arquivos que a cartinha pública renderiza e que precisam ser inertes. */
const READ_ONLY_FILES = [INVITE, SEAL, BADGE, DOCK, EXPERIENCE];

describe("a cartinha pública é somente leitura — nada de criar rascunho", () => {
  it.each(READ_ONLY_FILES)(
    "%s não importa CreateCta nem o módulo de inicialização de rascunho",
    (arquivo) => {
      const modulos = importedModules(read(arquivo));
      for (const modulo of modulos) {
        expect(modulo, `${arquivo} importa "${modulo}"`).not.toMatch(/CreateCta|draftInit/);
      }
    },
  );

  it.each(READ_ONLY_FILES)(
    "%s não importa o cliente HTTP, a sessão do rascunho nem o storage local",
    (arquivo) => {
      const modulos = importedModules(read(arquivo));
      for (const proibido of ["@/lib/api", "@/lib/cartSession", "@/lib/storage"]) {
        expect(modulos, `${arquivo} importa ${proibido}`).not.toContain(proibido);
      }
    },
  );

  it.each(READ_ONLY_FILES)(
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

  it.each(READ_ONLY_FILES)("%s não toca em localStorage nem faz fetch", (arquivo) => {
    const codigo = codeOnly(read(arquivo));
    expect(codigo).not.toContain("localStorage");
    expect(codigo).not.toContain("sessionStorage");
    expect(codigo).not.toContain("fetch(");
    // Import dinâmico esconderia qualquer um dos acima.
    expect(codigo).not.toMatch(/\bimport\s*\(/);
  });
});

describe("destino do CTA", () => {
  it.each([INVITE, SEAL])("%s usa next/link e o destino literal /criar, sem query string", (arquivo) => {
    const codigo = codeOnly(read(arquivo));
    expect(importedModules(read(arquivo))).toContain("next/link");
    expect(codigo).toMatch(/DESTINATION\s*=\s*["']\/criar["']/);
    // Sem `?origem=`, sem UTM, sem template string no href.
    expect(codigo).not.toContain("origem=");
    expect(codigo).not.toContain("utm_");
    expect(codigo).not.toMatch(/href=\{`/);
  });

  it("o selo e o bloco final não recebem o `cart` — só o tema (e o estado)", () => {
    for (const arquivo of [INVITE, SEAL, BADGE]) {
      const codigo = codeOnly(read(arquivo));
      expect(codigo, `${arquivo} referencia "cart"`).not.toMatch(/\bcart\b/);
      for (const campo of ["slug", "recipientName", "senderName", "message", "signature"]) {
        expect(codigo, `${arquivo} referencia "${campo}"`).not.toContain(campo);
      }
    }
  });

  it("a cartinha indisponível aponta direto para /criar, não para a landing", () => {
    const codigo = codeOnly(read(PUBLIC_PAGE));
    expect(codigo).toContain('href="/criar"');
    expect(codigo).not.toContain('href="/"');
  });
});

describe("os CTAs não podem vazar para a jornada de criação", () => {
  it("CardPreview continua sem qualquer caminho para /criar nem para os componentes de CTA", () => {
    // CardPreview é compartilhado com o preview ao vivo de /criar (desktop e
    // drawer mobile). Um CTA ali apareceria para quem já está criando.
    const fonte = read(PREVIEW);
    expect(fonte).not.toContain("/criar");
    expect(fonte).not.toContain("CardCreateInvite");
    expect(fonte).not.toContain("CardCreateSeal");
    expect(fonte).not.toContain("CardMusicBadge");
    expect(fonte).not.toContain("CardFloatingActions");
  });

  it("os CTAs são montados só por CardExperience", () => {
    const codigo = codeOnly(read(EXPERIENCE));
    // Bloco final: uma vez, no estado aberto.
    expect(codigo.match(/<CardCreateInvite/g)).toHaveLength(1);
    // Selo: uma vez inline (desktop) no estado fechado; o flutuante vem do dock.
    expect(codigo).toContain("<CardCreateSeal");
    expect(codigo).toContain("<CardFloatingActions");
  });
});

describe("apresentação", () => {
  it("o bloco final NUNCA flutua (é o selo que flutua, não ele)", () => {
    const codigo = codeOnly(read(INVITE));
    expect(codigo).not.toMatch(/\b(fixed|sticky)\b/);
    expect(codigo).not.toContain("z-");
  });

  it("o posicionamento fixo vive só no dock — selo e badge não o embutem", () => {
    // Selo e badge recebem a posição por className, para servirem também inline
    // no desktop. Só CardFloatingActions declara `fixed`.
    for (const arquivo of [SEAL, BADGE]) {
      const codigo = codeOnly(read(arquivo));
      expect(codigo, `${arquivo} embute posicionamento fixo`).not.toMatch(/\bfixed\b/);
      expect(codigo).not.toMatch(/\bsticky\b/);
    }
    expect(codeOnly(read(DOCK))).toMatch(/\bfixed\b/);
  });

  it("nenhuma cor fixa: toda cor dos CTAs vem dos tokens do tema", () => {
    for (const arquivo of [INVITE, SEAL, BADGE]) {
      const codigo = codeOnly(read(arquivo));
      // Hex solto quebraria o Delicado, único tema com envelope claro.
      expect(codigo, arquivo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(codigo, arquivo).not.toMatch(
        /\b(bg|text)-(white|black|creme|vinho|dourado|rosa|grafite)\b/,
      );
    }
  });

  it("o halo de foco global cobre o <a> dos CTAs", () => {
    // Os CTAs não declaram foco próprio: dependem da regra global. Se alguém
    // remover o `a` de lá, ficam sem foco visível.
    const css = codeOnly(read("src/app/globals.css"));
    expect(css).toMatch(/:where\(a,[^)]*\):focus-visible/);
    expect(css).toContain("box-shadow");
  });

  it("os flutuantes carregam .card-float-dock (ocultos em paisagem baixa via CSS)", () => {
    const dock = read(DOCK);
    expect(dock).toContain("card-float-dock");
    const css = codeOnly(read("src/app/globals.css"));
    expect(css).toMatch(/@media\s*\(max-height:\s*480px\)\s*and\s*\(orientation:\s*landscape\)/);
    expect(css).toMatch(/\.card-float-dock\s*\{\s*display:\s*none/);
  });

  it("o pulso do indicador de música é iteração ÚNICA, nunca loop", () => {
    const css = codeOnly(read("src/app/globals.css"));
    // shorthand termina em `1 both` (iteration-count explícito); nada de `infinite`.
    expect(css).toMatch(/animation:\s*music-pulse[^;]*\s1\s+both;/);
    expect(css).not.toMatch(/music-pulse[^;}]*infinite/);
  });
});

describe("analytics", () => {
  it("os eventos estão declarados na união de eventos", () => {
    const analytics = read("src/lib/analytics.ts");
    expect(analytics).toContain('"create_cta_from_card_clicked"');
    expect(analytics).toContain('"card_music_indicator_clicked"');
  });

  it("o evento de criação continua diferenciando os estados fechado e aberto", () => {
    const seal = codeOnly(read(SEAL));
    const invite = codeOnly(read(INVITE));
    // O selo recebe `state` ("closed" | "opened") e o repassa no evento.
    expect(seal).toMatch(/["']closed["']\s*\|\s*["']opened["']/);
    expect(seal).toMatch(/track\(\s*["']create_cta_from_card_clicked["'],\s*\{\s*state\b/);
    expect(seal).toMatch(/surface:\s*["']seal["']/);
    // O bloco final é sempre "opened".
    expect(invite).toMatch(/state:\s*["']opened["']/);
    expect(invite).toMatch(/surface:\s*["']final_block["']/);
  });

  it("sanitizeAnalyticsUrl não foi alterada por esta mudança", () => {
    const codigo = codeOnly(read("src/lib/analyticsPrivacy.ts"));
    expect(codigo).toMatch(/return\s+`\$\{parsed\.origin\}\$\{path\}`/);
  });
});
