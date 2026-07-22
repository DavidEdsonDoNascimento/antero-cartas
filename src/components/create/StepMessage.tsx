"use client";

import { useState } from "react";
import type { Cart } from "@/lib/types";
import { getTemplates, type MessageTemplate } from "@/content/templates";
import { flags } from "@/config/flags";
import { FieldLabel, StepHeader, TextArea, TextField } from "./ui";

interface Props {
  cart: Cart;
  update: (patch: Partial<Cart>) => void;
}

export function StepMessage({ cart, update }: Props) {
  const [showInspiration, setShowInspiration] = useState(false);
  const templates = getTemplates(cart.recipientType);

  function applyTemplate(t: MessageTemplate) {
    update({
      title: cart.title.trim() ? cart.title : t.title,
      message: t.message,
    });
    setShowInspiration(false);
  }

  return (
    <div>
      <StepHeader
        title="Capriche nas palavras"
        subtitle="Um título curto e uma mensagem que venha do coração. Você pode editar tudo depois."
      />

      <div className="space-y-6">
        <div>
          <FieldLabel hint="obrigatório">Título da cartinha</FieldLabel>
          <TextField
            value={cart.title}
            onChange={(v) => update({ title: v })}
            placeholder="Ex: Para o meu amor 💗"
            maxLength={80}
            ariaLabel="Título da cartinha"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <FieldLabel hint="obrigatório">Mensagem</FieldLabel>
            <button
              type="button"
              onClick={() => setShowInspiration(true)}
              className="mb-1.5 rounded-full bg-rosa-soft px-3 py-1 text-xs font-medium text-vinho transition hover:bg-rosa/40"
            >
              💡 Preciso de inspiração
            </button>
          </div>
          <TextArea
            value={cart.message}
            onChange={(v) => update({ message: v })}
            placeholder="Escreva aqui o que você sente. Pode ser simples — o importante é ser verdadeiro."
            maxLength={1200}
            rows={8}
          />
          {!flags.AI_WRITING_ASSISTANT && (
            <p className="mt-1 text-xs text-grafite/45">
              As sugestões são modelos prontos que você pode usar e ajustar.
            </p>
          )}
        </div>
      </div>

      {showInspiration && (
        <InspirationModal
          templates={templates}
          onPick={applyTemplate}
          onClose={() => setShowInspiration(false)}
        />
      )}
    </div>
  );
}

function InspirationModal({
  templates,
  onPick,
  onClose,
}: {
  templates: MessageTemplate[];
  onPick: (t: MessageTemplate) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-grafite/50 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Modelos de mensagem"
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-creme p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-vinho">Escolha um ponto de partida</h3>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full px-2 text-grafite/50 hover:text-vinho"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3">
          {templates.map((t, i) => (
            <button
              key={i}
              onClick={() => onPick(t)}
              className="w-full rounded-xl border border-rosa/30 bg-white p-4 text-left transition hover:border-vinho/50 hover:shadow-sm"
            >
              <p className="font-medium text-vinho">{t.title}</p>
              <p className="mt-1 line-clamp-3 text-sm text-grafite/70">{t.message}</p>
              <span className="mt-2 inline-block text-xs font-medium text-dourado">
                Usar este modelo →
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-grafite/45">
          Depois de inserir, é só editar do seu jeito.
        </p>
      </div>
    </div>
  );
}
