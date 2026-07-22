"use client";

import { useRef, useState } from "react";
import type { CartMedia } from "@/lib/types";

/**
 * Carrossel de fotos leve e acessível — sem dependências externas.
 * - Uma foto por vez com crossfade (altura constante, sem "pulos").
 * - Botões anterior/próxima, indicadores clicáveis, swipe (pointer events),
 *   navegação por teclado e rótulos acessíveis.
 * - O crossfade usa transição de opacidade, neutralizada por
 *   prefers-reduced-motion (regra global), preservando a proporção via cover.
 */
export function PhotoCarousel({
  media,
  accent,
  frame = "tape",
  tilt = -1.5,
}: {
  media: CartMedia[];
  accent: string;
  frame?: "tape" | "clean";
  tilt?: number;
}) {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const count = media.length;

  if (count === 0) return null;

  // Clampa na renderização (se uma foto for removida, o índice fica válido
  // sem precisar de efeito colateral).
  const safeIndex = Math.min(index, count - 1);
  const go = (next: number) => setIndex(((next % count) + count) % count);
  const single = count === 1;

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
  }
  function onPointerUp(e: React.PointerEvent) {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? safeIndex + 1 : safeIndex - 1);
    startX.current = null;
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(safeIndex - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(safeIndex + 1);
    }
  }

  const isClean = frame === "clean";

  return (
    <div className="w-full">
      <div
        role="group"
        aria-roledescription="carrossel"
        aria-label={`Fotos da cartinha — ${count} no total`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="relative mx-auto w-full max-w-[16rem] touch-pan-y select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <div
          className={
            isClean
              ? "relative bg-white p-1.5 shadow-md"
              : "relative bg-white p-2 pb-5 shadow-md"
          }
          style={{
            rotate: `${tilt}deg`,
            border: isClean ? `1px solid ${accent}` : undefined,
          }}
        >
          {!isClean && (
            <span className="tape absolute -top-2 left-1/2 h-5 w-16 -translate-x-1/2 -rotate-2 rounded-[2px]" />
          )}
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/5">
            {media.map((m, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={m.url}
                alt={`Foto ${i + 1} de ${count}`}
                aria-hidden={i !== safeIndex}
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
                style={{ opacity: i === safeIndex ? 1 : 0 }}
              />
            ))}
          </div>
        </div>

        {!single && (
          <>
            <button
              type="button"
              onClick={() => go(safeIndex - 1)}
              aria-label="Foto anterior"
              className="absolute left-0 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-lg text-grafite shadow-md transition hover:scale-105"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(safeIndex + 1)}
              aria-label="Próxima foto"
              className="absolute right-0 top-1/2 flex h-9 w-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-lg text-grafite shadow-md transition hover:scale-105"
            >
              ›
            </button>
          </>
        )}
      </div>

      {!single && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="false">
          {media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Ir para a foto ${i + 1}`}
              aria-current={i === safeIndex}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === safeIndex ? 20 : 8,
                background:
                  i === safeIndex ? accent : "color-mix(in srgb, currentColor 25%, transparent)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
