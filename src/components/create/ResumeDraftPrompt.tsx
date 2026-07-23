"use client";

import type { Cart } from "@/lib/types";
import { recipientLabel } from "@/content/recipients";
import { PrimaryButton, GhostButton } from "./ui";

/**
 * "Continuar de onde parei" precisa ser uma decisão explícita do usuário, não
 * um retomar silencioso — evita confundir uma cartinha antiga com uma nova
 * (ver docs/tasks/008_ajustes.md item 2).
 */
export function ResumeDraftPrompt({
  cart,
  onContinue,
  onStartFresh,
  busy,
}: {
  cart: Cart;
  onContinue: () => void;
  onStartFresh: () => void;
  busy: boolean;
}) {
  const summary = cart.title.trim()
    ? `"${cart.title.trim()}"`
    : `para ${recipientLabel(cart.recipientType)}`;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-3 text-4xl">💌</div>
      <h1 className="text-xl font-semibold text-vinho sm:text-2xl">
        Você tem uma cartinha em andamento
      </h1>
      <p className="mt-2 text-sm text-grafite/60">
        Encontramos um rascunho não finalizado {summary}. Quer continuar de onde parou ou
        começar uma cartinha nova?
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        <PrimaryButton onClick={onContinue} disabled={busy}>
          Continuar esse rascunho
        </PrimaryButton>
        <GhostButton onClick={busy ? undefined : onStartFresh}>
          {busy ? "Criando cartinha nova…" : "Começar uma cartinha nova"}
        </GhostButton>
      </div>
    </div>
  );
}
