"use client";

import { memo } from "react";
import type { Cart } from "@/lib/types";
import { getPreset, presetForLegacyTheme } from "@/content/presentation/presets";
import { Scene } from "@/components/presentation/Scene";
import { LetterSheet } from "@/components/letter/LetterSheet";
import { presetVars } from "@/components/presentation/tokens";
import { effectiveTitle } from "@/lib/letterDefaults";

/**
 * Prévia do editor: o cenário do estilo e a MESMA folha (`LetterSheet`) da
 * carta publicada. O cenário é memoizado à parte: digitar só redesenha a folha.
 */
const PreviewScene = memo(function PreviewScene({ style }: { style: ReturnType<typeof getPreset>["id"] }) {
  return <Scene style={style} uid="pv" />;
});

export function LetterPreview({ cart }: { cart: Cart }) {
  const preset = getPreset(cart.presentation ?? presetForLegacyTheme(cart.theme));
  return (
    <div className="ps ps-frame" style={presetVars(preset)} data-testid="letter-preview">
      <PreviewScene style={preset.id} />
      <div className="ps-frame__content">
        <LetterSheet letter={{ ...cart, title: effectiveTitle(cart) }} theme={preset.letter} preview />
      </div>
    </div>
  );
}
