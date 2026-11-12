/**
 * Efeitos da abertura: pétalas, borboletas ou brilho.
 *
 * - Toca UMA vez (≈4–5 s) quando `play` liga (`data-play`) e some
 *   sozinho: nada fica se mexendo enquanto a pessoa lê (WCAG 2.2.2).
 * - Só `transform` e `opacity`, no máximo 12 elementos SVG, sem JavaScript de
 *   animação, sem canvas e sem biblioteca.
 * - `pointer-events: none`: nunca cobre um botão nem a carta.
 * - Movimento reduzido ou aparelho modesto (`data-lowfx` na raiz `.ps`): não aparece.
 *
 * Server-safe: as posições são fixas (sem `Math.random`), então o HTML do
 * servidor e o do navegador são iguais.
 */
import type { CSSProperties } from "react";
import type { EffectId, PresentationId } from "@/content/presentation/presets";
import { Butterfly, LoosePetal, Sparkle } from "./decor";

const PETALS: Record<PresentationId, [string, string]> = {
  "papel-luz": ["#f3d3d8", "#d99aa6"],
  romantico: ["#e8798f", "#a8304e"],
  noturno: ["#b0465f", "#6a1a30"],
  floral: ["#fbe0e8", "#e8a6b9"],
  delicado: ["#efe4d2", "#cdb89a"],
};

const WINGS: Record<PresentationId, [string, string]> = {
  "papel-luz": ["#f6d8b8", "#d79a6a"],
  romantico: ["#f4b6c6", "#c04a6a"],
  noturno: ["#e9cf91", "#a77d3a"],
  floral: ["#f7c6d4", "#c9718a"],
  delicado: ["#f1e6d2", "#b49a74"],
};

const SPARKS: Record<PresentationId, string> = {
  "papel-luz": "#d8b46a",
  romantico: "#e2bd6e",
  noturno: "#f1dca8",
  floral: "#f2c66f",
  delicado: "#c2ab84",
};

/** [esquerda %, atraso s, duração s, giro graus, escala] */
const PETAL_SPOTS: [number, number, number, number, number][] = [
  [8, 0, 3.6, 220, 1], [22, 0.4, 4.1, -180, 0.8], [36, 0.15, 3.8, 260, 1.1], [50, 0.7, 4.3, -240, 0.9],
  [63, 0.3, 3.9, 200, 1], [76, 0.55, 4.2, -220, 0.85], [88, 0.1, 3.7, 240, 1.05], [15, 0.9, 4, -200, 0.75],
  [44, 1.05, 3.6, 180, 0.9], [70, 1.2, 3.8, -260, 0.8],
];
const BUTTERFLY_SPOTS: [number, number, number, number, number][] = [
  [10, 0, 4.4, -12, 1], [78, 0.5, 4.8, 14, 0.85], [30, 0.9, 4.2, -8, 0.7], [62, 1.3, 4.6, 10, 0.9],
];
const SPARK_SPOTS: [number, number, number, number, number][] = [
  [12, 0, 1.6, 0, 1], [24, 0.3, 1.8, 0, 0.7], [38, 0.6, 1.5, 0, 1.2], [52, 0.15, 1.7, 0, 0.8],
  [66, 0.45, 1.6, 0, 1], [80, 0.75, 1.9, 0, 0.75], [90, 0.2, 1.5, 0, 0.9], [18, 1.1, 1.7, 0, 0.85],
  [46, 1.3, 1.6, 0, 1.1], [72, 1.5, 1.8, 0, 0.7], [30, 1.8, 1.5, 0, 0.9], [58, 2, 1.7, 0, 1],
];

function spot([x, delay, dur, rot, scale]: [number, number, number, number, number], i: number): CSSProperties {
  return {
    "--x": `${x}%`,
    "--y": `${12 + ((i * 37) % 60)}%`,
    "--d": `${delay}s`,
    "--t": `${dur}s`,
    "--r": `${rot}deg`,
    "--k": scale,
  } as CSSProperties;
}

export function EffectsLayer({
  effect,
  style,
  uid,
  play,
}: {
  effect: EffectId;
  style: PresentationId;
  uid: string;
  /** Liga a animação (uma vez). Desligado, nada aparece. */
  play: boolean;
}) {
  if (effect === "none") return null;
  return (
    <div className="ps-fx" data-effect={effect} data-play={play || undefined} aria-hidden="true">
      {effect === "petalas" &&
        PETAL_SPOTS.map((s, i) => (
          <span key={i} className="ps-fx__item ps-fx__petal" style={spot(s, i)}>
            <LoosePetal uid={`${uid}-fx${i}`} colors={PETALS[style]} />
          </span>
        ))}
      {effect === "borboletas" &&
        BUTTERFLY_SPOTS.map((s, i) => (
          <span key={i} className="ps-fx__item ps-fx__butterfly" style={spot(s, i)}>
            <Butterfly uid={`${uid}-bf${i}`} wings={WINGS[style]} />
          </span>
        ))}
      {effect === "brilho" &&
        SPARK_SPOTS.map((s, i) => (
          <span key={i} className="ps-fx__item ps-fx__spark" style={spot(s, i)}>
            <Sparkle color={SPARKS[style]} />
          </span>
        ))}
    </div>
  );
}
