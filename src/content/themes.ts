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
    accent: "#c98aa0",
    swatch: ["#d98c9f", "#f3dfe4"],
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
