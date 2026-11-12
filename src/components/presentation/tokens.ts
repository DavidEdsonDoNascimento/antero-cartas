import type { CSSProperties } from "react";
import type { PresentationPreset } from "@/content/presentation/presets";

/**
 * Variáveis CSS de um estilo, aplicadas na raiz `.ps` (ou numa miniatura). As
 * cores que precisam de contraste vêm do registro (testadas em
 * `presets.test.ts`), nunca da arte da cena.
 */
export function presetVars(preset: PresentationPreset): CSSProperties {
  return {
    "--ps-base": preset.scene.base,
    "--ps-text": preset.scene.text,
    "--ps-text-muted": preset.scene.textMuted,
    "--ps-backdrop": preset.scene.textBackdrop,
    "--ps-button": preset.scene.button,
    "--ps-on-button": preset.scene.onButton,
    "--ps-focus": preset.scene.dark ? "#f1dca8" : "#1a5fd1",
    "--ps-paper": preset.letter.cardBg,
    "--ps-ink": preset.letter.ink,
    "--ps-accent": preset.letter.accent,
  } as CSSProperties;
}
