"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Cart } from "@/lib/types";
import { LIMITS } from "@/lib/limits";
import { getTemplates, type MessageTemplate } from "@/content/templates";
import { HELP_GROUPS, type HelpGroup } from "@/lib/letterDefaults";

interface Props {
  cart: Cart;
  update: (patch: Partial<Cart>) => void;
  /** Mostra o erro da mensagem obrigatória (depois de tentar seguir sem ela). */
  messageError: string | null;
  messageRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Escrever: a primeira coisa que a pessoa vê. Só a mensagem é obrigatória.
 * Nada de cena nem animação aqui: digitar não pode custar nada.
 */
export function WriteStep({ cart, update, messageError, messageRef }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const ids = {
    to: useId(),
    toHint: useId(),
    msg: useId(),
    msgHint: useId(),
    msgError: useId(),
    from: useId(),
    fromHint: useId(),
  };
  const length = cart.message.length;

  useAutoGrow(messageRef, cart.message);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-serif text-[1.75rem] font-semibold leading-tight text-vinho sm:text-3xl">
          Escreva sua cartinha
        </h1>
        <p className="mt-2 text-base text-grafite/70">
          Só a mensagem é obrigatória. O resto você decide depois, se quiser.
        </p>
      </div>

      <div>
        <label htmlFor={ids.to} className="block text-base font-semibold text-grafite">
          Para quem é?
        </label>
        <p id={ids.toHint} className="mt-0.5 text-sm text-grafite/65">
          Opcional. Se ficar vazio, a carta diz “Para você”.
        </p>
        <input
          id={ids.to}
          type="text"
          value={cart.recipientName}
          onChange={(e) => update({ recipientName: e.target.value })}
          maxLength={LIMITS.recipientName}
          placeholder="Ex.: Ana"
          autoComplete="off"
          aria-describedby={ids.toHint}
          className="mt-2 min-h-14 w-full rounded-xl border border-rosa/50 bg-white px-4 text-lg text-grafite outline-none transition placeholder:text-grafite/40 focus:border-vinho focus:ring-2 focus:ring-vinho/20"
        />
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label htmlFor={ids.msg} className="block text-base font-semibold text-grafite">
            Sua mensagem
          </label>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="min-h-11 rounded-full bg-rosa-soft px-4 text-sm font-semibold text-vinho transition hover:bg-rosa/40"
          >
            Quer ajuda para começar?
          </button>
        </div>
        <p id={ids.msgHint} className="mt-0.5 text-sm text-grafite/65">
          Escreva do seu jeito. Pode ser simples: o importante é ser verdadeiro.
        </p>
        <textarea
          ref={messageRef}
          id={ids.msg}
          value={cart.message}
          onChange={(e) => update({ message: e.target.value })}
          maxLength={LIMITS.message}
          rows={8}
          required
          aria-required="true"
          aria-invalid={messageError ? true : undefined}
          aria-describedby={`${ids.msgHint} ${messageError ? ids.msgError : ""}`.trim()}
          placeholder="Escreva aqui o que você sente…"
          className={`mt-2 min-h-56 w-full resize-none overflow-hidden rounded-2xl border bg-white px-4 py-4 font-serif text-lg leading-8 text-grafite outline-none transition placeholder:text-grafite/40 focus:ring-2 ${
            messageError ? "border-vinho focus:ring-vinho/30" : "border-rosa/50 focus:border-vinho focus:ring-vinho/20"
          }`}
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          {messageError ? (
            <p id={ids.msgError} role="alert" className="text-sm font-medium text-vinho">
              {messageError}
            </p>
          ) : (
            <span />
          )}
          <span className="shrink-0 text-sm text-grafite/60" aria-live="off">
            {length}/{LIMITS.message}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor={ids.from} className="block text-base font-semibold text-grafite">
          Quem está enviando?
        </label>
        <p id={ids.fromHint} className="mt-0.5 text-sm text-grafite/65">
          Opcional. Se ficar vazio, a carta vai sem assinatura.
        </p>
        <input
          id={ids.from}
          type="text"
          value={cart.senderName}
          onChange={(e) => update({ senderName: e.target.value })}
          maxLength={LIMITS.senderName}
          placeholder="Seu nome"
          autoComplete="off"
          aria-describedby={ids.fromHint}
          className="mt-2 min-h-14 w-full rounded-xl border border-rosa/50 bg-white px-4 text-lg text-grafite outline-none transition placeholder:text-grafite/40 focus:border-vinho focus:ring-2 focus:ring-vinho/20"
        />
      </div>

      {helpOpen && (
        <HelpDialog
          hasText={cart.message.trim().length > 0}
          onClose={() => setHelpOpen(false)}
          onPick={(group, t) => {
            update({
              message: t.message,
              ...(group.recipientType ? { recipientType: group.recipientType } : {}),
            });
            setHelpOpen(false);
            window.setTimeout(() => messageRef.current?.focus(), 0);
          }}
        />
      )}
    </div>
  );
}

/** O campo cresce com o texto (sem barra de rolagem dentro da página). */
function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 224)}px`;
  }, [ref, value]);
}

function HelpDialog({
  hasText,
  onClose,
  onPick,
}: {
  hasText: boolean;
  onClose: () => void;
  onPick: (group: HelpGroup, t: MessageTemplate) => void;
}) {
  const [group, setGroup] = useState<HelpGroup | null>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, group]);

  const templates = group ? dedupe(group.types.flatMap((t) => getTemplates(t))) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-grafite/50 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-creme p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-serif text-xl font-semibold text-vinho">
            {group ? "Escolha um ponto de partida" : "Para quem é a cartinha?"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-grafite/60 hover:bg-rosa-soft hover:text-vinho"
          >
            ✕
          </button>
        </div>

        {!group ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {HELP_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroup(g)}
                className="min-h-14 rounded-2xl border border-rosa/40 bg-white px-4 text-left text-lg font-semibold text-grafite transition hover:border-vinho/50"
              >
                {g.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {hasText && (
              <p className="rounded-xl bg-dourado/15 px-3 py-2 text-sm text-grafite/80">
                A mensagem escolhida substitui o texto que você já escreveu.
              </p>
            )}
            {templates.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPick(group, t)}
                className="w-full rounded-2xl border border-rosa/40 bg-white p-4 text-left transition hover:border-vinho/50"
              >
                <span className="block text-base text-grafite/85">{t.message}</span>
                <span className="mt-2 inline-block text-sm font-semibold text-vinho">Usar esta mensagem</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setGroup(null)}
              className="min-h-11 text-sm font-semibold text-vinho underline"
            >
              ← Escolher outra pessoa
            </button>
          </div>
        )}
        <p className="mt-4 text-center text-sm text-grafite/60">Depois de escolher, é só editar do seu jeito.</p>
      </div>
    </div>
  );
}

function dedupe(list: MessageTemplate[]): MessageTemplate[] {
  const seen = new Set<string>();
  return list.filter((t) => (seen.has(t.message) ? false : (seen.add(t.message), true)));
}
