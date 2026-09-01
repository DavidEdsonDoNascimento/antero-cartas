import type { ThemeId } from "@/lib/types";

/**
 * Temas visuais dirigidos por tokens (não há quatro implementações separadas).
 * Cada tema varia fundo, tipografia de destaque, papel, moldura das fotos,
 * borda da carta, ornamento e detalhes do envelope.
 */
export interface ThemeConfig {
  id: ThemeId;
  label: string;
  description: string;

  /** Cores base. */
  envelopeBg: string;
  cardBg: string;
  ink: string;
  accent: string;
  swatch: [string, string];

  /**
   * Cores derivadas para pares específicos (auditoria visual, PR 1 —
   * `docs/tasks-pending/016_revisao_visual_v1.md`). `envelopeBg`, `ink` e
   * `accent` sozinhos não garantem contraste em todo par onde aparecem — por
   * isso cada combinação crítica ganha seu próprio campo, validado em
   * `src/content/themes.test.ts`. Nenhum destes campos existia antes desta
   * auditoria; a UI reaproveitava `envelopeBg`/`accent`/opacidade de `ink`
   * como cor de texto, o que produzia razões abaixo de 4,5:1 em vários
   * temas (o Delicado chegava a 1,08:1 no botão "Abrir minha carta").
   */
  /** Texto/elemento de destaque direto sobre `envelopeBg` (ex.: nome do destinatário). Mín. 3:1 (texto grande). */
  onEnvelope: string;
  /** Texto secundário direto sobre `envelopeBg` (ex.: "Uma surpresa foi preparada..."). Mín. 4,5:1. */
  onEnvelopeMuted: string;
  /** Texto/glifo sobre `accent` (botão "Abrir minha carta", selo do envelope). Mín. 4,5:1. */
  onAccent: string;
  /** Uso decorativo de `accent` direto sobre `cardBg` (ornamento, divisor, indicador ativo do carrossel). Mín. 3:1. */
  accentOnCard: string;
  /** Texto secundário sobre `cardBg` (linha "Para X", assinatura, contador, canal da música). Mín. 4,5:1. */
  inkMuted: string;

  /** Tipografia do título da carta. */
  heading: "script" | "serif";
  /** Fundo do papel. */
  paper: "lines" | "dots" | "plain";
  /** Moldura das fotos no carrossel. */
  photoFrame: "tape" | "clean";
  /** Inclinação das fotos (graus). */
  tilt: number;
  /** Borda e raio da folha da carta (CSS). */
  cardBorder: string;
  cardRadius: string;
  /** Ornamento ao lado do título e divisor decorativo. */
  ornament: string;
  divider: string;
  /** Selo do envelope. */
  seal: string;
}

export const themes: ThemeConfig[] = [
  {
    id: "romantico",
    label: "Romântico",
    description: "Vinho profundo, manuscrito e papel pautado",
    envelopeBg: "#4e1528",
    cardBg: "#fff9f4",
    ink: "#681d35",
    accent: "#c6a15b",
    swatch: ["#681d35", "#d98c9f"],
    onEnvelope: "#ffffff",
    onEnvelopeMuted: "#d3c5c9",
    onAccent: "#4e1528",
    accentOnCard: "#8a6a2f",
    inkMuted: "#8e5465",
    heading: "script",
    paper: "lines",
    photoFrame: "tape",
    tilt: -1.8,
    cardBorder: "none",
    cardRadius: "0.5rem",
    ornament: "❤",
    divider: "❦",
    seal: "✦",
  },
  {
    id: "elegante",
    label: "Elegante",
    description: "Grafite sóbrio, serifada e moldura dourada",
    envelopeBg: "#211d1e",
    cardBg: "#fbf7f2",
    ink: "#26211f",
    accent: "#c6a15b",
    swatch: ["#211d1e", "#c6a15b"],
    onEnvelope: "#ffffff",
    onEnvelopeMuted: "#c8c7c7",
    onAccent: "#211d1e",
    accentOnCard: "#8a6a2f",
    inkMuted: "#5b5754",
    heading: "serif",
    paper: "plain",
    photoFrame: "clean",
    tilt: 0,
    cardBorder: "1px solid #c6a15b",
    cardRadius: "0.25rem",
    ornament: "◆",
    divider: "———",
    seal: "◆",
  },
  {
    id: "delicado",
    label: "Delicado",
    description: "Creme e rosa suave, manuscrito e papel pontilhado",
    envelopeBg: "#d98c9f",
    cardBg: "#fffdfb",
    ink: "#8a4256",
    // Ajustado de #c98aa0 (auditoria visual): era claro demais sobre um
    // envelopeBg também claro — o par accent/envelopeBg do botão "Abrir
    // minha carta" chegava a 1,08:1. #7a3549 é a mesma família de vinho/rosa
    // (mantém a identidade "rosa suave" do tema, que continua sendo o único
    // com envelope claro) com contraste suficiente como fundo de botão.
    accent: "#7a3549",
    swatch: ["#d98c9f", "#f3dfe4"],
    onEnvelope: "#3f1a25",
    onEnvelopeMuted: "#3f1a25",
    onAccent: "#ffffff",
    accentOnCard: "#7a3549",
    inkMuted: "#8a4256",
    heading: "script",
    paper: "dots",
    photoFrame: "tape",
    tilt: 2,
    cardBorder: "1px solid #f0cdd6",
    cardRadius: "1.25rem",
    ornament: "❀",
    divider: "✿",
    seal: "❀",
  },
  {
    id: "celebracao",
    label: "Celebração",
    description: "Vinho festivo, serifada marcante e brilho dourado",
    envelopeBg: "#5a1a30",
    cardBg: "#fffaf0",
    ink: "#681d35",
    accent: "#c6a15b",
    swatch: ["#681d35", "#c6a15b"],
    onEnvelope: "#ffffff",
    onEnvelopeMuted: "#d6c6cb",
    onAccent: "#5a1a30",
    accentOnCard: "#8a6a2f",
    inkMuted: "#8e5464",
    heading: "serif",
    paper: "lines",
    photoFrame: "tape",
    tilt: -1,
    cardBorder: "2px solid #c6a15b",
    cardRadius: "0.75rem",
    ornament: "✦",
    divider: "✷ ✦ ✷",
    seal: "✦",
  },
];

export const DEFAULT_THEME: ThemeId = "romantico";

export function getTheme(id: ThemeId): ThemeConfig {
  return themes.find((t) => t.id === id) ?? themes[0];
}

/** Classe de papel para o preview. */
export function paperClass(paper: ThemeConfig["paper"]): string {
  if (paper === "lines") return "paper-lines";
  if (paper === "dots") return "paper-dots";
  return "";
}
