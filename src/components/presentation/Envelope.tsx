/**
 * Envelope das cartas (2.0): as mesmas camadas da hero da landing
 * (`envelopeArt`), com as cores do estilo e ids próprios.
 *
 * Só estrutura. Quem anima é o CSS (`presentation.css`), a partir do
 * `data-state` do palco que o contém (`.ps-stage`): fechado → abrindo → aberto.
 * Server-safe e decorativo: o nome escrito no envelope é repetido em texto
 * acessível pelo palco, então aqui tudo é `aria-hidden`.
 *
 * `children` é o conteúdo da carta que aparece saindo do envelope (a prévia
 * pública põe ali a primeira foto e o trecho; a carta privada, só o papel).
 */
import type { ReactNode } from "react";
import type { EnvelopePalette } from "@/content/presentation/presets";
import { SEAL_PATH } from "@/components/paper-light/icons";
import {
  EnvelopeBack,
  EnvelopeFlapIn,
  EnvelopeFlapOut,
  EnvelopePocket,
  envelopeIds,
  type EnvelopeColors,
} from "./envelopeArt";

export function envelopeColors(p: EnvelopePalette): EnvelopeColors {
  return {
    liner: p.liner[0],
    linerMark: p.liner[1],
    shade: "#1c0710",
    flapInEdge: [p.paper[1], p.paper[0]],
    flapOut: p.paper,
    side: p.pocket,
    bottom: [p.paper[0], p.pocket[1]],
    stitch: p.stitch,
    topLine: p.pocket[1],
    highlight: "#fffaf1",
    crease: p.pocket[1],
    creaseSoft: p.pocket[1],
  };
}

/** Lacre de cera na cor do estilo, com a inicial da marca. */
export function Seal({ palette, uid, className }: { palette: EnvelopePalette; uid: string; className?: string }) {
  const g = `${uid}-wax`;
  const [light, mid, dark] = palette.seal;
  return (
    <svg viewBox="0 0 100 100" aria-hidden focusable={false} className={className}>
      <defs>
        <radialGradient id={g} cx="36%" cy="30%" r="82%">
          <stop offset="0" stopColor={light} />
          <stop offset=".42" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
        <radialGradient id={`${g}-hi`} cx="34%" cy="26%" r="40%">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={SEAL_PATH} fill={`url(#${g})`} />
      <path d={SEAL_PATH} fill="none" stroke="#2b0b17" strokeOpacity=".3" strokeWidth="1.2" />
      <circle cx="50" cy="50" r="29" fill="none" stroke="#2b0b17" strokeOpacity=".38" strokeWidth="1.6" />
      <text
        x="50"
        y="62.5"
        textAnchor="middle"
        fontSize="38"
        fontStyle="italic"
        fontWeight="500"
        style={{ fontFamily: "var(--ps-font-display)" }}
        fill={palette.sealMark}
      >
        A
      </text>
      <ellipse cx="38" cy="30" rx="21" ry="14" fill={`url(#${g}-hi)`} />
    </svg>
  );
}

export function Envelope({
  palette,
  uid,
  label,
  children,
}: {
  palette: EnvelopePalette;
  uid: string;
  /** Escrito à mão na frente do envelope ("Para Ana"). Decorativo. */
  label?: string;
  children?: ReactNode;
}) {
  const colors = envelopeColors(palette);
  const ids = envelopeIds(uid);
  return (
    <div className="ps-env" aria-hidden="true">
      <EnvelopeBack className="ps-layer ps-layer--back" colors={colors} ids={ids} />
      <div className="ps-flap-in">
        <EnvelopeFlapIn className="ps-layer" colors={colors} ids={ids} />
      </div>
      <div className="ps-letter-clip">
        <div className="ps-letter">{children}</div>
      </div>
      <EnvelopePocket className="ps-layer ps-pocket" colors={colors} ids={ids} />
      <div className="ps-sheen" />
      {label && <p className="ps-env__label">{label}</p>}
      <div className="ps-flap-out">
        <EnvelopeFlapOut className="ps-layer" colors={colors} ids={ids} />
      </div>
      <Seal palette={palette} uid={uid} className="ps-seal" />
    </div>
  );
}
