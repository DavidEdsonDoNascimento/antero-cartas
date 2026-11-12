"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { presentationFontVars } from "@/components/presentation/fonts";
import type { PublicPreviewDTO } from "@/lib/publicPreview";
import { whatsappShareUrl } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { GiftPeek } from "./GiftPeek";

const SHARE_TEXT = "Ganhei uma cartinha especial 💌";

/**
 * "Compartilhar que ganhei": compartilha SÓ a prévia pública `/presente/{id}`,
 * nunca o link da carta.
 *
 * Sem escolha do que compartilhar, sem ativar ou desativar nada: uma folha
 * curta mostra exatamente o que os outros vão ver e oferece compartilhar
 * (pelo sistema, quando o aparelho tem), WhatsApp e copiar o link.
 *
 * Cartas publicadas antes da 2.0 ainda não têm `publicId`: ao abrir a folha,
 * o link é criado (POST idempotente). Isso acontece ao ABRIR e não no toque de
 * "Compartilhar": o Safari só aceita `navigator.share` dentro do gesto, e
 * esperar a rede antes dele faria o compartilhamento ser recusado.
 */
export function GiftShareButton({
  slug,
  initialUrl,
  preview,
}: {
  slug: string;
  /** URL pública já existente (cartas novas). `null` = criar ao abrir. */
  initialUrl: string | null;
  preview: PublicPreviewDTO;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    // Só no navegador: o botão nativo aparece depois de hidratar, nunca no HTML do servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const ensureUrl = useCallback(async () => {
    if (url) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/letters/${encodeURIComponent(slug)}/public-link`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!res.ok || !data?.url) throw new Error("public-link");
      setUrl(data.url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [slug, url]);

  function openSheet() {
    setOpen(true);
    setCopied(false);
    track("gift_share_opened", { content: preview.content });
    void ensureUrl();
  }

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Foco dentro da folha, Esc fecha e devolve o foco ao botão.
  useEffect(() => {
    if (!open) return;
    const first = dialogRef.current?.querySelector<HTMLElement>("button, a[href]");
    first?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
      if (items.length === 0) return;
      const firstItem = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        firstItem.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function shareNative() {
    if (!url) return;
    try {
      await navigator.share({ title: "Uma cartinha especial", text: SHARE_TEXT, url });
      track("gift_share_sent", { method: "native" });
    } catch {
      // Cancelado pela pessoa ou recusado pelo sistema: a folha continua aberta.
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      track("gift_share_sent", { method: "copy" });
    } catch {
      setCopied(false);
    }
  }

  const ready = Boolean(url) && !loading;

  return (
    <>
      <button ref={triggerRef} type="button" className="ps-btn ps-btn--ghost ps-btn--block" onClick={openSheet}>
        Compartilhar que ganhei
      </button>

      {/* Portal no body: dentro do conteúdo da carta, a folha ficaria presa ao
          empilhamento dele e o selo flutuante de criação a cobriria. */}
      {open && createPortal(
        <div className={`ps ${presentationFontVars}`}>
        <div className="ps-share" role="presentation" onClick={close}>
          <div
            ref={dialogRef}
            className="ps-share__sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ps-share__head">
              <h2 id={titleId} className="ps-share__title">
                Compartilhar que ganhei
              </h2>
              <button type="button" className="ps-share__close" onClick={close} aria-label="Fechar">
                ✕
              </button>
            </div>

            <div className="ps-share__mini">
              <GiftPeek preview={preview} uid="share" />
            </div>

            <p className="ps-share__note">
              {preview.content === "full"
                ? "Quem abrir o link verá a primeira foto e o começo da mensagem. O resto da carta continua só no seu link."
                : "Quem abrir o link verá o cenário e o envelope. A mensagem e as fotos continuam só no seu link."}
            </p>

            {error && (
              <p role="alert" className="ps-share__error">
                Não foi possível preparar o link agora.{" "}
                <button type="button" className="ps-link" onClick={() => void ensureUrl()}>
                  Tentar de novo
                </button>
              </p>
            )}

            <div className="ps-share__actions">
              {canShare && (
                <button type="button" className="ps-btn ps-btn--block" disabled={!ready} onClick={shareNative}>
                  Compartilhar
                </button>
              )}
              {ready ? (
                <a
                  className={`ps-btn ps-btn--block${canShare ? " ps-btn--ghost" : ""}`}
                  href={whatsappShareUrl(`${SHARE_TEXT} ${url}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("gift_share_sent", { method: "whatsapp" })}
                >
                  Enviar pelo WhatsApp
                </a>
              ) : (
                <button type="button" className="ps-btn ps-btn--block ps-btn--ghost" disabled>
                  {loading ? "Preparando o link…" : "Enviar pelo WhatsApp"}
                </button>
              )}
              <button type="button" className="ps-btn ps-btn--block ps-btn--ghost" disabled={!ready} onClick={copy}>
                {copied ? "Link copiado" : "Copiar link"}
              </button>
              <p role="status" className="ps-sr">
                {copied ? "Link copiado." : ""}
              </p>
            </div>
          </div>
        </div>
        </div>,
        document.body,
      )}
    </>
  );
}
