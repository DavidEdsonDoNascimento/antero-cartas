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
  withDefaultStyle,
  type CartInitOutcome,
} from "@/lib/draftInit";
import { canonicalPatch, DraftSync, type SaveState } from "@/lib/draftSync";
import { applyEditorPatch, finalizeDefaults, isAutoTitle, savePatch } from "@/lib/letterDefaults";
import { SHARE_PREVIEW_VERSION } from "@/lib/publicPreview";
import {
  getPreset,
  presetForLegacyTheme,
  resolveEffect,
  type EffectId,
  type PresentationId,
} from "@/content/presentation/presets";
import { track } from "@/lib/analytics";
import { site } from "@/config/site";
import { Scene } from "@/components/presentation/Scene";
import { Envelope } from "@/components/presentation/Envelope";
import { RecipientExperience } from "@/components/presentation/RecipientExperience";
import { CreateFlowSkeleton } from "./CreateFlowSkeleton";
import { CounterField, PhotosField, type UploadStatus } from "./StepPersonalize";
import { MusicPicker } from "./MusicPicker";
import { StepPlan } from "./StepPlan";
import { WriteStep } from "./WriteStep";
import { LetterPreview } from "./LetterPreview";
import { StylePicker } from "./StylePicker";
import { ExtraPanel } from "./ExtraPanel";
import {
  clearLastStep,
  goBackTo,
  loadLastStep,
  parseLocation,
  pushLocation,
  replaceLocation,
  saveLastStep,
  type EditorLocation,
  type Panel,
  type Step,
} from "./editorNav";
import { FieldLabel, PrimaryButton, TextField } from "./ui";

const IDLE_SAVE_STATE: SaveState = {
  status: "idle",
  retrying: false,
  errorMessage: null,
  savedLocally: true,
};

const STEP_LABELS: Record<Step, string> = { escrever: "Escrever", ver: "Ver", finalizar: "Finalizar" };

const PANEL_TITLES: Record<Panel, string> = {
  fotos: "Fotos",
  musica: "Música",
  tempo: "Tempo juntos",
  assinatura: "Título e assinatura",
};

const MESSAGE_REQUIRED = "Escreva sua mensagem para ver a carta.";
const MESSAGE_PENDING_PAYMENT =
  "Com o pagamento em andamento, a mensagem não pode ficar vazia. Enquanto estiver vazia, fica valendo o texto anterior.";

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

/** Momento válido para esta carta: sem mensagem, só dá para escrever. */
function validStep(step: Step | undefined, cart: Cart): Step {
  if (!step) return "escrever";
  return step !== "escrever" && !cart.message.trim() ? "escrever" : step;
}

/**
 * Editor 2.0: Escrever → Ver → Finalizar, tudo em `/criar`.
 *
 * O que NÃO mudou (e não pode mudar sem rever os testes de confiabilidade):
 * inicialização (`getCartInit`), autosave (`DraftSync`: um envio por vez,
 * versão + 409, diário local, `keepalive` ao sair), fotos (fila idempotente
 * dentro de `PhotosField`, que fica montado) e o checkout só depois de o
 * servidor confirmar tudo (`flush`).
 *
 * O que mudou: só a mensagem é obrigatória; título e tipo de destinatário têm
 * padrão (`lib/letterDefaults`); o rascunho é retomado sem tela intermediária;
 * o momento fica na URL (Voltar do aparelho volta um momento); o estilo é
 * escolhido com um toque e a prévia é a mesma folha da carta publicada.
 */
export function CreateFlow() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [session, setSession] = useState<CartSession | null>(null);
  const [loc, setLoc] = useState<EditorLocation>({ step: "escrever", panel: null });
  const [draftSync, setDraftSync] = useState<DraftSync | null>(null);
  /** Aviso para leitores de tela: só o que muda algo para a pessoa, nunca cada salvamento. */
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const [recoveredNotice, setRecoveredNotice] = useState(false);
  const [resumedNotice, setResumedNotice] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [initError, setInitError] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const [photoMigrationNotice, setPhotoMigrationNotice] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [showOpening, setShowOpening] = useState(false);

  const [uploads, setUploads] = useState<UploadStatus>({ inFlight: 0, failed: 0 });
  const [photosNotice, setPhotosNotice] = useState(false);

  const checkoutBusyRef = useRef(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  /** Última mensagem não vazia: com cobrança aberta, é ela que fica valendo. */
  const keepMessageRef = useRef<string | null>(null);
  const firstStepRender = useRef(true);

  const subscribeToSave = useCallback(
    (listener: () => void) => draftSync?.subscribe(listener) ?? (() => {}),
    [draftSync],
  );
  const saveState = useSyncExternalStore(
    subscribeToSave,
    () => draftSync?.getState() ?? IDLE_SAVE_STATE,
    () => IDLE_SAVE_STATE,
  );

  /** Entra no editor com a carta pronta: momento da URL ou o da última visita. */
  const enterEditor = useCallback((loaded: Cart, nextSession: CartSession, sync: DraftSync) => {
    setDraftSync(sync);
    setSession(nextSession);
    // Rascunho começado no editor antigo: ganha o estilo mais próximo do tema
    // que já tinha (só rascunhos; carta publicada nunca muda sozinha).
    const withStyle = loaded.presentation
      ? loaded
      : {
          ...loaded,
          presentation: presetForLegacyTheme(loaded.theme),
          theme: getPreset(presetForLegacyTheme(loaded.theme)).legacyTheme,
        };
    setCart(withStyle);
    const fromUrl = parseLocation(window.location.search);
    const step = validStep(fromUrl.step ?? loadLastStep(loaded.id) ?? undefined, withStyle);
    const next: EditorLocation = { step, panel: step === "ver" ? (fromUrl.panel ?? null) : null };
    replaceLocation(next);
    setLoc(next);
  }, []);

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
      enterEditor(finalCart, outcome.session, createDraftSync(finalCart, outcome.session));
      setRecoveredNotice(!!outcome.recovered);
      track("draft_created");
    },
    [enterEditor],
  );

  // --- Inicialização: retoma sessão existente ou cria um rascunho novo ------
  const init = useCallback(async () => {
    setInitError(false);
    try {
      const outcome = await getCartInit();
      if (outcome.kind === "resume") {
        // Retomada automática: o que ficou no aparelho sem confirmação entra
        // aqui (é o texto mais recente) e uma faixa discreta avisa.
        const unsynced = loadUnsyncedChanges(outcome.cart.id);
        const merged = unsynced ? { ...outcome.cart, ...unsynced } : outcome.cart;
        const recovered =
          canonicalPatch(buildPatch(merged)) !== canonicalPatch(buildPatch(outcome.cart));
        // O envio de saída chegou ao servidor, só a resposta se perdeu: nada a recuperar.
        if (unsynced && !recovered) clearUnsyncedChanges(outcome.cart.id, unsynced);
        keepMessageRef.current = outcome.cart.message.trim() ? outcome.cart.message : null;
        enterEditor(merged, outcome.session, createDraftSync(outcome.cart, outcome.session));
        setRecoveredNotice(recovered);
        setResumedNotice(true);
        track("draft_resumed");
        return;
      }
      await applyCreateOutcome(outcome);
    } catch {
      setInitError(true);
    }
  }, [applyCreateOutcome, enterEditor]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    init();
  }, [init]);

  /** "Começar outra": a carta atual não é apagada, só deixa de ser a deste aparelho. */
  async function startFreshDraft() {
    if (restartBusy || !draftSync) return;
    setRestartBusy(true);
    // Antes de soltar a carta atual, tenta deixar o que foi escrito salvo nela.
    await draftSync.flush().catch(() => undefined);
    clearSession();
    clearDraft();
    clearLastStep();
    try {
      const { cart: created, editToken } = await createDraft(withDefaultStyle());
      const newSession: CartSession = { cartId: created.id, editToken };
      saveSession(newSession);
      keepMessageRef.current = null;
      setResumedNotice(false);
      setRecoveredNotice(false);
      enterEditor(created, newSession, createDraftSync(created, newSession));
      replaceLocation({ step: "escrever", panel: null });
      setLoc({ step: "escrever", panel: null });
      track("draft_restarted");
    } catch {
      setInitError(true);
    } finally {
      setRestartBusy(false);
    }
  }

  /** Fotos confirmadas por um upload: só a lista muda, o resto da carta fica. */
  const applyServerMedia = useCallback((media: CartMedia[]) => {
    setCart((prev) => (prev ? { ...prev, media } : prev));
  }, []);

  const update = useCallback((patch: Partial<Cart>) => {
    setCart((prev) => (prev ? applyEditorPatch(prev, patch) : prev));
    if (patch.message !== undefined && patch.message.trim()) setMessageError(null);
  }, []);

  // --- Autosave: toda mudança da carta vai para o DraftSync (ver lib/draftSync) --
  useEffect(() => {
    if (!cart || !draftSync) return;
    if (cart.message.trim()) keepMessageRef.current = cart.message;
    if (draftSync.setDesired(savePatch(cart, keepMessageRef.current))) {
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

  // Voltar/avançar do navegador: a URL manda. Momento inválido volta a Escrever.
  const cartRef = useRef<Cart | null>(null);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
  const editorReady = cart !== null;
  useEffect(() => {
    if (!editorReady) return;
    function onPopState() {
      const current = cartRef.current;
      if (!current) return;
      const parsed = parseLocation(window.location.search);
      const step = validStep(parsed.step, current);
      const next = { step, panel: step === "ver" ? (parsed.panel ?? null) : null };
      if (step !== parsed.step) replaceLocation(next);
      setLoc(next);
      setShowOpening(false);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [editorReady]);

  // Lembra o momento (para a próxima visita) e leva o foco ao título dele.
  useEffect(() => {
    if (!cart) return;
    saveLastStep(cart.id, loc.step);
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    if (!loc.panel) stepHeadingRef.current?.focus();
    // `cart.id` basta: o foco só muda quando o momento muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.step, loc.panel, cart?.id]);

  // Finalizar mostra o aviso da prévia pública: a partir daqui, a carta segue a
  // regra nova (primeira foto e começo da mensagem podem aparecer em /presente/).
  useEffect(() => {
    if (cart && loc.step === "finalizar" && cart.sharePreviewVersion !== SHARE_PREVIEW_VERSION) {
      // Sincroniza a carta com o que a tela acabou de mostrar (uma vez só).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      update({ sharePreviewVersion: SHARE_PREVIEW_VERSION });
    }
  }, [cart, loc.step, update]);

  if (initError) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-base text-grafite/75">
          Não foi possível iniciar sua cartinha agora. Verifique sua conexão e tente novamente.
        </p>
        <div className="mt-4">
          <PrimaryButton onClick={init}>Tentar novamente</PrimaryButton>
        </div>
      </div>
    );
  }

  if (!cart || !session || !draftSync) {
    return <CreateFlowSkeleton />;
  }

  const preset = getPreset(cart.presentation);
  const photosUnresolved = uploads.inFlight > 0 || uploads.failed > 0;
  const pendingPaymentEmpty = cart.status === "AWAITING_PAYMENT" && !cart.message.trim();
  const shownMessageError = pendingPaymentEmpty ? MESSAGE_PENDING_PAYMENT : messageError;

  function go(step: Step, panel: Panel | null = null) {
    const next = { step, panel };
    pushLocation(next);
    setLoc(next);
  }

  /** A tela muda na hora; o histórico acompanha (o `popstate` que vier depois confirma o mesmo lugar). */
  function back(to: EditorLocation) {
    setLoc(to);
    goBackTo(to);
  }

  function requireMessage(): boolean {
    if (cart!.message.trim()) return true;
    setMessageError(MESSAGE_REQUIRED);
    if (loc.step !== "escrever") go("escrever");
    window.setTimeout(() => messageRef.current?.focus(), 0);
    return false;
  }

  /** Foto pendente ou com falha não segue em silêncio: explica e abre as fotos. */
  function blockedByPhotos(): boolean {
    setPhotosNotice(photosUnresolved);
    return photosUnresolved;
  }

  function toView() {
    if (!requireMessage()) return;
    draftSync!.flushNow();
    track("message_completed");
    go("ver");
  }

  function toFinish() {
    if (!requireMessage() || blockedByPhotos()) return;
    draftSync!.flushNow();
    track("personalization_completed", { photos: cart!.media.length });
    track("checkout_started");
    go("finalizar");
  }

  function openPanel(panel: Panel) {
    go("ver", panel);
  }

  function closePanel() {
    if (loc.panel) back({ step: "ver", panel: null });
  }

  function selectStyle(id: PresentationId) {
    if (id === cart!.presentation) return; // tocar de novo no mesmo estilo não muda nada
    const next = getPreset(id);
    update({
      presentation: id,
      theme: next.legacyTheme,
      presentationOptions: { v: 1, effect: next.effects.default },
    });
    track("style_selected", { style: id });
  }

  function selectEffect(effect: EffectId) {
    update({ presentationOptions: { v: 1, effect } });
  }

  /**
   * Só segue ao checkout com tudo confirmado pelo servidor: é de lá que ele lê
   * a carta e o plano. Sem confirmação, a pessoa fica aqui e pode tentar de novo.
   */
  async function goToCheckout() {
    if (!cart!.planType || checkoutBusyRef.current) return;
    if (!requireMessage() || blockedByPhotos()) return;
    checkoutBusyRef.current = true;
    setCheckoutBusy(true);
    setCheckoutError(null);
    // Padrões que o servidor exige (título, tipo de destinatário) entram no
    // MESMO envio que o flush confirma — não num salvamento posterior.
    const finalCart = {
      ...cart!,
      ...finalizeDefaults(cart!),
      sharePreviewVersion: SHARE_PREVIEW_VERSION,
    };
    draftSync!.setDesired(savePatch(finalCart, keepMessageRef.current));
    setCart(finalCart);
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

  const recipient = cart.recipientName.trim();
  const musicSummary = cart.music ? (cart.music.title ?? "Escolhida") : "Nenhuma";
  const photosSummary = cart.media.length
    ? `${cart.media.length} foto${cart.media.length > 1 ? "s" : ""}`
    : "Nenhuma";
  const titleSummary = isAutoTitle(cart.title, cart.recipientName) ? "Automático" : "Personalizado";

  const stepHeading = (text: string) => (
    <h1
      ref={stepHeadingRef}
      tabIndex={-1}
      className="font-serif text-[1.75rem] font-semibold leading-tight text-vinho outline-none sm:text-3xl"
    >
      {text}
    </h1>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 pb-32 lg:pb-16">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="min-h-11 py-2 text-base font-semibold text-vinho">
          ← {site.name}
        </Link>
        <SaveIndicator state={saveState} />
      </header>

      <nav aria-label="Etapas da cartinha" className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px] font-semibold sm:gap-2 sm:text-sm">
          {(Object.keys(STEP_LABELS) as Step[]).map((s, i) => {
            const current = s === loc.step;
            return (
              <li key={s} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden="true" className="h-px w-3 bg-rosa/60 sm:w-8" />}
                <span
                  aria-current={current ? "step" : undefined}
                  className={`whitespace-nowrap rounded-full px-2.5 py-1.5 sm:px-3 ${current ? "bg-vinho text-creme" : "bg-white/70 text-grafite/75"}`}
                >
                  {i + 1}. {STEP_LABELS[s]}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <p role="status" data-save-announcer="true" className="sr-only">
        {saveAnnouncement}
      </p>

      {resumedNotice && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/80 px-4 py-3 text-base text-grafite/85 shadow-sm">
          <span>
            Continuando sua cartinha{recipient ? ` para ${recipient}` : ""}.
          </span>
          <span className="flex items-center gap-3">
            <button
              type="button"
              onClick={startFreshDraft}
              disabled={restartBusy}
              className="min-h-11 font-semibold text-vinho underline disabled:opacity-50"
            >
              {restartBusy ? "Criando…" : "Começar outra"}
            </button>
            <button
              type="button"
              onClick={() => setResumedNotice(false)}
              aria-label="Fechar aviso"
              className="flex h-11 w-11 items-center justify-center rounded-full text-grafite/60 hover:bg-rosa-soft"
            >
              ✕
            </button>
          </span>
        </div>
      )}

      {saveState.status === "error" && loc.step !== "finalizar" && (
        <div role="alert" className="mb-4 rounded-2xl bg-vinho/10 px-4 py-3 text-base text-vinho">
          <p>
            Não foi possível salvar. {saveState.errorMessage}
            {saveState.savedLocally && " Seu texto continua guardado neste aparelho."}
          </p>
          <button
            type="button"
            className="mt-1 min-h-11 font-semibold underline"
            onClick={() => draftSync.retryNow()}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {recoveredNotice && (
        <div role="status" className="mb-4 rounded-2xl bg-dourado/15 px-4 py-3 text-base text-grafite/85">
          Recuperamos as últimas alterações que ainda não tinham sido salvas.{" "}
          <button className="min-h-11 font-semibold underline" onClick={() => setRecoveredNotice(false)}>
            Ok
          </button>
        </div>
      )}

      {photoMigrationNotice && (
        <div className="mb-4 rounded-2xl bg-dourado/15 px-4 py-3 text-sm text-grafite/80">
          Recuperamos o texto da sua cartinha anterior, mas algumas fotos precisam ser selecionadas novamente.{" "}
          <button className="min-h-11 underline" onClick={() => setPhotoMigrationNotice(false)}>
            Ok
          </button>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,460px)] lg:gap-10">
        {/* Coluna da edição */}
        <div className="min-w-0">
          {loc.step === "escrever" && (
            <section aria-label="Escrever">
              {pendingPaymentEmpty && (
                <p className="mb-5 rounded-2xl bg-vinho/10 px-4 py-3 text-base text-vinho">
                  {MESSAGE_PENDING_PAYMENT}
                </p>
              )}
              <WriteStep cart={cart} update={update} messageError={shownMessageError} messageRef={messageRef} />
              <StickyAction>
                <PrimaryButtonLarge onClick={toView}>Ver minha carta</PrimaryButtonLarge>
              </StickyAction>
            </section>
          )}

          {loc.step === "ver" && (
            <section aria-label="Ver" className="space-y-7">
              <div>
                {stepHeading("Veja como ficou")}
                <p className="mt-2 text-base text-grafite/70">
                  Já está pronta. Se quiser, deixe ainda mais especial.
                </p>
              </div>

              <StylePicker
                presentation={preset.id}
                options={cart.presentationOptions}
                onSelect={selectStyle}
                onEffect={selectEffect}
              />

              <div>
                <h2 className="text-base font-semibold text-grafite">Deixar mais especial</h2>
                <p className="mt-0.5 text-sm text-grafite/65">Tudo opcional.</p>
                <ul className="mt-3 divide-y divide-rosa/25 overflow-hidden rounded-2xl bg-white/80 shadow-sm">
                  <ExtraRow label="Fotos" value={photosSummary} onClick={() => openPanel("fotos")} />
                  <ExtraRow label="Música" value={musicSummary} onClick={() => openPanel("musica")} />
                  <ExtraRow
                    label="Tempo juntos"
                    value={cart.showRelationshipCounter ? "Ligado" : "Desligado"}
                    onClick={() => openPanel("tempo")}
                  />
                  <ExtraRow label="Título e assinatura" value={titleSummary} onClick={() => openPanel("assinatura")} />
                </ul>
              </div>

              {photosNotice && photosUnresolved && (
                <div role="alert" className="rounded-2xl bg-vinho/10 px-4 py-3 text-base text-vinho">
                  {uploads.inFlight > 0
                    ? "Aguarde o envio das fotos terminar para continuar."
                    : "Uma foto não foi enviada. Toque em “Tentar de novo” ou remova a foto para continuar."}{" "}
                  <button type="button" className="min-h-11 font-semibold underline" onClick={() => openPanel("fotos")}>
                    Ver fotos
                  </button>
                </div>
              )}

              <StickyAction>
                <PrimaryButtonLarge onClick={toFinish}>Está pronta · Finalizar</PrimaryButtonLarge>
              </StickyAction>
              <button
                type="button"
                onClick={() => back({ step: "escrever", panel: null })}
                className="min-h-11 text-base font-semibold text-grafite/70 hover:text-vinho"
              >
                ← Editar texto
              </button>
            </section>
          )}

          {loc.step === "finalizar" && (
            <section aria-label="Finalizar">
              <div className="mb-5">{stepHeading("Finalizar")}</div>
              {photosNotice && photosUnresolved && (
                <p role="alert" className="mb-4 rounded-2xl bg-vinho/10 px-4 py-3 text-base text-vinho">
                  {uploads.inFlight > 0
                    ? "Aguarde o envio das fotos terminar para continuar."
                    : "Uma foto não foi enviada. Toque em “Tentar de novo” ou remova a foto para continuar."}
                </p>
              )}
              <div className="rounded-3xl bg-white/80 p-5 shadow-sm sm:p-7">
                <StepPlan
                  cart={cart}
                  update={update}
                  onContinue={goToCheckout}
                  busy={checkoutBusy}
                  error={checkoutError}
                  notice={
                    <p className="mt-5 rounded-2xl bg-rosa-soft/60 px-4 py-3 text-sm leading-relaxed text-grafite/85">
                      Se quem receber compartilhar a surpresa, outras pessoas poderão ver a primeira foto e um
                      pequeno trecho da mensagem. O resto da carta fica só no link de quem recebe.
                    </p>
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => back({ step: "ver", panel: null })}
                className="mt-4 min-h-11 text-base font-semibold text-grafite/70 hover:text-vinho"
              >
                ← Voltar
              </button>
            </section>
          )}
        </div>

        {/* Prévia: sempre ao lado no desktop; no celular, só no momento Ver (em cima). */}
        <aside
          aria-label="Prévia da cartinha"
          className={`${loc.step === "ver" ? "order-first lg:order-none" : "hidden lg:block"} min-w-0`}
        >
          <div className="lg:sticky lg:top-6">
            <LetterPreview cart={cart} />
            <button
              type="button"
              onClick={() => (cart.message.trim() ? setShowOpening(true) : requireMessage())}
              className="mt-3 min-h-12 w-full rounded-full border-2 border-vinho/30 bg-white/80 px-5 text-base font-semibold text-vinho transition hover:border-vinho"
            >
              ▶ Ver como {recipient ? `${recipient} vai` : "vai"} abrir
            </button>
          </div>
        </aside>
      </div>

      {/* Painéis: sempre montados (a fila de fotos vive no PhotosField). */}
      <ExtraPanel open={loc.panel === "fotos"} title={PANEL_TITLES.fotos} onClose={closePanel}>
        <p className="mb-4 rounded-xl bg-rosa-soft/60 px-3 py-2 text-sm text-grafite/85">
          A primeira foto poderá aparecer no compartilhamento da cartinha.
        </p>
        <PhotosField cart={cart} session={session} onMediaChanged={applyServerMedia} onUploadStatus={setUploads} />
      </ExtraPanel>
      <ExtraPanel open={loc.panel === "musica"} title={PANEL_TITLES.musica} onClose={closePanel}>
        <MusicPicker cart={cart} update={update} />
      </ExtraPanel>
      <ExtraPanel open={loc.panel === "tempo"} title={PANEL_TITLES.tempo} onClose={closePanel}>
        <CounterField cart={cart} update={update} />
      </ExtraPanel>
      <ExtraPanel open={loc.panel === "assinatura"} title={PANEL_TITLES.assinatura} onClose={closePanel}>
        <div className="space-y-6">
          <div>
            <FieldLabel hint="opcional">Título da cartinha</FieldLabel>
            <TextField
              value={cart.title}
              onChange={(v) => update({ title: v })}
              placeholder={recipient ? `Para ${recipient}` : "Uma cartinha para você"}
              maxLength={80}
              ariaLabel="Título da cartinha"
            />
            <p className="mt-1 text-sm text-grafite/65">Se ficar vazio, usamos “{recipient ? `Para ${recipient}` : "Uma cartinha para você"}”.</p>
          </div>
          <div>
            <FieldLabel hint="opcional">Seu nome</FieldLabel>
            <TextField
              value={cart.senderName}
              onChange={(v) => update({ senderName: v })}
              placeholder="Como você quer assinar?"
              maxLength={40}
              ariaLabel="Nome de quem envia"
            />
          </div>
          <div>
            <FieldLabel hint="opcional">Frase de assinatura</FieldLabel>
            <TextField
              value={cart.signature}
              onChange={(v) => update({ signature: v })}
              placeholder="Ex.: Com amor, para sempre"
              maxLength={60}
              ariaLabel="Frase de assinatura"
            />
          </div>
        </div>
      </ExtraPanel>

      {showOpening && (
        <OpeningPreview cart={cart} onClose={() => setShowOpening(false)} />
      )}
    </div>
  );
}

/** "Ver como vai abrir": a experiência real de `/c/`, em tela cheia, sem música nem compartilhar. */
function OpeningPreview({ cart, onClose }: { cart: Cart; onClose: () => void }) {
  const preset = getPreset(cart.presentation);
  const recipient = cart.recipientName.trim();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Prévia da abertura">
      <RecipientExperience
        letter={{ ...cart, title: cart.title.trim() || (recipient ? `Para ${recipient}` : "Uma cartinha para você") }}
        preset={preset}
        effect={resolveEffect(preset, cart.presentationOptions)}
        scene={<Scene style={preset.id} uid="op" fixed />}
        envelope={<Envelope palette={preset.envelope} uid="op-env" label={recipient ? `Para ${recipient}` : "Para você"} />}
        preview
        onClose={onClose}
      />
    </div>
  );
}

function ExtraRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-rosa-soft/40"
      >
        <span className="text-base font-semibold text-grafite">{label}</span>
        <span className="flex min-w-0 items-center gap-2 text-sm text-grafite/65">
          <span className="truncate">{value}</span>
          <span aria-hidden="true">›</span>
        </span>
      </button>
    </li>
  );
}

/** No celular, a ação principal fica presa ao rodapé (acima da área segura); no desktop, no fluxo. */
function StickyAction({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rosa/25 bg-creme/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:p-0">
      <div className="mx-auto max-w-xl lg:mx-0">{children}</div>
    </div>
  );
}

function PrimaryButtonLarge({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-14 w-full rounded-full bg-vinho px-7 text-lg font-semibold text-creme shadow-md transition hover:bg-vinho-deep lg:w-auto"
    >
      {children}
    </button>
  );
}

/** Visual apenas: o que leitores de tela precisam ouvir vem do aviso e do alerta. */
function SaveIndicator({ state }: { state: SaveState }) {
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return <span className="text-sm font-medium text-vinho">Não salvo</span>;
  }
  if (state.status === "saved") {
    return <span className="text-sm text-green-800">✓ Salvo</span>;
  }
  return (
    <span className="text-sm text-grafite/75">
      {state.retrying ? "Ainda não salvou. Tentando de novo…" : "Salvando…"}
    </span>
  );
}
