import type { ThemeConfig } from "@/content/themes";
import type { ThemeId } from "@/lib/types";

/**
 * Estilos de apresentação (Antero Cartas 2.0).
 *
 * Para o cliente existe um conceito só: **Estilo**. Internamente cada estilo
 * junta peças com responsabilidades separadas:
 *
 * - `letter`   (LetterTheme): papel, tinta e ornamentos da folha. Mesmo formato
 *   de `ThemeConfig`, para que as peças já existentes (selo de criação,
 *   indicador de música, carrossel) funcionem sem adaptação.
 * - `scene`    (PresentationScene): mesa, fundo, flores, velas, luz. Desenhada
 *   em `components/presentation/scenes`.
 * - `envelope` (Envelope): papel, forro e lacre do envelope.
 * - `effects`  (VisualEffects): quais efeitos o estilo permite e o padrão.
 *
 * Regras que não mudam:
 * - **Ids são imutáveis.** Uma carta publicada guarda o id em
 *   `Cart.presentation`; renomear um id mudaria (ou quebraria) cartas pagas.
 *   Para mudar um estilo de verdade, crie um id novo.
 * - **Um estilo só fica selecionável (`ready`) quando a abertura em `/c/` e a
 *   prévia em `/presente/` sabem desenhá-lo.** O teste de presets confere.
 * - `legacyTheme` é o tema antigo mais próximo. O editor grava os dois: se a
 *   aplicação voltar a uma versão sem estilos, a carta abre no renderizador
 *   legado com uma aparência parecida, em vez de cair no tema padrão.
 */

export const PRESENTATION_IDS = ["papel-luz", "romantico", "noturno", "floral", "delicado"] as const;
export type PresentationId = (typeof PRESENTATION_IDS)[number];

export const EFFECT_IDS = ["none", "petalas", "borboletas", "brilho"] as const;
export type EffectId = (typeof EFFECT_IDS)[number];

export const DEFAULT_PRESENTATION: PresentationId = "papel-luz";

export const EFFECT_LABELS: Record<EffectId, string> = {
  none: "Sem efeito",
  petalas: "Pétalas",
  borboletas: "Borboletas",
  brilho: "Brilho",
};

/** Cores do envelope desenhado em `components/presentation/Envelope`. */
export interface EnvelopePalette {
  /** Papel externo: claro e escuro do gradiente. */
  paper: [string, string];
  /** Bolso frontal (laterais e base). */
  pocket: [string, string];
  /** Forro: fundo e desenho. */
  liner: [string, string];
  /** Pesponto e detalhes. */
  stitch: string;
  /** Lacre: três tons (luz, meio, sombra) e o relevo. */
  seal: [string, string, string];
  sealMark: string;
}

/** Cores da cena: o que precisa de contraste vem daqui, nunca da arte. */
export interface SceneTokens {
  /** Fundo sólido de reserva (antes da arte pintar, e na imagem social). */
  base: string;
  /** Texto sobre a cena (nome no envelope, frases curtas). Mín. 4,5:1 sobre `textBackdrop`. */
  text: string;
  /** Texto secundário sobre a cena. Mín. 4,5:1 sobre `textBackdrop`. */
  textMuted: string;
  /** Véu atrás do texto da cena (garante o contraste qualquer que seja a arte). */
  textBackdrop: string;
  /** Botão principal sobre a cena. */
  button: string;
  onButton: string;
  /** A cena é escura (afeta sombras e o véu da carta aberta). */
  dark: boolean;
}

export interface PresentationPreset {
  id: PresentationId;
  label: string;
  /** Uma frase curta para a miniatura do editor. */
  description: string;
  /** Selecionável no editor. Ver regra no topo do arquivo. */
  ready: boolean;
  legacyTheme: ThemeId;
  letter: LetterTheme;
  envelope: EnvelopePalette;
  scene: SceneTokens;
  effects: { default: EffectId; allowed: readonly EffectId[] };
}

/** Folha da carta v2: mesmo contrato de cores de `ThemeConfig`. */
export type LetterTheme = Omit<ThemeConfig, "id"> & { id: string };

const WINE_SEAL: [string, string, string] = ["#a4466a", "#782b45", "#4a1528"];

export const presets: readonly PresentationPreset[] = [
  {
    id: "papel-luz",
    label: "Papel e Luz",
    description: "Papel claro, luz de janela e um ramo delicado",
    ready: true,
    legacyTheme: "delicado",
    letter: {
      id: "papel-luz",
      label: "Papel e Luz",
      description: "Papel marfim com moldura dourada fina",
      envelopeBg: "#efe4d6",
      cardBg: "#fffdf9",
      ink: "#342729",
      accent: "#782b45",
      swatch: ["#fbf7f2", "#782b45"],
      onEnvelope: "#5a1e33",
      onEnvelopeMuted: "#5c4a4c",
      onAccent: "#ffffff",
      accentOnCard: "#7d5f36",
      inkMuted: "#5c4a4c",
      heading: "serif",
      paper: "plain",
      photoFrame: "tape",
      tilt: -1.5,
      cardBorder: "none",
      cardRadius: "0.4rem",
      ornament: "✦",
      divider: "· ✦ ·",
      seal: "✦",
    },
    envelope: {
      paper: ["#fbf2e6", "#ecd9c0"],
      pocket: ["#f3e6d2", "#e0c8a9"],
      liner: ["#6a2540", "#b99161"],
      stitch: "#b99161",
      seal: WINE_SEAL,
      sealMark: "#f3d9c9",
    },
    scene: {
      base: "#f1e7da",
      text: "#342729",
      textMuted: "#5c4a4c",
      textBackdrop: "#fbf7f2",
      button: "#782b45",
      onButton: "#ffffff",
      dark: false,
    },
    effects: { default: "petalas", allowed: ["none", "petalas", "brilho"] },
  },
  {
    id: "romantico",
    label: "Romântico",
    description: "Rosas, velas, morangos e detalhes dourados",
    ready: true,
    legacyTheme: "romantico",
    letter: {
      id: "romantico-v2",
      label: "Romântico",
      description: "Papel rosado, manuscrito e ornamento de coração",
      envelopeBg: "#f3dcdf",
      cardBg: "#fff8f6",
      ink: "#5a1e33",
      accent: "#9b2f4f",
      swatch: ["#f3dfe2", "#9b2f4f"],
      onEnvelope: "#5a1e33",
      onEnvelopeMuted: "#6b3a48",
      onAccent: "#ffffff",
      accentOnCard: "#8a5a2b",
      inkMuted: "#7a4253",
      heading: "script",
      paper: "lines",
      photoFrame: "tape",
      tilt: -2,
      cardBorder: "none",
      cardRadius: "0.5rem",
      ornament: "❤",
      divider: "❦",
      seal: "❤",
    },
    envelope: {
      paper: ["#fdf1f0", "#f0d3d1"],
      pocket: ["#f8e4e2", "#e6bfbd"],
      liner: ["#9b2f4f", "#e9c58a"],
      stitch: "#c79a52",
      seal: ["#c04a6a", "#9b2f4f", "#5e1730"],
      sealMark: "#f8dde0",
    },
    scene: {
      base: "#e9c9c8",
      text: "#4a1528",
      textMuted: "#6b3a48",
      textBackdrop: "#fff6f4",
      button: "#9b2f4f",
      onButton: "#ffffff",
      dark: false,
    },
    effects: { default: "petalas", allowed: ["none", "petalas", "borboletas", "brilho"] },
  },
  {
    id: "noturno",
    label: "Romântico Noturno",
    description: "Mesa escura, velas acesas e brilho dourado",
    ready: true,
    legacyTheme: "elegante",
    letter: {
      id: "noturno-v2",
      label: "Romântico Noturno",
      description: "Papel creme sob luz de vela, serifada e ouro",
      envelopeBg: "#2a1c21",
      cardBg: "#fbf4ea",
      ink: "#2b1d21",
      accent: "#6e2238",
      swatch: ["#2a1c21", "#c6a15b"],
      onEnvelope: "#f6e7d3",
      onEnvelopeMuted: "#d9c6b4",
      onAccent: "#ffffff",
      accentOnCard: "#7d5a2a",
      inkMuted: "#5d4a48",
      heading: "serif",
      paper: "plain",
      photoFrame: "clean",
      tilt: 0,
      cardBorder: "1px solid #c6a15b",
      cardRadius: "0.3rem",
      ornament: "◆",
      divider: "— ◆ —",
      seal: "◆",
    },
    envelope: {
      paper: ["#f3e3cc", "#d9bf9c"],
      pocket: ["#ead6b8", "#c9a982"],
      liner: ["#2a1c21", "#c6a15b"],
      stitch: "#c6a15b",
      seal: ["#9a3553", "#6e2238", "#3a0f1e"],
      sealMark: "#f0d7b5",
    },
    scene: {
      base: "#1d1418",
      text: "#f6e7d3",
      textMuted: "#e2cfbc",
      textBackdrop: "#241a1e",
      button: "#c6a15b",
      onButton: "#2a1c21",
      dark: true,
    },
    effects: { default: "brilho", allowed: ["none", "brilho", "petalas"] },
  },
  {
    id: "floral",
    label: "Floral",
    description: "Flores delicadas e tons rosados, para mães e amizades",
    ready: true,
    legacyTheme: "celebracao",
    letter: {
      id: "floral-v2",
      label: "Floral",
      description: "Papel claro com ramos de flores",
      envelopeBg: "#f6e3e6",
      cardBg: "#fffafa",
      ink: "#4b2a35",
      accent: "#a0405e",
      swatch: ["#f6e3e6", "#a0405e"],
      onEnvelope: "#5a1e33",
      onEnvelopeMuted: "#6b4450",
      onAccent: "#ffffff",
      accentOnCard: "#8c4a5c",
      inkMuted: "#73505b",
      heading: "script",
      paper: "dots",
      photoFrame: "tape",
      tilt: 1.5,
      cardBorder: "none",
      cardRadius: "0.75rem",
      ornament: "✿",
      divider: "✿",
      seal: "✿",
    },
    envelope: {
      paper: ["#fff5f6", "#f2d6db"],
      pocket: ["#fbe8eb", "#ecc6cd"],
      liner: ["#f7d9df", "#c9718a"],
      stitch: "#c9718a",
      seal: ["#d77c96", "#b0506f", "#7a2a45"],
      sealMark: "#ffe8ee",
    },
    scene: {
      base: "#f4dde1",
      text: "#4b2a35",
      textMuted: "#6b4450",
      textBackdrop: "#fffafa",
      button: "#a0405e",
      onButton: "#ffffff",
      dark: false,
    },
    effects: { default: "borboletas", allowed: ["none", "borboletas", "petalas"] },
  },
  {
    id: "delicado",
    label: "Delicado",
    description: "Creme, linho e um detalhe discreto: serve para todos",
    ready: true,
    legacyTheme: "delicado",
    letter: {
      id: "delicado-v2",
      label: "Delicado",
      description: "Papel creme liso, serifada e fio dourado",
      envelopeBg: "#ece5da",
      cardBg: "#fdfaf4",
      ink: "#3a3330",
      accent: "#6b5a44",
      swatch: ["#ece5da", "#8d7a5e"],
      onEnvelope: "#3a3330",
      onEnvelopeMuted: "#5a514b",
      onAccent: "#ffffff",
      accentOnCard: "#7a6446",
      inkMuted: "#5d544e",
      heading: "serif",
      paper: "plain",
      photoFrame: "clean",
      tilt: 0,
      cardBorder: "1px solid #d8cbb6",
      cardRadius: "0.25rem",
      ornament: "·",
      divider: "———",
      seal: "·",
    },
    envelope: {
      paper: ["#f7f1e7", "#e3d7c4"],
      pocket: ["#efe6d8", "#d6c7ae"],
      liner: ["#d8cbb6", "#8d7a5e"],
      stitch: "#a8957a",
      seal: ["#a89274", "#8d7a5e", "#5e4f3b"],
      sealMark: "#f4ecdf",
    },
    scene: {
      base: "#e9e2d6",
      text: "#3a3330",
      textMuted: "#5a514b",
      textBackdrop: "#fdfaf4",
      button: "#5e4f3b",
      onButton: "#ffffff",
      dark: false,
    },
    effects: { default: "brilho", allowed: ["none", "brilho", "petalas"] },
  },
];

const byId = new Map<string, PresentationPreset>(presets.map((p) => [p.id, p]));

export function isPresentationId(value: unknown): value is PresentationId {
  return typeof value === "string" && byId.has(value);
}

export function isEffectId(value: unknown): value is EffectId {
  return typeof value === "string" && (EFFECT_IDS as readonly string[]).includes(value);
}

/** Estilo pelo id. Id desconhecido cai no padrão: nunca lança. */
export function getPreset(id: string | null | undefined): PresentationPreset {
  return (id && byId.get(id)) || byId.get(DEFAULT_PRESENTATION)!;
}

/** Estilos que o editor pode oferecer. */
export function selectablePresets(): PresentationPreset[] {
  return presets.filter((p) => p.ready);
}

/**
 * Tema antigo → estilo mais próximo. Usado para rascunhos começados no editor
 * antigo (que só tinham `theme`) e para a cena genérica da prévia pública de
 * cartas legadas. Nunca muda a aparência de uma carta publicada em `/c/`.
 */
const LEGACY_THEME_TO_PRESET: Record<ThemeId, PresentationId> = {
  romantico: "romantico",
  elegante: "noturno",
  delicado: "delicado",
  celebracao: "floral",
};

export function presetForLegacyTheme(theme: string | null | undefined): PresentationId {
  return (theme && LEGACY_THEME_TO_PRESET[theme as ThemeId]) || DEFAULT_PRESENTATION;
}

export interface PresentationOptions {
  v: 1;
  effect?: EffectId;
}

/** Lê `presentationOptions` vindo do banco ou do cliente sem confiar no formato. */
export function parsePresentationOptions(raw: unknown): PresentationOptions | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== 1) return null;
  return isEffectId(obj.effect) ? { v: 1, effect: obj.effect } : { v: 1 };
}

/** O efeito que vale: o escolhido, se o estilo permitir; senão o padrão do estilo. */
export function resolveEffect(preset: PresentationPreset, options: unknown): EffectId {
  const effect = parsePresentationOptions(options)?.effect;
  return effect && preset.effects.allowed.includes(effect) ? effect : preset.effects.default;
}

export interface ResolvedExperience {
  kind: "legacy" | "presentation";
  preset: PresentationPreset;
  effect: EffectId;
}

/**
 * Qual renderizador abre a carta.
 * - `presentation` NULL → legado (cartas anteriores à 2.0, nunca redesenhadas).
 * - id conhecido → experiência nova com o estilo.
 * - id desconhecido (dado corrompido, ou um estilo de versão mais nova depois de
 *   um rollback) → experiência nova com o estilo padrão: a carta foi criada no
 *   sistema novo, com papel v2, e o legado não sabe desenhá-la.
 */
export function resolveExperience(cart: {
  presentation?: string | null;
  presentationOptions?: unknown;
}): ResolvedExperience {
  if (cart.presentation == null) {
    return { kind: "legacy", preset: getPreset(DEFAULT_PRESENTATION), effect: "none" };
  }
  const preset = getPreset(cart.presentation);
  return { kind: "presentation", preset, effect: resolveEffect(preset, cart.presentationOptions) };
}
