"use client";

import { useEffect, useRef, useState } from "react";
import {
  CARD_PHOTO_ASPECT,
  DEFAULT_FRAMING,
  MAX_ZOOM,
  MIN_ZOOM,
  clamp01,
  clampFraming,
  framingOverflow,
  framingStyle,
  isDefaultFraming,
  panBy,
  type PhotoFraming,
  type Size,
} from "@/lib/photoFraming";

/**
 * Editor de enquadramento de UMA foto.
 *
 * Mostra a foto dentro da MESMA moldura que a carta usa (`CARD_PHOTO_ASPECT`)
 * e devolve apenas metadados — ponto focal normalizado e zoom. O arquivo
 * enviado nunca é tocado.
 *
 * Três formas de operar o mesmo estado, porque nenhuma delas serve a todo
 * mundo:
 *  - arrastar (mouse e toque, via Pointer Events): pega a FOTO e a move, como
 *    em qualquer editor — arrastar para a direita revela o lado esquerdo;
 *  - setas do teclado sobre a moldura e os controles deslizantes: movem a
 *    ÁREA VISÍVEL — para a direita mostra a parte direita da foto. É a
 *    convenção oposta, de propósito: é a que casa com a leitura de um
 *    slider ("mais à direita = mais para a direita da foto") e a única que um
 *    leitor de tela consegue anunciar como valor.
 *
 * O diálogo é o <dialog> nativo: foco preso, fundo inerte e Esc já vêm do
 * navegador, sem biblioteca nenhuma.
 */

/** Passo do zoom nos botões − / +. */
const ZOOM_STEP = 0.1;
/** Passo das setas do teclado, em fração do curso disponível. */
const KEY_STEP = 0.02;

/** Moldura normalizada: só a PROPORÇÃO decide se existe curso para arrastar. */
const NORMALIZED_FRAME: Size = { width: CARD_PHOTO_ASPECT, height: 1 };

interface Props {
  /** URL da foto (a mesma exibida na miniatura e na carta). */
  src: string;
  /** Identificação humana da foto, para rótulos acessíveis. Ex.: "Foto 2". */
  label: string;
  /** Enquadramento atual; `null` = padrão (centralizado, sem zoom). */
  framing: PhotoFraming | null;
  /** Fecha sem alterar nada. */
  onCancel: () => void;
  /** Confirma. Recebe `null` quando o resultado é o enquadramento padrão. */
  onSave: (framing: PhotoFraming | null) => void;
}

export function PhotoFramingDialog({ src, label, framing, onCancel, onSave }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  const [value, setValue] = useState<PhotoFraming>(() => clampFraming(framing));
  const [natural, setNatural] = useState<Size | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el || el.open) return;
    // showModal dá foco preso e fundo inerte. O fallback existe só para
    // ambientes sem a API (jsdom antigo): o conteúdo continua utilizável.
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
  }, []);

  /**
   * Sobra da foto para fora da moldura. Em pixels durante o arraste (precisa
   * converter pixels em fração); normalizada no resto (só interessa se existe
   * curso naquele eixo, e isso depende só das proporções).
   */
  function overflowFor(zoom: number, frame: Size = NORMALIZED_FRAME): Size {
    return natural ? framingOverflow(frame, natural, zoom) : { width: 0, height: 0 };
  }

  const room = overflowFor(value.zoom);
  const canPanX = room.width > 0;
  const canPanY = room.height > 0;

  function nudge(axis: "x" | "y", direction: -1 | 1) {
    setValue((f) => ({ ...f, [axis]: clamp01(f[axis] + direction * KEY_STEP) }));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const origin = dragOrigin.current;
    if (!origin || !natural) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const delta = { x: e.clientX - origin.x, y: e.clientY - origin.y };
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    setValue((f) => panBy(f, delta, overflowFor(f.zoom, rect)));
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragOrigin.current = null;
    setDragging(false);
  }

  function onFrameKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [("x" | "y"), -1 | 1]> = {
      ArrowLeft: ["x", -1],
      ArrowRight: ["x", 1],
      ArrowUp: ["y", -1],
      ArrowDown: ["y", 1],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    nudge(move[0], move[1]);
  }

  function changeZoom(next: number) {
    setValue((f) => clampFraming({ ...f, zoom: next }));
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="ajuste-foto-titulo"
      onCancel={(e) => {
        // Esc: fecha DESCARTANDO — o cancelamento é do fluxo, não do <dialog>.
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(30rem,calc(100vw-1.5rem))] max-h-[92dvh] overflow-y-auto rounded-2xl bg-creme p-4 text-grafite shadow-2xl backdrop:bg-grafite/60 sm:p-6"
    >
      <h2 id="ajuste-foto-titulo" className="font-serif text-lg font-semibold">
        Ajustar foto
      </h2>
      <p id="ajuste-foto-ajuda" className="mt-1 text-xs text-grafite/60">
        Arraste a foto para escolher a parte que aparece na cartinha e use o zoom para
        aproximar. Com o teclado, use as setas sobre a moldura ou os controles abaixo.
      </p>

      <div
        ref={frameRef}
        role="group"
        tabIndex={0}
        aria-label={`Enquadramento de ${label}`}
        aria-describedby="ajuste-foto-ajuda"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onFrameKeyDown}
        style={{ aspectRatio: CARD_PHOTO_ASPECT }}
        className={`relative mt-4 w-full touch-none select-none overflow-hidden rounded-lg bg-black/10 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Pré-visualização do enquadramento — ${label}`}
          draggable={false}
          onLoad={(e) =>
            setNatural({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={framingStyle(value)}
        />
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="ajuste-foto-zoom" className="text-xs font-medium text-grafite/70">
            Zoom
          </label>
          <div className="mt-1 flex items-center gap-2">
            <StepButton
              label="Diminuir zoom"
              disabled={value.zoom <= MIN_ZOOM}
              onClick={() => changeZoom(value.zoom - ZOOM_STEP)}
            >
              −
            </StepButton>
            <input
              id="ajuste-foto-zoom"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={value.zoom}
              onChange={(e) => changeZoom(Number(e.target.value))}
              className="h-6 min-w-0 flex-1 accent-vinho"
            />
            <StepButton
              label="Aumentar zoom"
              disabled={value.zoom >= MAX_ZOOM}
              onClick={() => changeZoom(value.zoom + ZOOM_STEP)}
            >
              +
            </StepButton>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <AxisSlider
            id="ajuste-foto-x"
            label="Horizontal"
            value={value.x}
            disabled={!canPanX}
            onChange={(x) => setValue((f) => ({ ...f, x }))}
          />
          <AxisSlider
            id="ajuste-foto-y"
            label="Vertical"
            value={value.y}
            disabled={!canPanY}
            onChange={(y) => setValue((f) => ({ ...f, y }))}
          />
        </div>
      </div>

      {/* Numa tela de ~390px os três não cabem lado a lado: "Restaurar padrão"
          fica na própria linha e as duas ações do fluxo seguem juntas à
          direita. A partir de `sm` tudo volta para uma linha só. */}
      <div className="mt-5 flex flex-col gap-3 border-t border-rosa/25 pt-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => setValue(DEFAULT_FRAMING)}
          disabled={isDefaultFraming(value)}
          className="self-start rounded-full px-3 py-2 text-xs font-medium text-grafite/60 underline disabled:opacity-40 disabled:no-underline"
        >
          Restaurar padrão
        </button>
        <div className="flex items-center justify-end gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-medium text-grafite/70"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(isDefaultFraming(value) ? null : value)}
            className="rounded-full bg-vinho px-5 py-2 text-sm font-semibold text-creme shadow"
          >
            Salvar ajuste
          </button>
        </div>
      </div>
    </dialog>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rosa/40 bg-white text-lg leading-none text-grafite disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * Controle de posição por eixo. Desabilitado quando não há sobra naquele eixo
 * (a foto já cabe inteira ali): mexer não mudaria nada, e um controle que não
 * faz nada é pior do que um controle ausente.
 */
function AxisSlider({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-grafite/70">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(clamp01(Number(e.target.value)))}
        className="mt-1 h-6 w-full accent-vinho disabled:opacity-40"
      />
    </div>
  );
}
