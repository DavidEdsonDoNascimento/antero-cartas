"use client";

import type { Cart } from "@/lib/types";
import { recipientLabel } from "@/content/recipients";
import { occasionLabel } from "@/content/occasions";
import { getTheme } from "@/content/themes";
import { FieldLabel, StepHeader, TextField } from "./ui";

interface Props {
  cart: Cart;
  update: (patch: Partial<Cart>) => void;
  goToStep: (n: number) => void;
}

export function StepSign({ cart, update, goToStep }: Props) {
  return (
    <div>
      <StepHeader
        title="Quem está enviando?"
        subtitle="Por fim, sua assinatura e uma revisão rápida antes de finalizar."
      />

      <div className="space-y-6">
        <div>
          <FieldLabel hint="obrigatório">Seu nome</FieldLabel>
          <TextField
            value={cart.senderName}
            onChange={(v) => update({ senderName: v })}
            placeholder="Como você quer assinar?"
            maxLength={40}
            ariaLabel="Nome de quem envia"
          />
        </div>

        <div>
          <FieldLabel hint="opcional">Frase de assinatura</FieldLabel>
          <TextField
            value={cart.signature}
            onChange={(v) => update({ signature: v })}
            placeholder="Ex: Com amor, para sempre"
            maxLength={60}
            ariaLabel="Frase de assinatura"
          />
        </div>

        {/* Resumo */}
        <div className="rounded-xl border border-rosa/30 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-vinho">Resumo da cartinha</h3>
          <dl className="space-y-2 text-sm">
            <SummaryRow
              label="Para"
              value={
                cart.recipientName.trim() ||
                (cart.recipientType ? recipientLabel(cart.recipientType) : "—")
              }
              onEdit={() => goToStep(1)}
            />
            <SummaryRow
              label="Ocasião"
              value={occasionLabel(cart.occasion) || "—"}
              onEdit={() => goToStep(1)}
            />
            <SummaryRow
              label="Título"
              value={cart.title.trim() || "—"}
              onEdit={() => goToStep(2)}
            />
            <SummaryRow
              label="Mensagem"
              value={cart.message.trim() ? `${cart.message.trim().slice(0, 60)}…` : "—"}
              onEdit={() => goToStep(2)}
            />
            <SummaryRow
              label="Extras"
              value={extrasSummary(cart)}
              onEdit={() => goToStep(3)}
            />
            <SummaryRow label="Tema" value={getTheme(cart.theme).label} onEdit={() => goToStep(3)} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function extrasSummary(cart: Cart): string {
  const parts: string[] = [];
  if (cart.media.length) parts.push(`${cart.media.length} foto(s)`);
  if (cart.music) parts.push("música");
  if (cart.showRelationshipCounter && cart.relationshipStartDate) parts.push("contador");
  return parts.length ? parts.join(", ") : "nenhum";
}

function SummaryRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-grafite/50">{label}</dt>
      <dd className="flex-1 truncate text-right text-grafite">{value}</dd>
      <button
        onClick={onEdit}
        className="shrink-0 text-xs font-medium text-dourado hover:underline"
      >
        editar
      </button>
    </div>
  );
}
