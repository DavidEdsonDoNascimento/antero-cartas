/**
 * Depoimentos.
 * IMPORTANTE: enquanto `isDemo` for true, são exemplos fictícios marcados
 * claramente como demonstração. NUNCA publicar depoimentos fictícios em
 * produção. Substitua por depoimentos reais e defina `isDemo: false`.
 */

export interface Testimonial {
  name: string;
  relation: string;
  text: string;
}

/** Marcador global: some com a etiqueta "demonstração" quando forem reais. */
export const testimonialsAreDemo = true;

export const testimonials: Testimonial[] = [
  {
    name: "Mariana",
    relation: "Para o namorado",
    text: "Ele abriu a cartinha no celular e ficou sem reação com a música e as nossas fotos. Foi muito mais especial do que eu imaginava.",
  },
  {
    name: "Rafael",
    relation: "Para a esposa",
    text: "Montei em poucos minutos no intervalo do trabalho. O contador de tempo juntos foi o detalhe que mais emocionou.",
  },
  {
    name: "Beatriz",
    relation: "Para a mãe",
    text: "Não sou boa com palavras, mas os modelos me ajudaram a começar. Minha mãe guardou o link e abre de vez em quando.",
  },
];
