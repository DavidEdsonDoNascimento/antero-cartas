"use client";

import type { Cart, RecipientType } from "@/lib/types";
import { recipients } from "@/content/recipients";
import { occasions } from "@/content/occasions";
import { FieldLabel, OptionGrid, StepHeader, TextField } from "./ui";

interface Props {
  cart: Cart;
  update: (patch: Partial<Cart>) => void;
}

export function StepRecipient({ cart, update }: Props) {
  return (
    <div>
      <StepHeader
        title="Para quem é essa cartinha?"
        subtitle="Vamos personalizar as sugestões conforme a sua escolha."
      />

      <div className="space-y-6">
        <div>
          <FieldLabel>Tipo de destinatário</FieldLabel>
          <OptionGrid
            options={recipients}
            selected={cart.recipientType}
            onSelect={(id) => update({ recipientType: id as RecipientType })}
          />
        </div>

        <div>
          <FieldLabel hint="opcional">Nome de quem vai receber</FieldLabel>
          <TextField
            value={cart.recipientName}
            onChange={(v) => update({ recipientName: v })}
            placeholder="Ex: Ana, mãe, meu amor…"
            maxLength={40}
            ariaLabel="Nome do destinatário"
          />
        </div>

        <div>
          <FieldLabel>Qual a ocasião?</FieldLabel>
          <OptionGrid
            options={occasions}
            selected={cart.occasion}
            onSelect={(id) => update({ occasion: id })}
          />
        </div>
      </div>
    </div>
  );
}
