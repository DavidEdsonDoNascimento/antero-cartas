"use client";

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";

/**
 * Painel de "Deixar mais especial" (fotos, música, contador, título).
 *
 * Fica SEMPRE montado: fechado, só recebe `hidden`. O campo de fotos guarda a
 * fila de envio e as fotos com falha no próprio estado; desmontar o painel
 * esconderia uma foto pendente e deixaria a pessoa pagar achando que ela foi.
 *
 * No celular é uma folha que sobe de baixo; no desktop, uma gaveta lateral.
 * Esc e "Pronto" fecham (e o editor devolve o foco à linha que o abriu).
 */
export function ExtraPanel({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // O foco vai para o título só quando o painel ABRE. O editor recria `onClose` a
  // cada render (cada tecla, cada "Salvando…"); se ele fosse dependência deste
  // efeito, o foco sairia do campo em que a pessoa está digitando.
  const onEscape = useEffectEvent((e: KeyboardEvent) => e.key === "Escape" && onClose());
  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => onEscape(e);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      hidden={!open}
      className="fixed inset-0 z-50 bg-grafite/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl bg-creme shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[480px] lg:rounded-none lg:rounded-l-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-rosa/25 px-5 py-4">
          <h2 ref={headingRef} id={titleId} tabIndex={-1} className="font-serif text-xl font-semibold text-vinho outline-none">
            {title}
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
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        <div className="border-t border-rosa/25 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-14 w-full rounded-full bg-vinho px-6 text-base font-semibold text-creme shadow-md transition hover:bg-vinho-deep"
          >
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
