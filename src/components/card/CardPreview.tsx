"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Cart } from "@/lib/types";
import { getTheme, paperClass } from "@/content/themes";
import { timeTogether, formatTimeTogether } from "@/lib/counter";
import { youTubeThumbnail } from "@/lib/youtube";
import { PhotoCarousel } from "@/components/card/PhotoCarousel";

/**
 * A "folha" da carta — recriação original, dirigida pelos tokens do tema.
 * Usada tanto no preview ao vivo quanto na carta aberta.
 * O preview NUNCA toca música automaticamente (apenas indica a faixa).
 */
export function CardPreview({ cart, live = false }: { cart: Cart; live?: boolean }) {
  const theme = getTheme(cart.theme);
  const counter = useLiveCounter(
    cart.showRelationshipCounter ? cart.relationshipStartDate : null,
  );

  const title = cart.title.trim() || "O título aparece aqui";
  const message =
    cart.message.trim() ||
    "A sua mensagem aparece aqui, com todo o carinho. Comece a escrever para ver a mágica acontecer no preview.";
  const recipientName = cart.recipientName.trim();
  const isPlaceholder = !cart.title.trim() && !cart.message.trim();
  const headingClass =
    theme.heading === "script"
      ? "font-script text-3xl leading-tight sm:text-4xl"
      : "font-serif text-2xl font-semibold tracking-tight sm:text-3xl";

  return (
    <div
      className="mx-auto w-full max-w-md p-4 shadow-xl sm:p-6"
      style={{ background: theme.envelopeBg, borderRadius: "1.25rem" }}
    >
      <div
        className={`${paperClass(theme.paper)} px-5 py-6 sm:px-7 sm:py-8`}
        style={{
          background: theme.cardBg,
          color: theme.ink,
          border: theme.cardBorder,
          borderRadius: theme.cardRadius,
        }}
      >
        {/* Título com ornamento do tema */}
        <div className="flex items-start gap-2">
          <span aria-hidden className="mt-1 shrink-0 text-lg" style={{ color: theme.accent }}>
            {theme.ornament}
          </span>
          <h3 className={headingClass} style={{ color: theme.ink }}>
            {title}
          </h3>
        </div>

        {recipientName && (
          <p className="mt-1 pl-7 text-sm opacity-70">Para {recipientName}</p>
        )}

        {/* Fotos em carrossel */}
        {cart.media.length > 0 && (
          <div className="mt-6">
            <PhotoCarousel
              media={cart.media}
              accent={theme.accent}
              frame={theme.photoFrame}
              tilt={theme.tilt}
            />
          </div>
        )}

        {/* Mensagem — quebras de linha preservadas, sem estourar o layout */}
        <p
          className="mt-6 whitespace-pre-wrap break-words text-[15px] leading-7"
          style={{ opacity: isPlaceholder ? 0.5 : 0.92 }}
        >
          {message}
        </p>

        {/* Contador de tempo juntos (só quando ativado e com data) */}
        {counter && (
          <div
            className="mt-6 rounded-lg px-4 py-3 text-center text-sm"
            style={{ background: `${theme.accent}22`, color: theme.ink }}
          >
            <span className="opacity-70">Juntos há </span>
            <strong>{formatTimeTogether(counter)}</strong>
            <div className="mt-0.5 text-xs opacity-60">
              {counter.hours}h {counter.minutes}min {counter.seconds}s
            </div>
          </div>
        )}

        {/* Divisor decorativo do tema */}
        {(cart.senderName.trim() || cart.signature.trim()) && (
          <div
            aria-hidden
            className="mt-6 text-center text-sm tracking-[0.3em]"
            style={{ color: theme.accent }}
          >
            {theme.divider}
          </div>
        )}

        {/* Assinatura em destaque */}
        {(cart.senderName.trim() || cart.signature.trim()) && (
          <div className="mt-3 text-right">
            {cart.signature.trim() && (
              <p className="text-sm italic opacity-75">{cart.signature.trim()}</p>
            )}
            {cart.senderName.trim() && (
              <p className="font-script text-2xl" style={{ color: theme.ink }}>
                {cart.senderName.trim()}
              </p>
            )}
          </div>
        )}

        {/* Indicador de música (miniatura — sem autoplay no preview) */}
        {cart.musicVideoId && (
          <div className="mt-6 flex items-center gap-3 rounded-lg bg-black/5 p-2">
            <Image
              src={youTubeThumbnail(cart.musicVideoId)}
              alt="Capa da música escolhida"
              width={72}
              height={54}
              className="h-12 w-16 rounded object-cover"
              unoptimized
            />
            <div className="text-xs">
              <p className="font-medium">🎵 Música adicionada</p>
              <p className="opacity-60">
                {live ? "Toca quando o envelope abrir" : "Toque para ouvir"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function useLiveCounter(startISO: string | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startISO) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [startISO]);
  return startISO ? timeTogether(startISO) : null;
}
