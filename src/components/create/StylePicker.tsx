"use client";

import { memo } from "react";
import {
  EFFECT_LABELS,
  getPreset,
  resolveEffect,
  selectablePresets,
  type EffectId,
  type PresentationId,
} from "@/content/presentation/presets";
import { Scene } from "@/components/presentation/Scene";
import { presetVars } from "@/components/presentation/tokens";

/**
 * Estilo: um toque escolhe a apresentação inteira (cena, envelope, papel, luz,
 * decoração). O único ajuste fino é o efeito, e só entre os que o estilo permite.
 * Só aparecem estilos `ready` (com abertura e prévia implementadas).
 */
export function StylePicker({
  presentation,
  options,
  onSelect,
  onEffect,
}: {
  presentation: PresentationId;
  options: unknown;
  onSelect: (id: PresentationId) => void;
  onEffect: (effect: EffectId) => void;
}) {
  const presets = selectablePresets();
  const current = getPreset(presentation);
  const effect = resolveEffect(current, options);

  return (
    <div className="space-y-4">
      {/* `min-w-0`: um fieldset não encolhe abaixo do conteúdo por padrão e a
          fileira de estilos esticaria a página no celular. */}
      <fieldset className="min-w-0">
        <legend className="text-base font-semibold text-grafite">Estilo</legend>
        <p className="mt-0.5 text-sm text-grafite/65">Cenário, envelope e papel já combinados. Toque para trocar.</p>
        <div className="-mx-1 mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {presets.map((p) => {
            const active = p.id === current.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                aria-pressed={active}
                aria-label={`${p.label}: ${p.description}`}
                className={`w-28 shrink-0 snap-start rounded-2xl p-1.5 text-left transition sm:w-32 ${
                  active ? "bg-vinho/10 ring-2 ring-vinho" : "ring-1 ring-rosa/40 hover:ring-vinho/50"
                }`}
              >
                <StyleThumb id={p.id} />
                <span className="mt-1.5 block px-1 text-sm font-semibold leading-tight text-grafite">{p.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {current.effects.allowed.length > 1 && (
        <fieldset className="min-w-0">
          <legend className="text-base font-semibold text-grafite">Efeito ao abrir</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {current.effects.allowed.map((e) => {
              const active = e === effect;
              return (
                <button
                  key={e}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onEffect(e)}
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${
                    active ? "bg-vinho text-creme" : "bg-white text-grafite ring-1 ring-rosa/50 hover:ring-vinho/50"
                  }`}
                >
                  {EFFECT_LABELS[e]}
                  {e === current.effects.default ? " (padrão)" : ""}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}

const StyleThumb = memo(function StyleThumb({ id }: { id: PresentationId }) {
  const preset = getPreset(id);
  return (
    <span className="ps ps-thumb" style={presetVars(preset)} aria-hidden="true">
      <Scene style={id} uid={`th-${id}`} />
      <span className="ps-thumb__paper" />
    </span>
  );
});
