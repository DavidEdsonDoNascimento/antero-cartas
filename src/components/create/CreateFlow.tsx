"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Cart, CartMedia } from "@/lib/types";
import {
  saveDraft,
  clearDraft,
  saveUnsyncedChanges,
  loadUnsyncedChanges,
  clearUnsyncedChanges,
} from "@/lib/storage";
import { saveSession, clearSession, type CartSession } from "@/lib/cartSession";
import { fetchCart, patchCart, uploadPhoto, createDraft } from "@/lib/api";
import {
  buildPatch,
  getCartInit,
  isEditableStatus,
  LOAD_TIMEOUT_MS,
  type CartInitOutcome,
} from "@/lib/draftInit";
import { canonicalPatch, DraftSync, type SaveState } from "@/lib/draftSync";
import { track } from "@/lib/analytics";
import { site } from "@/config/site";
import { CardPreview } from "@/components/card/CardPreview";
import { CreateFlowSkeleton } from "./CreateFlowSkeleton";
import { ResumeDraftPrompt } from "./ResumeDraftPrompt";
import { StepIndicator } from "./StepIndicator";
import { StepRecipient } from "./StepRecipient";
import { StepMessage } from "./StepMessage";
import { StepPersonalize, type UploadStatus } from "./StepPersonalize";
import { StepSign } from "./StepSign";
import { StepPlan } from "./StepPlan";
import { GhostButton, PrimaryButton } from "./ui";

type View = 1 | 2 | 3 | 4 | "plan";
/** `cart` já traz o que ficou no aparelho; `serverCart` é o que o servidor confirmou. */
type ResumeOutcome = Extract<CartInitOutcome, { kind: "resume" }> & {
  serverCart: Cart;
  recovered: boolean;
};

const IDLE_SAVE_STATE: SaveState = {
  status: "idle",
  retrying: false,
  errorMessage: null,
  savedLocally: true,
};

function createDraftSync(serverCart: Cart, session: CartSession): DraftSync {
  const { cartId, editToken } = session;
  return new DraftSync({
    initial: buildPatch(serverCart),
    baseUpdatedAt: serverCart.updatedAt,
    save: async (patch, clientUpdatedAt, { keepalive }) => {
      const { cart } = await patchCart(cartId, editToken, patch, { clientUpdatedAt, keepalive });
      return { updatedAt: cart.updatedAt };
    },
    load: async () => {
      const { cart } = await fetchCart(cartId, editToken, { timeoutMs: LOAD_TIMEOUT_MS });
      return {
        patch: buildPatch(cart),
        updatedAt: cart.updatedAt,
        editable: isEditableStatus(cart.status),
      };
    },
    journalSave: (patch) => saveUnsyncedChanges(cartId, patch),
    journalClear: (patch) => clearUnsyncedChanges(cartId, patch),
  });
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
  const [draftSync, setDraftSync] = useState<DraftSync | null>(null);
  /** Aviso para leitores de tela: só o que muda algo para a pessoa, nunca cada salvamento. */
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const [recoveredNotice, setRecoveredNotice] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [initError, setInitError] = useState(false);
  const [pendingResume, setPendingResume] = useState<ResumeOutcome | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [photoMigrationNotice, setPhotoMigrationNotice] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  const [uploads, setUploads] = useState<UploadStatus>({ inFlight: 0, failed: 0 });
  const [photosNotice, setPhotosNotice] = useState(false);

  const checkoutBusyRef = useRef(false);

  const subscribeToSave = useCallback(
    (listener: () => void) => draftSync?.subscribe(listener) ?? (() => {}),
    [draftSync],
  );
  const saveState = useSyncExternalStore(
    subscribeToSave,
    () => draftSync?.getState() ?? IDLE_SAVE_STATE,
    () => IDLE_SAVE_STATE,
  );

  /** Aplica um rascunho recém-criado: migra fotos legadas, se houver, e entra no editor. */
  const applyCreateOutcome = useCallback(
    async (outcome: Extract<CartInitOutcome, { kind: "create" }>) => {
      let finalCart = outcome.cart;
      if (outcome.legacyMedia.length > 0) {
        let anyFailed = false;
        for (const m of outcome.legacyMedia) {
          try {
            const blob = await dataUrlToBlob(m.url);
            const res = await uploadPhoto(outcome.session.cartId, outcome.session.editToken, blob);
            finalCart = res.cart;
          } catch {
            anyFailed = true;
          }
        }
        if (anyFailed) setPhotoMigrationNotice(true);
      }
      clearDraft(); // só remove o rascunho legado depois de confirmado no backend
      setDraftSync(createDraftSync(finalCart, outcome.session));
      setSession(outcome.session);
      setCart(finalCart);
      setRecoveredNotice(!!outcome.recovered);
      track("draft_created");
    },
    [],
  );

  // --- Inicialização: retoma sessão existente ou cria um rascunho novo ------
  const init = useCallback(async () => {
    setInitError(false);
    setPendingResume(null);
    try {
      const outcome = await getCartInit();
      if (outcome.kind === "resume") {
        // Retomar não é automático: quem decide é o usuário (ver ResumeDraftPrompt).
        // O que ficou no aparelho sem confirmação entra aqui: é o texto mais recente.
        const unsynced = loadUnsyncedChanges(outcome.cart.id);
        const merged = unsynced ? { ...outcome.cart, ...unsynced } : outcome.cart;
        const recovered =
          canonicalPatch(buildPatch(merged)) !== canonicalPatch(buildPatch(outcome.cart));
        // O envio de saída chegou ao servidor, só a resposta se perdeu: nada a recuperar.
        if (unsynced && !recovered) clearUnsyncedChanges(outcome.cart.id, unsynced);
        setPendingResume({ ...outcome, cart: merged, serverCart: outcome.cart, recovered });
        return;
      }
      await applyCreateOutcome(outcome);
    } catch {
      setInitError(true);
    }
  }, [applyCreateOutcome]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    init();
  }, [init]);

  function continueResumedDraft() {
    if (!pendingResume) return;
    setDraftSync(createDraftSync(pendingResume.serverCart, pendingResume.session));
    setSession(pendingResume.session);
    setCart(pendingResume.cart);
    setRecoveredNotice(pendingResume.recovered);
    setPendingResume(null);
    track("draft_resumed");
  }

  async function startFreshDraft() {
    if (!pendingResume || resumeBusy) return;
    setResumeBusy(true);
    // A carta abandonada não é apagada (fica órfã em DRAFT, igual a qualquer
    // rascunho nunca finalizado) — só deixamos de referenciá-la localmente.
    clearSession();
    clearDraft();
    try {
      const { cart: created, editToken } = await createDraft();
      const newSession: CartSession = { cartId: created.id, editToken };
      saveSession(newSession);
      setDraftSync(createDraftSync(created, newSession));
      setSession(newSession);
      setCart(created);
      setPendingResume(null);
      track("draft_created");
    } catch {
      setInitError(true);
    } finally {
      setResumeBusy(false);
    }
  }

  /** Fotos confirmadas por um upload: só a lista muda, o resto da carta fica. */
  const applyServerMedia = useCallback((media: CartMedia[]) => {
    setCart((prev) => (prev ? { ...prev, media } : prev));
  }, []);

  const update = useCallback((patch: Partial<Cart>) => {
    setCart((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // --- Autosave: toda mudança da carta vai para o DraftSync (ver lib/draftSync) --
  useEffect(() => {
    if (!cart || !draftSync) return;
    if (draftSync.setDesired(buildPatch(cart))) {
      saveDraft(cart); // cache local de recuperação (não é a fonte da verdade)
    }
  }, [cart, draftSync]);

  // Liga o DraftSync à tela e aos eventos da página. Ao sair, ele tenta enviar o
  // que falta; se não conseguir, o registro local devolve o texto na próxima visita.
  useEffect(() => {
    if (!draftSync) return;
    draftSync.open();
    // Quem usa leitor de tela ouve o erro pelo `role="alert"` e, depois, que passou.
    let hadError = false;
    const unsubscribe = draftSync.subscribe((next) => {
      if (next.status === "error") hadError = true;
      if (next.status === "saving") setSaveAnnouncement("");
      if (next.status === "saved" && hadError) {
        hadError = false;
        setSaveAnnouncement("Suas alterações foram salvas.");
      }
    });
    const sendBeforeLeaving = () => draftSync.flushNow({ keepalive: true });
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") sendBeforeLeaving();
      else draftSync.retryNow();
    };
    const onOnline = () => draftSync.retryNow();
    window.addEventListener("pagehide", sendBeforeLeaving);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", sendBeforeLeaving);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      draftSync.close();
    };
  }, [draftSync]);

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

  if (pendingResume) {
    return (
      <ResumeDraftPrompt
        cart={pendingResume.cart}
        onContinue={continueResumedDraft}
        onStartFresh={startFreshDraft}
        busy={resumeBusy}
      />
    );
  }

  if (!cart || !session || !draftSync) {
    return <CreateFlowSkeleton />;
  }

  const canAdvance = validateStep(view, cart);

  // Os avisos e os botões de uma foto pendente só existem na etapa de fotos. Sair
  // antes de resolvê-la levaria a pessoa a pagar achando que a foto foi incluída.
  const photosUnresolved = view === 3 && (uploads.inFlight > 0 || uploads.failed > 0);

  /** Devolve `true` se a saída da etapa foi impedida. */
  function blockedByPhotos() {
    setPhotosNotice(photosUnresolved);
    return photosUnresolved;
  }

  function goNext() {
    if (blockedByPhotos()) return;
    draftSync!.flushNow();
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
    if (blockedByPhotos()) return;
    draftSync!.flushNow();
    setCheckoutError(null);
    if (view === 2) setView(1);
    else if (view === 3) setView(2);
    else if (view === 4) setView(3);
    else if (view === "plan") setView(4);
  }

  /**
   * Só segue ao checkout com tudo confirmado pelo servidor: é de lá que ele lê
   * a carta e o plano. Sem confirmação, a pessoa fica aqui e pode tentar de novo.
   */
  async function goToCheckout() {
    if (!cart!.planType || checkoutBusyRef.current) return;
    checkoutBusyRef.current = true;
    setCheckoutBusy(true);
    setCheckoutError(null);
    const result = await draftSync!.flush();
    checkoutBusyRef.current = false;
    setCheckoutBusy(false);
    if (!result.ok) {
      setCheckoutError(
        `Não foi possível salvar sua cartinha, então ainda não seguimos para o pagamento. ${result.message} Toque no botão para tentar de novo.`,
      );
      return;
    }
    track("plan_selected", { plan: cart!.planType });
    router.push(`/checkout/${session!.cartId}`);
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-8 pb-[var(--preview-fab-reserve)] lg:grid-cols-[1fr_minmax(320px,420px)] lg:py-12">
      {/* Formulário */}
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-vinho">
            ← {site.name}
          </Link>
          <SaveIndicator state={saveState} />
        </div>

        <p role="status" data-save-announcer="true" className="sr-only">
          {saveAnnouncement}
        </p>

        {saveState.status === "error" && view !== "plan" && (
          <div role="alert" className="mb-4 rounded-lg bg-vinho/10 px-3 py-2 text-sm text-vinho">
            <p>
              Não foi possível salvar. {saveState.errorMessage}
              {saveState.savedLocally && " Seu texto continua guardado neste aparelho."}
            </p>
            <button
              type="button"
              className="mt-1 min-h-6 font-semibold underline"
              onClick={() => draftSync.retryNow()}
            >
              Tentar de novo
            </button>
          </div>
        )}

        {recoveredNotice && (
          <div role="status" className="mb-4 rounded-lg bg-dourado/15 px-3 py-2 text-sm text-grafite/80">
            Recuperamos as últimas alterações que ainda não tinham sido salvas.{" "}
            <button className="underline" onClick={() => setRecoveredNotice(false)}>
              Ok
            </button>
          </div>
        )}

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
              onMediaChanged={applyServerMedia}
              onUploadStatus={setUploads}
            />
          )}
          {view === 4 && (
            <StepSign cart={cart} update={update} goToStep={(n) => setView(n as View)} />
          )}
          {view === "plan" && (
            <StepPlan
              cart={cart}
              update={update}
              onContinue={goToCheckout}
              busy={checkoutBusy}
              error={checkoutError}
            />
          )}

          {photosNotice && photosUnresolved && (
            <p role="alert" className="mt-5 text-sm text-vinho">
              {uploads.inFlight > 0
                ? "Aguarde o envio das fotos terminar para continuar."
                : "Uma foto não foi enviada. Toque em “Tentar de novo” ou remova a foto para continuar."}
            </p>
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

      {/* Preview mobile (botão + drawer). O padding-bottom do container acima
          (`--preview-fab-reserve`) reserva a faixa que este botão ocupa, para
          ele nunca cobrir o CTA final. `bottom` usa o mesmo `--preview-fab-inset`
          que entra naquele cálculo. */}
      <button
        onClick={() => setShowMobilePreview(true)}
        className="fixed bottom-[var(--preview-fab-inset)] left-1/2 z-30 -translate-x-1/2 rounded-full bg-vinho px-6 py-3 text-sm font-semibold text-creme shadow-lg lg:hidden"
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

/** Visual apenas: o que leitores de tela precisam ouvir vem do aviso e do alerta. */
function SaveIndicator({ state }: { state: SaveState }) {
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return <span className="text-xs font-medium text-vinho">Não salvo</span>;
  }
  if (state.status === "saved") {
    return <span className="text-xs text-green-700">✓ Salvo</span>;
  }
  return (
    <span className="text-xs text-grafite/70">
      {state.retrying ? "Ainda não salvou. Tentando de novo…" : "Salvando…"}
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
