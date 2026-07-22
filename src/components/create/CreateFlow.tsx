"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Cart } from "@/lib/types";
import {
  createEmptyCart,
  loadDraft,
  saveDraft,
  savePublishedCart,
} from "@/lib/storage";
import { generateSlug } from "@/lib/slug";
import { getPlan } from "@/config/plans";
import { track } from "@/lib/analytics";
import { site } from "@/config/site";
import { CardPreview } from "@/components/card/CardPreview";
import { StepIndicator } from "./StepIndicator";
import { StepRecipient } from "./StepRecipient";
import { StepMessage } from "./StepMessage";
import { StepPersonalize } from "./StepPersonalize";
import { StepSign } from "./StepSign";
import { StepPlan } from "./StepPlan";
import { Success } from "./Success";
import { GhostButton, PrimaryButton } from "./ui";

type View = 1 | 2 | 3 | 4 | "plan" | "success";

export function CreateFlow() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [view, setView] = useState<View>(1);
  const [saved, setSaved] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega o rascunho da sessão (fotos ficam em memória; texto é recuperado).
  // A leitura de localStorage só existe no cliente, após a montagem.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart(loadDraft() ?? createEmptyCart());
    track("create_started");
  }, []);

  const update = useCallback((patch: Partial<Cart>) => {
    setSaved(false); // marca "não salvo" no evento de edição (fora do efeito)
    setCart((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // Autosave com debounce: o setState acontece no callback assíncrono do timer.
  useEffect(() => {
    if (!cart) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft(cart);
      setSaved(true);
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [cart]);

  if (!cart) {
    return <div className="py-20 text-center text-grafite/50">Carregando…</div>;
  }

  const canAdvance = validateStep(view, cart);

  function goNext() {
    if (view === 1) {
      track("recipient_selected", { type: cart!.recipientType ?? "" });
      setView(2);
    } else if (view === 2) {
      track("message_completed");
      setView(3);
    } else if (view === 3) {
      track("personalization_completed", { photos: cart!.media.length });
      setView(4);
    } else if (view === 4) {
      track("checkout_started");
      setView("plan");
    }
  }

  function goBack() {
    if (view === 2) setView(1);
    else if (view === 3) setView(2);
    else if (view === 4) setView(3);
    else if (view === "plan") setView(4);
  }

  function publish() {
    const plan = getPlan(cart!.planType!);
    const now = new Date();
    const slug = generateSlug();
    const expiresAt =
      plan.durationDays != null
        ? new Date(now.getTime() + plan.durationDays * 86400000).toISOString()
        : null;
    const published: Cart = {
      ...cart!,
      slug,
      status: "PUBLISHED",
      publishedAt: now.toISOString(),
      expiresAt,
      updatedAt: now.toISOString(),
    };
    track("plan_selected", { plan: plan.type });
    savePublishedCart(published);
    track("cart_published", { plan: plan.type });
    setCart(published);
    setView("success");
  }

  if (view === "success") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Success cart={cart} />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_minmax(320px,420px)] lg:py-12">
      {/* Formulário */}
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-vinho">
            ← {site.name}
          </Link>
          <span
            className={`text-xs transition ${saved ? "text-green-700" : "text-grafite/40"}`}
          >
            {saved ? "✓ Salvo" : "Salvando…"}
          </span>
        </div>

        {view !== "plan" && <StepIndicator current={view} />}

        <div className="rounded-2xl bg-white/70 p-5 shadow-sm sm:p-7">
          {view === 1 && <StepRecipient cart={cart} update={update} />}
          {view === 2 && <StepMessage cart={cart} update={update} />}
          {view === 3 && <StepPersonalize cart={cart} update={update} />}
          {view === 4 && <StepSign cart={cart} update={update} goToStep={(n) => setView(n as View)} />}
          {view === "plan" && <StepPlan cart={cart} update={update} onPublish={publish} />}

          {view !== "plan" && (
            <div className="mt-7 flex items-center justify-between border-t border-rosa/20 pt-5">
              {view > 1 ? (
                <GhostButton onClick={goBack}>← Voltar</GhostButton>
              ) : (
                <span />
              )}
              <PrimaryButton onClick={goNext} disabled={!canAdvance}>
                {view === 4 ? "Finalizar minha cartinha" : "Próxima etapa →"}
              </PrimaryButton>
            </div>
          )}

          {view === "plan" && (
            <div className="mt-5 text-center">
              <GhostButton onClick={goBack}>← Voltar para a revisão</GhostButton>
            </div>
          )}
        </div>
      </div>

      {/* Preview desktop (sticky) */}
      <aside className="hidden lg:block">
        <div className="sticky top-8">
          <p className="mb-3 text-sm font-medium text-grafite/60">
            Olha como sua cartinha está ficando 👇
          </p>
          <CardPreview cart={cart} live />
        </div>
      </aside>

      {/* Preview mobile (botão + drawer) */}
      <button
        onClick={() => setShowMobilePreview(true)}
        className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-vinho px-6 py-3 text-sm font-semibold text-creme shadow-lg lg:hidden"
      >
        👁️ Ver preview
      </button>
      {showMobilePreview && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-grafite/50 lg:hidden"
          onClick={() => setShowMobilePreview(false)}
        >
          <div
            className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-creme p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-grafite/60">Preview da cartinha</p>
              <button
                onClick={() => setShowMobilePreview(false)}
                className="rounded-full px-2 text-grafite/50"
                aria-label="Fechar preview"
              >
                ✕
              </button>
            </div>
            <CardPreview cart={cart} live />
          </div>
        </div>
      )}
    </div>
  );
}

function validateStep(view: View, cart: Cart): boolean {
  switch (view) {
    case 1:
      return !!cart.recipientType && !!cart.occasion;
    case 2:
      return cart.title.trim().length > 0 && cart.message.trim().length > 0;
    case 3:
      return true;
    case 4:
      return cart.senderName.trim().length > 0;
    default:
      return true;
  }
}
