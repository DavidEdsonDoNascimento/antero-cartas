import type { RecipientType } from "@/lib/types";

export interface RecipientOption {
  id: RecipientType;
  label: string;
  emoji: string;
}

/** Tipos iniciais de destinatário (Etapa 1). */
export const recipients: RecipientOption[] = [
  { id: "namorada", label: "Namorada", emoji: "💗" },
  { id: "namorado", label: "Namorado", emoji: "💙" },
  { id: "esposa", label: "Esposa", emoji: "💍" },
  { id: "marido", label: "Marido", emoji: "💍" },
  { id: "mae", label: "Mãe", emoji: "🌷" },
  { id: "pai", label: "Pai", emoji: "🧡" },
  { id: "amigo", label: "Amigo(a)", emoji: "🤝" },
  { id: "filho", label: "Filho(a)", emoji: "⭐" },
  { id: "outro", label: "Outra pessoa especial", emoji: "✨" },
];

export function recipientLabel(id: RecipientType | null): string {
  if (!id) return "essa pessoa especial";
  return recipients.find((r) => r.id === id)?.label ?? "essa pessoa especial";
}
