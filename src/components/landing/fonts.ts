/**
 * Fontes da identidade "Papel e Luz" (D76). Carregadas SÓ pela landing:
 * `next/font` faz o pré-carregamento por rota e escopa as variáveis ao elemento
 * que recebe `.variable`, então o app, o checkout e as cartas publicadas seguem
 * com Playfair/Inter/Dancing, definidas no layout raiz.
 */
import { DM_Sans, Fraunces } from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

export const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
