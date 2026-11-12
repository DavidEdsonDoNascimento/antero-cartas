/**
 * Fronteira de privacidade da prévia pública (`/presente/`). Ver `publicPreview.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  EXCERPT_MAX,
  EXCERPT_MIN,
  FIRST_NAME_MAX,
  PUBLIC_PREVIEW_KEYS,
  buildPublicPreviewDTO,
  extractPublicExcerpt,
  firstBlock,
  graphemes,
  isPublicIdFormat,
  publicFirstName,
  type PublicPreviewSource,
} from "./publicPreview";
import { generateSlug } from "./slug";

const LONG =
  "Hoje faz um ano que a nossa história começou e eu ainda lembro de cada detalhe daquele dia, " +
  "do café frio, da chuva fina e do jeito que você riu quando eu derrubei o guarda-chuva na porta. " +
  "Desde então cada manhã ficou mais leve e cada noite mais bonita, porque você está nela comigo.";

describe("firstBlock", () => {
  it("pega o primeiro bloco não vazio, com qualquer quebra de linha", () => {
    expect(firstBlock("\n\n  \nOi, Ana!\nResto da carta")).toBe("Oi, Ana!");
    expect(firstBlock("Primeira linha\r\nSegunda")).toBe("Primeira linha");
    expect(firstBlock("A\rB")).toBe("A");
    expect(firstBlock("Um\u2028Dois")).toBe("Um");
  });

  it("junta espaços repetidos e ignora caracteres invisíveis", () => {
    expect(firstBlock("\u200B\uFEFF  Olá    mundo  \nfim")).toBe("Olá mundo");
  });

  it("mensagem vazia ou só com espaços não tem bloco", () => {
    expect(firstBlock("")).toBe("");
    expect(firstBlock(" \n\t \n")).toBe("");
  });
});

describe("extractPublicExcerpt", () => {
  it("mensagem longa sem Enter: corta em ≤ 220 grafemas, em fim de palavra, com reticências", () => {
    const ex = extractPublicExcerpt(LONG)!;
    expect(ex.truncated).toBe(true);
    expect(ex.text.endsWith("…")).toBe(true);
    const body = ex.text.slice(0, -1);
    expect(graphemes(body).length).toBeLessThanOrEqual(EXCERPT_MAX);
    expect(LONG.startsWith(body)).toBe(true);
    // fim de palavra: o próximo caractere do original é espaço ou pontuação
    expect(LONG[body.length]).toMatch(/[\s,.]/);
  });

  it("nunca passa de metade da mensagem, mesmo com o primeiro bloco menor que 220", () => {
    const msg = "a".repeat(10) + " " + "palavra ".repeat(12).trim(); // ~106 grafemas, um bloco
    const ex = extractPublicExcerpt(msg)!;
    const total = graphemes(msg.replace(/\s+/g, " ").trim()).length;
    expect(graphemes(ex.text.replace(/…$/, "")).length).toBeLessThanOrEqual(Math.floor(total / 2));
    expect(ex.truncated).toBe(true);
  });

  it("várias quebras: mostra só o primeiro bloco, inteiro, quando cabe", () => {
    const msg = `\n\nHoje faz um ano que nossa história começou.\n\n${LONG}\nTerceiro bloco`;
    expect(extractPublicExcerpt(msg)).toEqual({
      text: "Hoje faz um ano que nossa história começou.",
      truncated: false,
    });
  });

  it("o resto da mensagem nunca aparece", () => {
    const msg = `Começo bonito da carta para você.\nSEGREDO_MEIO ${LONG}\nSEGREDO_FIM`;
    const ex = extractPublicExcerpt(msg)!;
    expect(ex.text).not.toContain("SEGREDO_MEIO");
    expect(ex.text).not.toContain("SEGREDO_FIM");
  });

  it("não parte emoji nem acento", () => {
    const family = "👨\u200D👩\u200D👧\u200D👦";
    const msg = `${"Ação e emoção ".repeat(8)}${family}${family} ${"fim ".repeat(60)}`;
    const ex = extractPublicExcerpt(msg)!;
    for (const g of graphemes(ex.text)) {
      // nenhum grafema quebrado: um ZWJ solto ou meio par substituto apareceriam sozinhos
      expect(g).not.toMatch(/^[\u200D\uD800-\uDFFF]$/);
    }
    const noBreak = "😀".repeat(300);
    const ex2 = extractPublicExcerpt(noBreak)!;
    expect(graphemes(ex2.text.replace(/…$/, "")).every((g) => g === "😀")).toBe(true);
  });

  it("mensagem curta: usa o texto genérico (null) em vez de revelar quase tudo", () => {
    expect(extractPublicExcerpt("Te amo ❤️")).toBeNull();
    expect(extractPublicExcerpt("Feliz aniversário, mãe! Te amo muito.")).toBeNull();
    expect(extractPublicExcerpt("")).toBeNull();
    expect(extractPublicExcerpt("   \n ")).toBeNull();
  });

  it("primeiro bloco curto demais depois do corte também vira genérico", () => {
    const msg = `${"x".repeat(EXCERPT_MIN - 2)} ${"y".repeat(300)}`;
    const ex = extractPublicExcerpt(msg);
    if (ex) expect(graphemes(ex.text.replace(/…$/, "")).length).toBeGreaterThanOrEqual(EXCERPT_MIN);
  });

  it("devolve texto puro: HTML do usuário segue como texto (a página o escapa)", () => {
    const msg = `<script>alert(1)</script> <b>negrito</b> ${LONG}`;
    const ex = extractPublicExcerpt(msg)!;
    expect(ex.text.startsWith("<script>")).toBe(true); // nada é interpretado aqui
  });
});

describe("publicFirstName", () => {
  it("primeira palavra, sem sobrenome", () => {
    expect(publicFirstName("Ana")).toBe("Ana");
    expect(publicFirstName("  Ana Beatriz Souza ")).toBe("Ana");
    expect(publicFirstName("José,")).toBe("José");
    expect(publicFirstName("Mãe")).toBe("Mãe");
  });

  it("tratamento não vira nome: nunca 'Para Meu'", () => {
    expect(publicFirstName("Meu amor")).toBeNull();
    expect(publicFirstName("minha mãe")).toBeNull();
    expect(publicFirstName("Querida Ana")).toBeNull();
    expect(publicFirstName("Sra. Helena")).toBeNull();
  });

  it("vazio, só espaços, só emoji ou só pontuação: sem nome", () => {
    expect(publicFirstName("")).toBeNull();
    expect(publicFirstName("   ")).toBeNull();
    expect(publicFirstName(null)).toBeNull();
    expect(publicFirstName("❤️❤️")).toBeNull();
    expect(publicFirstName("...")).toBeNull();
  });

  it("limite de tamanho", () => {
    const long = "Maximilianoaugustinho".repeat(2);
    expect(graphemes(publicFirstName(long)!).length).toBe(FIRST_NAME_MAX);
  });
});

describe("isPublicIdFormat", () => {
  it("aceita o formato gerado e recusa o resto", () => {
    expect(isPublicIdFormat(generateSlug())).toBe(true);
    expect(isPublicIdFormat("abc")).toBe(false);
    expect(isPublicIdFormat("ABCDEFGHJKMNPQRSTUVWXYZ234")).toBe(false);
    expect(isPublicIdFormat("../../etc/passwd")).toBe(false);
    expect(isPublicIdFormat("l".repeat(26))).toBe(false); // fora do alfabeto
  });
});

const SOURCE: PublicPreviewSource = {
  publicId: "abcdefghijkmnpqrstuvwxyz23",
  presentation: "romantico",
  presentationOptions: { v: 1, effect: "borboletas" },
  theme: "romantico",
  sharePreviewVersion: 1,
  recipientName: "Ana Souza",
  message: `Hoje faz um ano que nossa história começou.\nSEGREDO_MEIO\n${LONG}`,
  firstPhoto: { width: 800, height: 600, focalX: 0.3, focalY: null, zoom: 1.4 },
  hasMusic: true,
};

describe("buildPublicPreviewDTO", () => {
  it("só tem as chaves enumeradas (adicionar campo é decisão de produto)", () => {
    expect(Object.keys(buildPublicPreviewDTO(SOURCE)).sort()).toEqual([...PUBLIC_PREVIEW_KEYS].sort());
    expect(Object.keys(buildPublicPreviewDTO(SOURCE).photo!).sort()).toEqual(
      ["framing", "height", "src", "width"],
    );
  });

  it("carta nova: primeira foto pela rota própria, trecho, primeiro nome e música", () => {
    const dto = buildPublicPreviewDTO(SOURCE);
    expect(dto).toMatchObject({
      style: "romantico",
      effect: "borboletas",
      content: "full",
      recipientFirstName: "Ana",
      excerpt: { text: "Hoje faz um ano que nossa história começou.", truncated: false },
      hasMusic: true,
    });
    expect(dto.photo!.src).toBe(`/presente/${SOURCE.publicId}/foto`);
    expect(dto.photo!.framing).toEqual({ x: 0.3, y: 0.5, zoom: 1.4 });
    expect(JSON.stringify(dto)).not.toContain("SEGREDO_MEIO");
    expect(JSON.stringify(dto)).not.toContain("Souza");
  });

  it("efeito não permitido pelo estilo cai no padrão do estilo", () => {
    const dto = buildPublicPreviewDTO({
      ...SOURCE,
      presentation: "noturno",
      presentationOptions: { v: 1, effect: "borboletas" },
    });
    expect(dto.effect).toBe("brilho");
  });

  it("estilo desconhecido cai no padrão, sem lançar", () => {
    expect(buildPublicPreviewDTO({ ...SOURCE, presentation: "inexistente" }).style).toBe("papel-luz");
  });

  it("carta antiga (sem aviso): só cena e envelope, sem foto, trecho, nome ou música", () => {
    const dto = buildPublicPreviewDTO({ ...SOURCE, presentation: null, sharePreviewVersion: null });
    expect(dto).toEqual({
      style: "romantico", // pelo tema legado
      effect: "petalas",
      content: "generic",
      recipientFirstName: null,
      excerpt: null,
      photo: null,
      hasMusic: false,
    });
  });

  it("sem foto: photo nulo (a página usa o placeholder do estilo)", () => {
    expect(buildPublicPreviewDTO({ ...SOURCE, firstPhoto: null }).photo).toBeNull();
  });
});
