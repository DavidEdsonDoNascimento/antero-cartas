/**
 * Prévia pública `/presente/{publicId}`: o que pode sair da carta, e nada mais.
 *
 * Funções puras, sem banco nem React: são a fronteira de privacidade da prévia
 * e precisam ser testáveis isoladamente (`publicPreview.test.ts`). O serviço
 * (`server/publicPreviewService.ts`) seleciona do banco só o indispensável e
 * passa por aqui; a página recebe apenas `PublicPreviewDTO`.
 *
 * Decisão de produto (relatório 2026-11-03, seção I, revisão 1): a prévia
 * mostra a primeira foto, o começo da mensagem, o primeiro nome de quem recebe
 * e se há música. Nunca a mensagem inteira, outras fotos, remetente,
 * assinatura, título ou qualquer outro dado.
 *
 * O corte acontece AQUI, no servidor. A interface pode encurtar mais com CSS,
 * mas nunca é ela que esconde texto: o que não pode aparecer não chega ao HTML.
 */
import {
  getPreset,
  presetForLegacyTheme,
  resolveEffect,
  type EffectId,
  type PresentationId,
} from "@/content/presentation/presets";
import { clampFraming, type PhotoFraming } from "@/lib/photoFraming";

/** Teto absoluto do trecho, em grafemas. */
export const EXCERPT_MAX = 220;
/** Abaixo disso o trecho revelaria quase tudo (ou nada com sentido): vai o texto genérico. */
export const EXCERPT_MIN = 24;
/** Primeiro nome: no máximo isto, em grafemas. */
export const FIRST_NAME_MAX = 20;

/** Versão da regra de prévia com conteúdo real. Ver `Cart.sharePreviewVersion`. */
export const SHARE_PREVIEW_VERSION = 1;

/** Frase usada quando não há trecho que possa sair (mensagem curta, carta antiga). */
export const GENERIC_EXCERPT = "Uma mensagem especial foi escrita com carinho.";

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("pt-BR", { granularity: "grapheme" })
    : null;

/** Grafemas (o que a pessoa vê como "um caractere"): emoji e acento nunca se partem. */
export function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text); // code points: ainda não parte pares substitutos
}

/** `\r\n`, `\r`, separadores Unicode de linha e parágrafo viram `\n`. */
export function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?|[\u2028\u2029\u0085]/g, "\n");
}

/**
 * Remove caracteres de controle (exceto quebras) e espaços de largura zero. O
 * ZWJ (U+200D) fica: ele une emojis compostos (família, profissões).
 */
function stripInvisible(text: string): string {
  return text.replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B\u2060\uFEFF]/g, "");
}

/**
 * Primeiro bloco não vazio. Bloco = trecho entre quebras de linha, qualquer
 * quebra: num campo de texto muita gente separa parágrafos com um Enter só, e
 * exigir linha em branco faria o "primeiro parágrafo" ser a carta inteira.
 */
export function firstBlock(message: string): string {
  const lines = stripInvisible(normalizeLineBreaks(message)).split("\n");
  for (const line of lines) {
    const block = line.replace(/\s+/g, " ").trim();
    if (block) return block;
  }
  return "";
}

export interface PublicExcerpt {
  text: string;
  /** O texto foi cortado (termina com reticências). */
  truncated: boolean;
}

/**
 * Trecho público da mensagem.
 *
 * Limite = o menor entre `EXCERPT_MAX` e metade da mensagem inteira (em
 * grafemas, sem contar espaços repetidos). A metade é o que impede uma carta
 * escrita sem Enter (um bloco só = a carta toda) de ir inteira para a prévia.
 * Abaixo de `EXCERPT_MIN`, devolve `null`: a página mostra `GENERIC_EXCERPT`.
 */
export function extractPublicExcerpt(message: string): PublicExcerpt | null {
  const whole = stripInvisible(normalizeLineBreaks(message)).replace(/\s+/g, " ").trim();
  if (!whole) return null;
  const limit = Math.min(EXCERPT_MAX, Math.floor(graphemes(whole).length / 2));
  if (limit < EXCERPT_MIN) return null;

  const block = graphemes(firstBlock(message));
  if (block.length <= limit) {
    const text = block.join("");
    return text.length > 0 ? { text, truncated: false } : null;
  }

  // Corta em fim de palavra quando há um espaço razoavelmente perto do limite;
  // senão (palavra enorme, texto sem espaços), corta no grafema.
  let cut = limit;
  for (let i = limit; i > Math.floor(limit * 0.6); i--) {
    if (/\s/.test(block[i] ?? "")) {
      cut = i;
      break;
    }
  }
  const text = block
    .slice(0, cut)
    .join("")
    .replace(/[\s.,;:!?…—–-]+$/u, "");
  if (graphemes(text).length < EXCERPT_MIN) return null;
  return { text: `${text}…`, truncated: true };
}

/**
 * Palavras que abrem um tratamento e não um nome: "Meu amor", "Minha mãe",
 * "Querida Ana". Comparação sem acento e sem caixa. Se a primeira palavra for
 * uma delas, não há primeiro nome (nunca "Para Meu").
 */
const NOT_A_NAME = new Set([
  "meu", "minha", "meus", "minhas", "mio", "mia",
  "querido", "querida", "queridos", "queridas",
  "seu", "sua", "seus", "suas", "nosso", "nossa",
  "dona", "dom", "sr", "sra", "srta", "senhor", "senhora", "dr", "dra",
  "prezado", "prezada", "caro", "cara",
  "para", "pra", "pro", "ao", "a", "o", "as", "os", "de", "do", "da",
  "my", "dear", "to",
]);

function fold(word: string): string {
  return word
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Primeiro nome de quem recebe, do campo "Para quem é?" e de nenhum outro
 * lugar (nunca do título nem da mensagem). Sem sobrenome, com limite de
 * tamanho e só se for uma palavra com letras.
 */
export function publicFirstName(recipientName: string | null | undefined): string | null {
  if (!recipientName) return null;
  const words = stripInvisible(normalizeLineBreaks(recipientName)).trim().split(/\s+/);
  const word = (words[0] ?? "").replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
  if (!word || !/\p{L}/u.test(word)) return null;
  if (NOT_A_NAME.has(fold(word))) return null;
  const g = graphemes(word);
  return g.length > FIRST_NAME_MAX ? g.slice(0, FIRST_NAME_MAX).join("") : word;
}

/** O mínimo que o serviço lê do banco para montar a prévia. */
export interface PublicPreviewSource {
  publicId: string;
  presentation: string | null;
  presentationOptions: unknown;
  /** Tema legado: só escolhe a cena de cartas sem estilo. */
  theme: string;
  sharePreviewVersion: number | null;
  recipientName: string;
  message: string;
  /** Só a PRIMEIRA foto, sem chave de storage nem URL. */
  firstPhoto: {
    width: number | null;
    height: number | null;
    focalX: number | null;
    focalY: number | null;
    zoom: number | null;
  } | null;
  hasMusic: boolean;
}

/**
 * Tudo o que a página pública pode receber. Adicionar um campo aqui é decidir
 * publicar mais um dado da carta: o teste de chaves fechadas falha de propósito.
 */
export interface PublicPreviewDTO {
  style: PresentationId;
  effect: EffectId;
  /** `full` = prévia com conteúdo real; `generic` = carta antiga, só cena e envelope. */
  content: "full" | "generic";
  recipientFirstName: string | null;
  excerpt: PublicExcerpt | null;
  photo: {
    src: string;
    width: number | null;
    height: number | null;
    framing: PhotoFraming | null;
  } | null;
  hasMusic: boolean;
}

export const PUBLIC_PREVIEW_KEYS = [
  "style",
  "effect",
  "content",
  "recipientFirstName",
  "excerpt",
  "photo",
  "hasMusic",
] as const;

/** Caminho da foto pública: a rota própria, nunca `/api/media` (que revela a chave). */
export function publicPhotoPath(publicId: string): string {
  return `/presente/${publicId}/foto`;
}

/** Formato do identificador público: o mesmo alfabeto e tamanho de `lib/slug`. */
export const PUBLIC_ID_RE = /^[a-km-np-z2-9]{26}$/;

export function isPublicIdFormat(value: string): boolean {
  return PUBLIC_ID_RE.test(value);
}

export function buildPublicPreviewDTO(source: PublicPreviewSource): PublicPreviewDTO {
  const style = source.presentation
    ? getPreset(source.presentation).id
    : presetForLegacyTheme(source.theme);
  const preset = getPreset(style);
  const effect = source.presentation
    ? resolveEffect(preset, source.presentationOptions)
    : preset.effects.default;

  // Cartas criadas antes do aviso: quem as criou não sabia que parte da carta
  // poderia ficar pública. Só cena e envelope.
  if (source.sharePreviewVersion !== SHARE_PREVIEW_VERSION) {
    return {
      style,
      effect,
      content: "generic",
      recipientFirstName: null,
      excerpt: null,
      photo: null,
      hasMusic: false,
    };
  }

  const p = source.firstPhoto;
  const hasFraming = p && (p.focalX !== null || p.focalY !== null || p.zoom !== null);
  return {
    style,
    effect,
    content: "full",
    recipientFirstName: publicFirstName(source.recipientName),
    excerpt: extractPublicExcerpt(source.message),
    photo: p
      ? {
          src: publicPhotoPath(source.publicId),
          width: p.width,
          height: p.height,
          // Mesma regra da carta (`cartMapping.toFraming`): uma coluna basta, o
          // resto cai no padrão e nada fora de faixa passa.
          framing: hasFraming
            ? clampFraming({
                x: p.focalX ?? undefined,
                y: p.focalY ?? undefined,
                zoom: p.zoom ?? undefined,
              })
            : null,
        }
      : null,
    hasMusic: source.hasMusic,
  };
}

/**
 * Encurta um trecho JÁ público (vindo de `extractPublicExcerpt`) para caber na
 * imagem social. Nunca recebe a mensagem original.
 */
export function shortenForImage(text: string, max = 140): string {
  const g = graphemes(text.replace(/…$/, ""));
  if (g.length <= max) return text;
  let cut = max;
  for (let i = max; i > Math.floor(max * 0.6); i--) {
    if (/\s/.test(g[i] ?? "")) {
      cut = i;
      break;
    }
  }
  return `${g.slice(0, cut).join("").replace(/[\s.,;:!?…—–-]+$/u, "")}…`;
}
