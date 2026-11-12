"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CartMedia } from "@/lib/types";
import { CARD_PHOTO_ASPECT, framingStyle } from "@/lib/photoFraming";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mql = window.matchMedia?.(REDUCED_MOTION);
  mql?.addEventListener?.("change", onChange);
  return () => mql?.removeEventListener?.("change", onChange);
}
const getReducedMotion = () => window.matchMedia?.(REDUCED_MOTION).matches ?? false;

function subscribeTabVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const getTabVisible = () => !document.hidden;

/** Foco vindo do teclado (não de clique/toque, que em celular deixaria o autoplay parado). */
function isKeyboardFocus(el: EventTarget): boolean {
  try {
    return (el as Element).matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * Carrossel de fotos leve e acessível — sem dependências externas.
 * - Uma foto por vez com crossfade (altura constante, sem "pulos").
 * - Botões anterior/próxima, indicadores clicáveis, swipe (pointer events),
 *   navegação por teclado e rótulos acessíveis.
 * - O crossfade usa transição de opacidade, neutralizada por
 *   prefers-reduced-motion (regra global), preservando a proporção via cover.
 * - A moldura tem proporção fixa e a foto a preenche com `cover`, então há
 *   recorte. Qual parte da foto sobrevive ao recorte é decisão do cliente:
 *   vem de `framingStyle(m.framing)` — a MESMA função usada na prévia da
 *   jornada de criação e na miniatura da etapa Extras. Sem ajuste, o recorte
 *   é centralizado, exatamente como sempre foi.
 * - Auto-avanço (`autoAdvance`): um `setTimeout` por foto, reagendado a cada
 *   mudança de índice. Assim o clique manual (seta, indicador, swipe, teclado)
 *   dá a próxima foto um intervalo inteiro depois — sem salto duplicado — e
 *   re-renderizações do pai não reiniciam nada (as dependências são só valores
 *   primitivos). Pausa por: aba oculta, carrossel fora da tela (a carta 2.0
 *   monta a folha escondida até a abertura), movimento reduzido e foco por
 *   teclado. Pausa por hover/toque foi removida de propósito: com o mouse
 *   parado sobre a foto, ou depois de um toque, o autoplay nunca voltava.
 */
export function PhotoCarousel({
  media,
  accent,
  mutedColor,
  frame = "tape",
  tilt = -1.5,
  autoAdvance = false,
  interval = 3000,
}: {
  media: CartMedia[];
  /** Cor do indicador ativo — precisa ser um tom já verificado contra `cardBg` (≥3:1; ver `ThemeConfig.accentOnCard`). */
  accent: string;
  /** Cor do indicador inativo — precisa ser um tom já verificado contra `cardBg` (≥3:1; ver `ThemeConfig.inkMuted`). */
  mutedColor: string;
  frame?: "tape" | "clean";
  tilt?: number;
  /** Passa as fotos sozinho (usado na carta publicada e na demonstração). */
  autoAdvance?: boolean;
  /** Intervalo do auto-avanço, em ms. */
  interval?: number;
}) {
  const [index, setIndex] = useState(0);
  // Foco por teclado dentro do carrossel: quem navega por teclado não perde a foto.
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  // Fora da tela (ex.: folha `hidden` da carta 2.0 antes de abrir) não conta tempo.
  const [onScreen, setOnScreen] = useState(true);
  const groupRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const count = media.length;
  const hasPhotos = count > 0;
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const tabVisible = useSyncExternalStore(subscribeTabVisibility, getTabVisible, () => true);

  useEffect(() => {
    const node = groupRef.current;
    if (!autoAdvance || !node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(node);
    return () => io.disconnect();
  }, [autoAdvance, hasPhotos]);

  const running =
    autoAdvance && count > 1 && !reducedMotion && tabVisible && onScreen && !keyboardFocus;

  // `index` entra nas dependências de propósito: cada troca (automática ou
  // manual) agenda a próxima a partir de agora, com um único timer vivo.
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => setIndex((i) => (Math.min(i, count - 1) + 1) % count), interval);
    return () => clearTimeout(id);
  }, [running, index, count, interval]);

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
        ref={groupRef}
        role="group"
        aria-roledescription="carrossel"
        aria-label={`Fotos da cartinha — ${count} no total`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onFocus={(e) => setKeyboardFocus(isKeyboardFocus(e.target))}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setKeyboardFocus(false);
        }}
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
          <div
            className="relative w-full overflow-hidden bg-black/5"
            style={{ aspectRatio: CARD_PHOTO_ASPECT }}
          >
            {media.map((m, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={m.url}
                alt={`Foto ${i + 1} de ${count}`}
                aria-hidden={i !== safeIndex}
                draggable={false}
                className="absolute inset-0 h-full w-full transition-opacity duration-500"
                style={{ ...framingStyle(m.framing), opacity: i === safeIndex ? 1 : 0 }}
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
        <div className="mt-3 flex justify-center gap-1" aria-hidden="false">
          {media.map((m, i) => (
            // O botão inteiro é o alvo de toque (24×24, mínimo WCAG 2.2 2.5.8);
            // o indicador visual continua pequeno dentro dele — os dois
            // precisam de tamanhos diferentes, então o dot vira um <span>
            // decorativo centralizado, não o próprio botão.
            <button
              key={m.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Ir para a foto ${i + 1}`}
              aria-current={i === safeIndex}
              className="flex h-6 w-6 items-center justify-center rounded-full"
            >
              <span
                aria-hidden
                className="h-2 rounded-full transition-all"
                style={{
                  width: i === safeIndex ? 20 : 8,
                  background: i === safeIndex ? accent : mutedColor,
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
