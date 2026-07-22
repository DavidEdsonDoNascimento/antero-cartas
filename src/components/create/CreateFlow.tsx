"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Cart } from "@/lib/types";
import { loadDraft, saveDraft, clearDraft, hasMeaningfulContent } from "@/lib/storage";
import { loadSession, saveSession, clearSession, type CartSession } from "@/lib/cartSession";
import { createDraft, fetchCart, patchCart, uploadPhoto, type CartPatch } from "@/lib/api";
import { track } from "@/lib/analytics";
import { site } from "@/config/site";
import { CardPreview } from "@/components/card/CardPreview";
import { StepIndicator } from "./StepIndicator";
import { StepRecipient } from "./StepRecipient";
import { StepMessage } from "./StepMessage";
import { StepPersonalize } from "./StepPersonalize";
import { StepSign } from "./StepSign";
import { StepPlan } from "./StepPlan";
import { GhostButton, PrimaryButton } from "./ui";

type View = 1 | 2 | 3 | 4 | "plan";
type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Campos editáveis persistidos via autosave (fotos usam endpoints próprios). */
function buildPatch(cart: Cart): CartPatch {
  return {
    recipientType: cart.recipientType,
    recipientName: cart.recipientName,
    occasion: cart.occasion,
    title: cart.title,
    message: cart.message,
    senderName: cart.senderName,
    signature: cart.signature,
    theme: cart.theme,
    music: cart.music,
    relationshipStartDate: cart.relationshipStartDate,
    showRelationshipCounter: cart.showRelationshipCounter,
    planType: cart.planType,
  };
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function CreateFlow() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [session, setSession] = useState<CartSession | null>(null);
  const [view, setView] = useState<View>(1);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [initError, setInitError] = useState(false);
  const [photoMigrationNotice, setPhotoMigrationNotice] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);
  const lastSavedSnapshot = useRef<string>("");

  // --- Inicialização: retoma sessão existente ou migra rascunho local -------
  const init = useCallback(async () => {
    setInitError(false);
    const existing = loadSession();
    if (existing) {
      try {
        const { cart: loaded } = await fetchCart(existing.cartId, existing.editToken);
        // Só retoma se a carta ainda for editável. Se já foi publicada/paga
        // (ex.: um teste ou compra anterior), descarta a sessão e começa uma
        // nova — evita o erro "Esta carta já foi processada" no checkout.
        if (loaded.status === "DRAFT" || loaded.status === "AWAITING_PAYMENT") {
          lastSavedSnapshot.current = JSON.stringify(buildPatch(loaded));
          setSession(existing);
          setCart(loaded);
          return;
        }
        clearSession();
      } catch {
        clearSession(); // token inválido ou carta não encontrada: recomeça
      }
    }

    const legacy = loadDraft();
    const shouldMigrate = legacy && hasMeaningfulContent(legacy);
    const initialPatch: CartPatch | undefined = shouldMigrate
      ? {
          recipientType: legacy.recipientType,
          recipientName: legacy.recipientName,
          occasion: legacy.occasion,
          title: legacy.title,
          message: legacy.message,
          senderName: legacy.senderName,
          signature: legacy.signature,
          theme: legacy.theme,
          music: legacy.music,
          relationshipStartDate: legacy.relationshipStartDate,
          showRelationshipCounter: legacy.showRelationshipCounter,
          planType: legacy.planType,
        }
      : undefined;

    try {
      const { cart: created, editToken } = await createDraft(initialPatch);
      const newSession: CartSession = { cartId: created.id, editToken };
      saveSession(newSession);
      setSession(newSession);
      track("draft_created");

      let finalCart = created;
      if (shouldMigrate && legacy!.media.length > 0) {
        let anyFailed = false;
        for (const m of legacy!.media) {
          try {
            const blob = await dataUrlToBlob(m.url);
            const res = await uploadPhoto(newSession.cartId, newSession.editToken, blob);
            finalCart = res.cart;
          } catch {
            anyFailed = true;
          }
        }
        if (anyFailed) setPhotoMigrationNotice(true);
      }
      lastSavedSnapshot.current = JSON.stringify(buildPatch(finalCart));
      setCart(finalCart);
      clearDraft(); // só remove o rascunho antigo depois de confirmado no backend
    } catch {
      setInitError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    init();
  }, [init]);

  const update = useCallback((patch: Partial<Cart>) => {
    setSaveStatus("saving");
    setCart((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // --- Autosave com debounce, descarte de respostas antigas e retry simples --
  useEffect(() => {
    if (!cart || !session) return;
    const patch = buildPatch(cart);
    const snapshot = JSON.stringify(patch);
    if (snapshot === lastSavedSnapshot.current) return; // nada mudou

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      saveDraft(cart); // cache local de recuperação (não é a fonte da verdade)

      const seq = ++saveSeqRef.current;
      try {
        await patchCart(session.cartId, session.editToken, patch);
        lastSavedSnapshot.current = snapshot;
        if (seq === saveSeqRef.current) setSaveStatus("saved");
      } catch {
        if (seq === saveSeqRef.current) setSaveStatus("error");
      }
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [cart, session]);

  if (initError) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-grafite/70">
          Não foi possível iniciar sua cartinha agora. Verifique sua conexão e tente novamente.
        </p>
        <div className="mt-4">
          <PrimaryButton onClick={init}>Tentar novamente</PrimaryButton>
        </div>
      </div>
    );
  }

  if (!cart || !session) {
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

  /** Persiste o plano imediatamente (sem esperar o debounce) e vai ao checkout. */
  async function goToCheckout() {
    if (!cart!.planType) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await patchCart(session!.cartId, session!.editToken, buildPatch(cart!));
      lastSavedSnapshot.current = JSON.stringify(buildPatch(cart!));
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
    track("plan_selected", { plan: cart!.planType });
    router.push(`/checkout/${session!.cartId}`);
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_minmax(320px,420px)] lg:py-12">
      {/* Formulário */}
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-vinho">
            ← {site.name}
          </Link>
          <SaveIndicator status={saveStatus} />
        </div>

        {photoMigrationNotice && (
          <div className="mb-4 rounded-lg bg-dourado/15 px-3 py-2 text-xs text-grafite/70">
            Recuperamos o texto da sua cartinha anterior, mas algumas fotos precisam ser
            selecionadas novamente.{" "}
            <button
              className="underline"
              onClick={() => setPhotoMigrationNotice(false)}
            >
              Ok
            </button>
          </div>
        )}

        {view !== "plan" && <StepIndicator current={view} />}

        <div className="rounded-2xl bg-white/70 p-5 shadow-sm sm:p-7">
          {view === 1 && <StepRecipient cart={cart} update={update} />}
          {view === 2 && <StepMessage cart={cart} update={update} />}
          {view === 3 && (
            <StepPersonalize
              cart={cart}
              update={update}
              session={session}
              onCartUpdated={setCart}
            />
          )}
          {view === 4 && (
            <StepSign cart={cart} update={update} goToStep={(n) => setView(n as View)} />
          )}
          {view === "plan" && (
            <StepPlan cart={cart} update={update} onContinue={goToCheckout} />
          )}

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

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "error") {
    return <span className="text-xs text-vinho">Não foi possível salvar agora</span>;
  }
  return (
    <span
      className={`text-xs transition ${status === "saved" ? "text-green-700" : "text-grafite/40"}`}
    >
      {status === "saved" ? "✓ Salvo" : "Salvando…"}
    </span>
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
