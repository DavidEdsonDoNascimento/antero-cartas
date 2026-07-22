"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Cart } from "@/lib/types";
import { loadPublishedCart } from "@/lib/storage";
import { CardExperience } from "@/components/card/CardExperience";

type State = { status: "loading" } | { status: "found"; cart: Cart } | { status: "missing" } | { status: "expired" };

/**
 * Carrega a carta publicada do armazenamento local (Fase 1).
 * Na Fase 2 isto passa a buscar do backend por slug.
 */
export function CardLoader({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  // localStorage só existe no cliente: resolvemos o estado após a montagem.
  useEffect(() => {
    const cart = loadPublishedCart(slug);
    let next: State;
    if (!cart) {
      next = { status: "missing" };
    } else if (cart.expiresAt && new Date(cart.expiresAt).getTime() < Date.now()) {
      next = { status: "expired" };
    } else {
      next = { status: "found", cart };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(next);
  }, [slug]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-vinho text-creme/70">
        Abrindo a cartinha…
      </div>
    );
  }

  if (state.status === "found") {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    return <CardExperience cart={state.cart} shareUrl={shareUrl} />;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-vinho px-6 text-center text-creme">
      <div className="text-4xl">💌</div>
      <h1 className="font-serif text-2xl">
        {state.status === "expired" ? "Esta cartinha expirou" : "Cartinha não encontrada"}
      </h1>
      <p className="max-w-sm text-sm text-creme/70">
        {state.status === "expired"
          ? "O período de disponibilidade deste link chegou ao fim."
          : "O link pode estar incompleto ou a cartinha foi criada em outro dispositivo. Nesta versão de demonstração, as cartinhas ficam salvas apenas no navegador em que foram criadas."}
      </p>
      <Link
        href="/"
        className="rounded-full bg-dourado px-6 py-3 text-sm font-semibold text-vinho"
      >
        Criar a minha cartinha
      </Link>
    </div>
  );
}
