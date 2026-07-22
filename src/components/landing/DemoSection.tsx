"use client";

import { useState } from "react";
import Link from "next/link";
import { demoCart } from "@/content/demoCart";
import { getTheme } from "@/content/themes";
import { CardPreview } from "@/components/card/CardPreview";

/** Demonstração inline: envelope fechado que abre para revelar a carta fictícia. */
export function DemoSection() {
  const cart = demoCart();
  const theme = getTheme(cart.theme);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center">
      <div
        className="w-full max-w-md rounded-3xl p-6 sm:p-8"
        style={{ background: theme.envelopeBg }}
      >
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="flex w-full flex-col items-center gap-6 py-8 text-center"
            aria-label="Abrir cartinha de demonstração"
          >
            <span className="text-xs font-medium uppercase tracking-widest text-white/70">
              Uma surpresa foi preparada para você
            </span>
            <span className="animate-float relative flex h-32 w-52 items-center justify-center rounded-lg bg-creme shadow-2xl">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-lg"
                style={{ background: theme.accent, color: theme.envelopeBg }}
              >
                {theme.seal}
              </span>
            </span>
            <span className="font-script text-3xl text-white">{cart.recipientName}</span>
            <span
              className="rounded-full px-6 py-2.5 text-sm font-semibold"
              style={{ background: theme.accent, color: theme.envelopeBg }}
            >
              Abrir minha carta {theme.seal}
            </span>
          </button>
        ) : (
          <div className="animate-fade-up">
            <CardPreview cart={cart} />
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {open && (
          <button
            onClick={() => setOpen(false)}
            className="text-sm font-medium text-grafite/60 hover:text-vinho"
          >
            ↺ Fechar envelope
          </button>
        )}
        <Link
          href="/demonstracao"
          className="text-sm font-medium text-vinho underline underline-offset-4"
        >
          Ver demonstração completa →
        </Link>
      </div>
      <p className="mt-3 text-xs text-grafite/45">Exemplo fictício de demonstração</p>
    </div>
  );
}
