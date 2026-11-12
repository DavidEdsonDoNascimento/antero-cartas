/**
 * Fontes da apresentação 2.0 (as mesmas famílias da identidade Papel e Luz).
 *
 * Um módulo próprio, e não `landing/fonts`, por dois motivos:
 * - `preload: false`: `/c/` serve também as cartas LEGADAS, que não usam estas
 *   fontes; com preload, toda carta antiga baixaria dois arquivos a mais. Sem
 *   ele, só quem renderiza `.variable` (carta nova, editor, prévia) baixa, com
 *   `display: swap` (o texto aparece na fonte reserva e troca sem esconder nada);
 * - a landing continua dona do próprio preload (LCP da hero).
 *
 * As variáveis só existem no elemento que recebe `.variable`: a carta legada,
 * o checkout e o resto do app seguem com Playfair/Inter/Dancing.
 */
import { DM_Sans, Fraunces } from "next/font/google";

export const presentationDisplay = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
});

export const presentationBody = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  preload: false,
});

export const presentationFontVars = `${presentationDisplay.variable} ${presentationBody.variable}`;
