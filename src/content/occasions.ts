export interface OccasionOption {
  id: string;
  label: string;
  emoji: string;
}

/** Ocasiões iniciais (Etapa 1). */
export const occasions: OccasionOption[] = [
  { id: "declaracao", label: "Declaração de amor", emoji: "❤️" },
  { id: "aniversario", label: "Aniversário", emoji: "🎂" },
  { id: "aniversario-namoro", label: "Aniversário de namoro ou casamento", emoji: "💞" },
  { id: "agradecimento", label: "Agradecimento", emoji: "🙏" },
  { id: "desculpas", label: "Pedido de desculpas", emoji: "🌱" },
  { id: "dia-das-maes", label: "Dia das Mães", emoji: "🌸" },
  { id: "dia-dos-pais", label: "Dia dos Pais", emoji: "🎣" },
  { id: "amizade", label: "Amizade", emoji: "🫶" },
  { id: "outra", label: "Outra ocasião", emoji: "✨" },
];

export function occasionLabel(id: string | null): string {
  if (!id) return "";
  return occasions.find((o) => o.id === id)?.label ?? "";
}
