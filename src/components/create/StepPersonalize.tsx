"use client";

import { useEffect, useRef, useState } from "react";
import type { Cart, CartMedia, ThemeId } from "@/lib/types";
import { themes } from "@/content/themes";
import {
  MAX_CART_PHOTOS,
  createPhotoReader,
  preparePhotoForUpload,
  type PhotoReader,
  type PreparedPhoto,
} from "@/lib/image";
import {
  uploadPhoto,
  removePhoto,
  reorderPhotos,
  updatePhotoFraming,
  ApiClientError,
} from "@/lib/api";
import {
  classifyUploadError,
  reportCompressionFallback,
  reportUploadFailure,
  type UploadFailure,
} from "@/lib/uploadDiagnostics";
import { framingStyle, type PhotoFraming } from "@/lib/photoFraming";
import type { CartSession } from "@/lib/cartSession";
import { track } from "@/lib/analytics";
import { MusicPicker } from "./MusicPicker";
import { PhotoFramingDialog } from "./PhotoFramingDialog";
import { FieldLabel, StepHeader, Toggle } from "./ui";

interface Props {
  cart: Cart;
  update: (patch: Partial<Cart>) => void;
  session: CartSession;
  onCartUpdated: (cart: Cart) => void;
  /**
   * Fotos confirmadas pelo servidor após um envio. Só a lista de fotos — não
   * a carta inteira: a resposta de um upload que levou 40 s não pode desfazer
   * o tema ou a data escolhidos enquanto isso. Continua valendo depois que a
   * etapa desmonta (o envio em andamento termina e a foto não se perde).
   */
  onMediaChanged: (media: CartMedia[]) => void;
}

export function StepPersonalize({ cart, update, session, onCartUpdated, onMediaChanged }: Props) {
  return (
    <div>
      <StepHeader
        title="Personalize a cartinha"
        subtitle="Tudo opcional — adicione o que quiser e siga em frente quando estiver pronto."
      />
      <div className="space-y-7">
        <PhotosField
          cart={cart}
          session={session}
          onCartUpdated={onCartUpdated}
          onMediaChanged={onMediaChanged}
        />
        <CounterField cart={cart} update={update} />
        <MusicPicker cart={cart} update={update} />
        <ThemeField cart={cart} update={update} />
      </div>
    </div>
  );
}

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

function uploadErrorMessage(failure: UploadFailure, err: unknown): string {
  switch (failure.stage) {
    case "validation":
      return (err as Error).message;
    case "api":
      return failure.retryable
        ? "O servidor não conseguiu salvar a foto agora. Toque em “Tentar de novo”."
        : (err as Error).message;
    case "timeout":
      return failure.detail === "read"
        ? "A foto está demorando para abrir no aparelho. Toque em “Tentar de novo” — ela continua carregando."
        : "O envio da foto demorou demais. Verifique a conexão e toque em “Tentar de novo”.";
    case "read":
      return "Não foi possível ler esta foto no aparelho. Toque em “Tentar de novo” ou selecione-a outra vez.";
    case "network":
      return "Não foi possível enviar a foto. Verifique a conexão e toque em “Tentar de novo”.";
    default:
      return "Não foi possível enviar a foto. Toque em “Tentar de novo” ou escolha outra.";
  }
}

/**
 * Ciclo de uma foto ainda não confirmada pelo servidor:
 * na fila → preparando (ler + comprimir) → enviando → (vira item de
 * cart.media) ou falhou. A prévia local NUNCA significa "enviada": só a
 * resposta do servidor tira a foto daqui e a coloca em cart.media.
 */
type PendingStatus = "queued" | "processing" | "uploading" | "error";

const STATUS_LABEL: Record<PendingStatus, string> = {
  queued: "Na fila",
  processing: "Preparando…",
  uploading: "Enviando…",
  error: "Falhou",
};

/** O que a tela mostra de uma foto pendente. */
interface PendingPhoto {
  /** Também é o `uploadId` que torna o envio idempotente no servidor. */
  id: string;
  previewUrl: string;
  status: PendingStatus;
  /** Em "Falhou": vale oferecer "Tentar de novo"? (recusas definitivas, não) */
  retryable: boolean;
  previewBroken?: boolean;
}

/**
 * O que a tela não mostra: o arquivo, a leitura (reaproveitada entre
 * tentativas) e a foto já comprimida — o "Tentar de novo" de uma falha de
 * rede reenvia exatamente os mesmos bytes, sem reprocessar.
 */
interface UploadJob {
  file: File;
  reader: PhotoReader;
  prepared: PreparedPhoto | null;
  /** Incrementa a cada tentativa; resultado de tentativa antiga é ignorado. */
  attempt: number;
  status: PendingStatus;
}

function PhotosField({
  cart,
  session,
  onCartUpdated,
  onMediaChanged,
}: Pick<Props, "cart" | "session" | "onCartUpdated" | "onMediaChanged">) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  /** Remoção de uma foto já enviada em andamento. */
  const [removing, setRemoving] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  /** Id da foto cujo enquadramento está sendo ajustado (null = diálogo fechado). */
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  /**
   * Fonte da verdade de "esta tentativa ainda vale?". Remover a foto tira o
   * job daqui; tentar de novo troca o `attempt`. Toda continuação assíncrona
   * confere isso antes de mexer na tela.
   */
  const jobsRef = useRef(new Map<string, UploadJob>());
  /**
   * Envios em série: a posição no servidor segue a ordem de seleção e uma
   * resposta nunca atropela a outra. Cada item da fila trata os próprios
   * erros, então a corrente nunca quebra.
   */
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef<PendingPhoto[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Ao sair da etapa: libera as prévias. Envios já na fila terminam sozinhos
  // e entregam a foto via `onMediaChanged` — sair da etapa não perde foto.
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  const uploading = pending.some((p) => p.status !== "error");
  /** Reordenar/remover/ajustar fotos enviadas espera os envios terminarem. */
  const busy = removing || uploading;

  function patchPending(id: string, patch: Partial<PendingPhoto>) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function setJobStatus(id: string, job: UploadJob, status: PendingStatus, retryable = true) {
    job.status = status;
    patchPending(id, { status, retryable });
  }

  /** Tira a foto pendente da tela e cancela o que ainda não começou. */
  function forgetPending(id: string) {
    jobsRef.current.delete(id);
    const photo = pendingRef.current.find((p) => p.id === id);
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  /** "✕"/"Remover" numa foto pendente; a mensagem de erro sai junto com a última falha. */
  function discardPending(id: string) {
    if (!pendingRef.current.some((p) => p.id !== id && p.status === "error")) setError(null);
    forgetPending(id);
  }

  function enqueue(id: string, attempt: number) {
    queueRef.current = queueRef.current.then(() => runUpload(id, attempt)).catch(() => {});
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    setError(null);

    const remaining = MAX_CART_PHOTOS - cart.media.length - pending.length;
    const chosen = Array.from(files).slice(0, Math.max(0, remaining));
    if (files.length > chosen.length) {
      setError(`Você pode adicionar no máximo ${MAX_CART_PHOTOS} fotos.`);
    }
    // Os `File` já estão em mãos; limpar agora permite escolher a mesma foto
    // de novo e não invalida as referências.
    if (inputRef.current) inputRef.current.value = "";
    if (chosen.length === 0) return;

    // Prévia otimista imediata — aparece antes de ler, comprimir ou enviar.
    const entries: PendingPhoto[] = chosen.map((file) => {
      const id = crypto.randomUUID();
      const reader = createPhotoReader(file);
      // Lê já, enquanto o Android ainda garante o acesso ao arquivo recém-
      // escolhido — não quando chegar a vez desta foto na fila.
      reader.prefetch();
      jobsRef.current.set(id, { file, reader, prepared: null, attempt: 1, status: "queued" });
      return { id, previewUrl: URL.createObjectURL(file), status: "queued", retryable: true };
    });
    setPending((prev) => [...prev, ...entries]);
    for (const entry of entries) enqueue(entry.id, 1);
  }

  /** Lê, prepara e envia uma foto. Não lança: falhas viram "Falhou" na tela. */
  async function runUpload(id: string, attempt: number) {
    const job = jobsRef.current.get(id);
    if (!job || job.attempt !== attempt) return; // removida enquanto esperava
    const isCurrent = () => jobsRef.current.get(id) === job && job.attempt === attempt;
    const ctx = { attempt, mime: job.file.type, sizeBytes: job.file.size, original: false };

    try {
      if (!job.prepared) {
        setJobStatus(id, job, "processing");
        const source = await job.reader.read();
        if (!isCurrent()) return;
        const prepared = await preparePhotoForUpload(source);
        if (prepared.original) reportCompressionFallback(prepared.fallbackError, ctx);
        if (!isCurrent()) return;
        job.prepared = prepared;
      }
      const photo = job.prepared;
      ctx.original = photo.original;
      ctx.sizeBytes = photo.blob.size;

      setJobStatus(id, job, "uploading");
      const dims =
        photo.width && photo.height ? { width: photo.width, height: photo.height } : undefined;
      const res = await uploadPhoto(session.cartId, session.editToken, photo.blob, dims, id);

      if (!isCurrent()) {
        // Removida enquanto subia: o servidor já gravou. Apaga lá também, em
        // vez de a foto reaparecer na próxima resposta.
        await deleteOrphan(id, res.cart.media);
        return;
      }
      // A foto real chegou em cart.media — some a prévia na mesma renderização.
      onMediaChanged(res.cart.media);
      track("photo_uploaded", { count: res.cart.media.length });
      forgetPending(id);
      settleConfirmedFailures(res.cart.media);
    } catch (err) {
      if (!isCurrent()) return;
      const failure = classifyUploadError(err);
      reportUploadFailure(failure, ctx);
      // A foto continua na tela, com "Tentar de novo" e "Remover".
      setJobStatus(id, job, "error", failure.retryable);
      setError(uploadErrorMessage(failure, err));
    }
  }

  /**
   * Uma foto marcada "Falhou" pode ter sido gravada mesmo assim (a resposta
   * se perdeu na rede). Se a lista do servidor já a traz — pelo `uploadId` na
   * chave —, ela foi enviada: tira a prévia em vez de mostrar a mesma foto
   * duas vezes, uma delas como falha.
   */
  function settleConfirmedFailures(media: CartMedia[]) {
    for (const [pendingId, job] of jobsRef.current) {
      if (job.status !== "error") continue;
      if (media.some((m) => m.storageKey?.includes(`/${pendingId}_`))) discardPending(pendingId);
    }
  }

  async function deleteOrphan(uploadId: string, media: CartMedia[]) {
    const orphan = media.find((m) => m.storageKey?.includes(`/${uploadId}_`));
    try {
      if (!orphan) {
        onMediaChanged(media);
        return;
      }
      const res = await removePhoto(session.cartId, session.editToken, orphan.id);
      onMediaChanged(res.cart.media);
    } catch (err) {
      // Se não deu para apagar, mostra a foto: o usuário remove de novo, e
      // ela não fica escondida no servidor aparecendo depois.
      console.warn("[upload] não foi possível remover a foto descartada", classifyUploadError(err));
      onMediaChanged(media);
    }
  }

  function retryUpload(id: string) {
    const job = jobsRef.current.get(id);
    // Só a partir de "Falhou": um duplo toque não dispara dois envios.
    if (!job || job.status !== "error") return;
    setError(null);
    job.attempt += 1;
    setJobStatus(id, job, "queued");
    enqueue(id, job.attempt);
  }

  async function remove(id: string) {
    setError(null);
    setRemoving(true);
    try {
      const res = await removePhoto(session.cartId, session.editToken, id);
      onCartUpdated(res.cart);
      track("photo_removed", { count: res.cart.media.length });
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível remover a foto."));
    } finally {
      setRemoving(false);
    }
  }

  async function persistOrder(nextIds: string[]) {
    const previous = cart.media;
    const optimistic = nextIds
      .map((id, i) => {
        const m = previous.find((p) => p.id === id);
        return m ? { ...m, position: i } : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    onCartUpdated({ ...cart, media: optimistic });

    try {
      const res = await reorderPhotos(session.cartId, session.editToken, nextIds);
      onCartUpdated(res.cart);
    } catch (err) {
      onCartUpdated({ ...cart, media: previous }); // rollback
      setError(apiErrorMessage(err, "Não foi possível reordenar as fotos."));
    }
  }

  /**
   * Salva o enquadramento. Aplica na hora (a prévia precisa reagir ao clique,
   * não à latência da rede) e desfaz se o servidor recusar — mesmo padrão de
   * `persistOrder`. O ajuste vai preso ao id da foto, então reordenar ou
   * trocar a capa depois não o desloca para outra imagem.
   */
  async function saveFraming(mediaId: string, framing: PhotoFraming | null) {
    setError(null);
    setAdjustingId(null);
    const previous = cart.media;
    onCartUpdated({
      ...cart,
      media: previous.map((m) => (m.id === mediaId ? { ...m, framing } : m)),
    });
    try {
      const res = await updatePhotoFraming(session.cartId, session.editToken, mediaId, framing);
      onCartUpdated(res.cart);
      track("photo_framing_adjusted", { reset: framing ? "no" : "yes" });
    } catch (err) {
      onCartUpdated({ ...cart, media: previous }); // rollback
      setError(apiErrorMessage(err, "Não foi possível salvar o ajuste da foto."));
    }
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= cart.media.length) return;
    const ids = cart.media.map((m) => m.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    persistOrder(ids);
  }

  function makeCover(id: string) {
    const ids = cart.media.map((m) => m.id).filter((i) => i !== id);
    persistOrder([id, ...ids]);
  }

  const totalCount = cart.media.length + pending.length;
  // Busca por id, nunca por índice: uma remoção ou reordenação enquanto o
  // diálogo está aberto não pode fazê-lo passar a editar outra foto.
  const adjustingPhoto = cart.media.find((m) => m.id === adjustingId) ?? null;

  return (
    <div>
      <FieldLabel hint="opcional">Fotos (até {MAX_CART_PHOTOS})</FieldLabel>
      <div className="space-y-3">
        {(cart.media.length > 0 || pending.length > 0) && (
          <div className="flex flex-wrap gap-3">
            {cart.media.map((m, i) => (
              <div key={m.id} className="w-24">
                <div className="relative">
                  {/* A miniatura usa o MESMO `framingStyle` da carta — o que o
                      cliente vê aqui é o recorte que vai para a cartinha. */}
                  <div className="h-24 w-24 overflow-hidden rounded-lg shadow">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt={`Foto ${i + 1}`}
                      className="h-full w-full"
                      style={framingStyle(m.framing)}
                    />
                  </div>
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-vinho/90 px-1.5 py-0.5 text-[10px] font-semibold text-creme">
                      ★ Capa
                    </span>
                  )}
                  <button
                    onClick={() => remove(m.id)}
                    disabled={busy}
                    aria-label={`Remover foto ${i + 1}`}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-grafite text-xs text-white shadow disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={busy || i === 0}
                    aria-label={`Mover foto ${i + 1} para a esquerda`}
                    className="rounded px-1.5 text-sm text-grafite/60 disabled:opacity-30"
                  >
                    ←
                  </button>
                  {i !== 0 && (
                    <button
                      onClick={() => makeCover(m.id)}
                      disabled={busy}
                      aria-label={`Definir foto ${i + 1} como capa`}
                      className="rounded px-1.5 text-[11px] font-medium text-dourado hover:underline disabled:opacity-50"
                    >
                      capa
                    </button>
                  )}
                  <button
                    onClick={() => move(i, 1)}
                    disabled={busy || i === cart.media.length - 1}
                    aria-label={`Mover foto ${i + 1} para a direita`}
                    className="rounded px-1.5 text-sm text-grafite/60 disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setAdjustingId(m.id)}
                  disabled={busy}
                  aria-label={`Ajustar enquadramento da foto ${i + 1}`}
                  className="mt-1 w-full rounded-md border border-rosa/40 bg-white px-1 py-1 text-[11px] font-medium text-vinho transition hover:border-vinho/50 hover:bg-rosa-soft/30 disabled:opacity-50"
                >
                  Ajustar foto
                </button>
              </div>
            ))}

            {pending.map((p) => (
              <div key={p.id} className="w-24" data-pending-status={p.status}>
                <div className="relative">
                  {p.previewBroken ? (
                    // A prévia é só local: não abrir aqui não impede o envio.
                    <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-rosa-soft/40 text-2xl shadow">
                      🖼️
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.previewUrl}
                      alt={`Foto ${STATUS_LABEL[p.status].toLowerCase()}`}
                      onError={() => patchPending(p.id, { previewBroken: true })}
                      className={`h-24 w-24 rounded-lg object-cover shadow ${
                        p.status === "error" ? "opacity-70" : "opacity-60"
                      }`}
                    />
                  )}
                  {p.status !== "error" && (
                    <span aria-hidden className="absolute inset-0 flex items-center justify-center">
                      <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </span>
                  )}
                  <span
                    role="status"
                    className={`absolute inset-x-0 bottom-0 rounded-b-lg px-1 py-0.5 text-center text-[10px] font-medium ${
                      p.status === "error" ? "bg-vinho/85 text-creme" : "bg-grafite/60 text-white"
                    }`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                  <button
                    onClick={() => discardPending(p.id)}
                    aria-label="Remover esta foto"
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-grafite text-xs text-white shadow"
                  >
                    ✕
                  </button>
                </div>
                {p.status === "error" && (
                  <div className="mt-1 space-y-1">
                    {p.retryable && (
                      <button
                        type="button"
                        onClick={() => retryUpload(p.id)}
                        className="w-full rounded-md border border-rosa/40 bg-white px-1 py-1 text-[11px] font-medium text-vinho transition hover:border-vinho/50 hover:bg-rosa-soft/30"
                      >
                        Tentar de novo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => discardPending(p.id)}
                      className="w-full rounded-md px-1 py-0.5 text-[11px] text-grafite/60 hover:underline"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalCount < MAX_CART_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-rosa/40 bg-white/60 px-4 py-6 text-sm text-grafite/60 transition hover:border-vinho/50 hover:bg-rosa-soft/30 disabled:opacity-50"
          >
            <span className="text-2xl">🖼️</span>
            {busy ? "Processando…" : `Selecionar fotos · ${totalCount}/${MAX_CART_PHOTOS}`}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        {cart.media.length > 0 && (
          <p className="text-xs text-grafite/45">
            {cart.media.length > 1
              ? "A primeira foto é a capa. Use “capa” ou as setas para reordenar — a ordem aparece no carrossel da carta. "
              : ""}
            Em “Ajustar foto” você escolhe qual parte de cada foto aparece na cartinha.
          </p>
        )}
        {error && <p className="text-xs text-vinho">{error}</p>}

        {adjustingPhoto && (
          <PhotoFramingDialog
            key={adjustingPhoto.id}
            src={adjustingPhoto.url}
            label={`Foto ${cart.media.indexOf(adjustingPhoto) + 1}`}
            framing={adjustingPhoto.framing}
            onCancel={() => setAdjustingId(null)}
            onSave={(framing) => saveFraming(adjustingPhoto.id, framing)}
          />
        )}
      </div>
    </div>
  );
}

function CounterField({ cart, update }: Pick<Props, "cart" | "update">) {
  return (
    <div className="space-y-3">
      <Toggle
        checked={cart.showRelationshipCounter}
        onChange={(v) => update({ showRelationshipCounter: v })}
        label="Mostrar contador de tempo juntos"
      />
      {cart.showRelationshipCounter && (
        <div>
          <FieldLabel hint="quando começou">Data inicial</FieldLabel>
          <input
            type="date"
            value={cart.relationshipStartDate?.slice(0, 10) ?? ""}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) =>
              update({
                relationshipStartDate: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            className="w-full rounded-xl border border-rosa/40 bg-white px-4 py-3 text-grafite outline-none focus:border-vinho focus:ring-2 focus:ring-vinho/15"
          />
        </div>
      )}
    </div>
  );
}

function ThemeField({ cart, update }: Pick<Props, "cart" | "update">) {
  return (
    <div>
      <FieldLabel>Tema visual</FieldLabel>
      <div className="grid grid-cols-2 gap-2.5">
        {themes.map((t) => {
          const active = cart.theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => update({ theme: t.id as ThemeId })}
              aria-pressed={active}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                active
                  ? "border-vinho bg-vinho/5 shadow-sm"
                  : "border-rosa/35 bg-white hover:border-vinho/40"
              }`}
            >
              <span className="flex shrink-0 gap-0.5">
                <span className="h-8 w-4 rounded-l" style={{ background: t.swatch[0] }} />
                <span className="h-8 w-4 rounded-r" style={{ background: t.swatch[1] }} />
              </span>
              <span>
                <span className="block text-sm font-medium text-grafite">{t.label}</span>
                <span className="block text-xs text-grafite/50">{t.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
