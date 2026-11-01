/**
 * Ícones e ilustrações originais da identidade "Papel e Luz".
 * SVG inline, sem biblioteca: traço de 1,75 px, pontas arredondadas, `currentColor`
 * para os ícones e cores fixas da paleta para as ilustrações.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function ArrowIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9.2" strokeWidth={1.5} opacity={0.35} />
      <path d="m8 12.4 2.7 2.7L16.2 9.4" />
    </svg>
  );
}

export function NoteIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  );
}

export function PixIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m12 3.5 4.2 4.2a2 2 0 0 1 0 2.8L12 14.7 7.8 10.5a2 2 0 0 1 0-2.8L12 3.5Z" />
      <path d="m12 20.5-4.2-4.2a2 2 0 0 1 0-2.8M12 20.5l4.2-4.2a2 2 0 0 0 0-2.8" />
    </svg>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h3" />
    </svg>
  );
}

/** Polígono serrilhado do lacre de cera: 13 lóbulos irregulares, calculado uma vez. */
const SEAL_PATH = (() => {
  const pts: string[] = [];
  const n = 156;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = 41 + 2.6 * Math.sin(13 * t + 0.6) + 1.1 * Math.sin(5 * t + 1.7) + 0.6 * Math.sin(29 * t);
    pts.push(`${i === 0 ? "M" : "L"}${(50 + r * Math.cos(t)).toFixed(2)} ${(50 + r * Math.sin(t)).toFixed(2)}`);
  }
  return `${pts.join("")}Z`;
})();

/** Lacre de cera com a inicial da marca. Usado na hero, no logo e na chamada final. */
export function WaxSeal({ idSuffix, ...props }: IconProps & { idSuffix: string }) {
  const g = `pl-wax-${idSuffix}`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden focusable={false} {...props}>
      <defs>
        <radialGradient id={g} cx="36%" cy="30%" r="82%">
          <stop offset="0" stopColor="#b5486c" />
          <stop offset=".42" stopColor="#8a3250" />
          <stop offset="1" stopColor="#4a1527" />
        </radialGradient>
        <radialGradient id={`${g}-hi`} cx="34%" cy="26%" r="40%">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={SEAL_PATH} fill={`url(#${g})`} />
      <path d={SEAL_PATH} fill="none" stroke="#2b0b17" strokeOpacity=".35" strokeWidth="1.2" />
      <circle cx="50" cy="50" r="29" fill="none" stroke="#2b0b17" strokeOpacity=".42" strokeWidth="1.6" />
      <circle cx="50" cy="50" r="30.4" fill="none" stroke="#f2b8c8" strokeOpacity=".28" strokeWidth="1" />
      <text
        x="50"
        y="62.5"
        textAnchor="middle"
        fontSize="38"
        fontStyle="italic"
        fontWeight="500"
        style={{ fontFamily: "var(--pl-font-display)" }}
        fill="#2b0b17"
        fillOpacity=".5"
        transform="translate(.9 1.1)"
      >
        A
      </text>
      <text
        x="50"
        y="62.5"
        textAnchor="middle"
        fontSize="38"
        fontStyle="italic"
        fontWeight="500"
        style={{ fontFamily: "var(--pl-font-display)" }}
        fill="#f6d3dd"
      >
        A
      </text>
      <ellipse cx="38" cy="30" rx="21" ry="14" fill={`url(#${g}-hi)`} />
    </svg>
  );
}

/** Ramo seco com bagas: detalhe decorativo discreto. */
export function Sprig(props: IconProps) {
  return (
    <svg viewBox="0 0 90 150" aria-hidden focusable={false} {...props}>
      <path d="M26 148C30 108 40 66 70 6" fill="none" stroke="#9a7a4c" strokeWidth="2.4" strokeLinecap="round" />
      <g fill="#c9a574" stroke="#9a7a4c" strokeWidth=".8">
        <ellipse cx="22" cy="114" rx="14" ry="6.4" transform="rotate(-38 22 114)" />
        <ellipse cx="42" cy="104" rx="13" ry="6" transform="rotate(34 42 104)" />
        <ellipse cx="28" cy="84" rx="13" ry="6" transform="rotate(-46 28 84)" />
        <ellipse cx="50" cy="72" rx="12.5" ry="5.8" transform="rotate(30 50 72)" />
        <ellipse cx="42" cy="50" rx="12" ry="5.6" transform="rotate(-50 42 50)" />
        <ellipse cx="62" cy="40" rx="11" ry="5.2" transform="rotate(26 62 40)" />
        <ellipse cx="62" cy="20" rx="10" ry="4.8" transform="rotate(-52 62 20)" />
      </g>
      <g fill="#782b45">
        <circle cx="12" cy="98" r="3.8" />
        <circle cx="58" cy="92" r="3.4" />
        <circle cx="34" cy="64" r="3.2" />
        <circle cx="74" cy="56" r="3" />
      </g>
    </svg>
  );
}

export function Petal({ idSuffix, ...props }: IconProps & { idSuffix: string }) {
  const g = `pl-petal-${idSuffix}`;
  return (
    <svg viewBox="0 0 40 52" aria-hidden focusable={false} {...props}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d3d8" />
          <stop offset="1" stopColor="#d99aa6" />
        </linearGradient>
      </defs>
      <path d="M20 2C32 14 40 26 33 40c-4 7-10 10-13 10S11 47 7 40C0 26 8 14 20 2Z" fill={`url(#${g})`} />
      <path d="M20 8c0 14 0 26 0 40" stroke="#c4808f" strokeOpacity=".55" strokeWidth="1" fill="none" />
    </svg>
  );
}

/** "Fotografia" original da polaroide: pôr do sol em colinas. */
export function SunsetPhoto(props: IconProps) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden focusable={false} {...props}>
      <defs>
        <linearGradient id="pl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9b6bd" />
          <stop offset=".5" stopColor="#f6d2bd" />
          <stop offset="1" stopColor="#f9e4c6" />
        </linearGradient>
        <radialGradient id="pl-sun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset=".5" stopColor="#fff0d2" stopOpacity=".95" />
          <stop offset="1" stopColor="#ffe3b5" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#pl-sky)" />
      <circle cx="66" cy="50" r="30" fill="url(#pl-sun)" />
      <circle cx="66" cy="50" r="10" fill="#fffaf0" />
      <path d="M0 62c14-9 28-10 42-4s30 6 58-6v48H0Z" fill="#c9798c" />
      <path d="M0 74c16-8 32-8 48-2s34 4 52-4v32H0Z" fill="#9a4560" />
      <path d="M0 86c18-6 36-6 54-1s30 2 46-3v18H0Z" fill="#782b45" />
      <path d="M20 30q3-3 6 0M30 24q2.4-2.4 4.8 0M14 22q2.4-2.4 4.8 0" fill="none" stroke="#7a4a58" strokeWidth=".9" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

/* ---- Ilustrações dos três passos (traço tinta, preenchimentos da paleta) ---- */

const ink = "#342729";

export function StepWriteArt(props: IconProps) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden focusable={false} {...props}>
      <g transform="rotate(-4 58 64)">
        <rect x="22" y="20" width="68" height="84" rx="5" fill="#fffdf9" stroke={ink} strokeWidth="2" />
        <path d="M32 40h34M32 52h46M32 64h40M32 76h26" stroke="#dcaeb4" strokeWidth="3" strokeLinecap="round" />
        <path d="M70 84c-3-4-8-3-8 1 0 4 5 7 8 10 3-3 8-6 8-10 0-4-5-5-8-1Z" fill="#782b45" />
      </g>
      <g transform="rotate(32 88 52)">
        <rect x="82" y="14" width="10" height="60" rx="3" fill="#b99161" stroke={ink} strokeWidth="2" />
        <path d="M82 74h10l-5 14Z" fill="#fffdf9" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        <path d="M85.5 82.5h3l-1.5 5Z" fill={ink} />
        <rect x="82" y="14" width="10" height="9" rx="3" fill="#782b45" stroke={ink} strokeWidth="2" />
      </g>
    </svg>
  );
}

export function StepPersonalizeArt(props: IconProps) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden focusable={false} {...props}>
      <g transform="rotate(-7 44 64)">
        <rect x="14" y="26" width="58" height="68" rx="4" fill="#fffdf9" stroke={ink} strokeWidth="2" />
        <rect x="20" y="32" width="46" height="44" rx="2" fill="#f6d2bd" stroke={ink} strokeWidth="1.6" />
        <circle cx="52" cy="48" r="7" fill="#fff0d2" />
        <path d="M20 66c8-8 16-8 24-3s14 3 22-3v16H20Z" fill="#9a4560" />
        <path d="M20 72c8-5 16-4 24-1s14 2 22-2v7H20Z" fill="#782b45" />
      </g>
      <g transform="translate(70 18) rotate(10 22 22)">
        <circle cx="30" cy="40" r="24" fill="#342729" stroke={ink} strokeWidth="2" />
        <circle cx="30" cy="40" r="17" fill="none" stroke="#fffdf9" strokeOpacity=".28" strokeWidth="1.2" />
        <circle cx="30" cy="40" r="10" fill="#782b45" />
        <circle cx="30" cy="40" r="2.2" fill="#fbf7f2" />
      </g>
      <g fill="none" stroke="#782b45" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M82 22v-12l14-3v12" />
      </g>
      <g fill="#782b45">
        <circle cx="79" cy="23" r="4" />
        <circle cx="93" cy="19" r="4" />
      </g>
      <path d="M100 84l2.2 5 5 2.2-5 2.2-2.2 5-2.2-5-5-2.2 5-2.2Z" fill="#b99161" />
    </svg>
  );
}

export function StepSendArt(props: IconProps) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden focusable={false} {...props}>
      <rect x="36" y="10" width="48" height="96" rx="9" fill="#fffdf9" stroke={ink} strokeWidth="2" />
      <rect x="42" y="22" width="36" height="68" rx="3" fill="#f3dfe2" />
      <rect x="49" y="94" width="22" height="3" rx="1.5" fill={ink} opacity=".5" />
      <g transform="translate(46 44)">
        <rect width="28" height="20" rx="2.4" fill="#fbf1e2" stroke={ink} strokeWidth="1.8" />
        <path d="m1.5 2 12.5 10L26.5 2" fill="none" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="14" cy="14" r="3.6" fill="#782b45" />
      </g>
      <path d="M96 38c8 0 14 6 14 14s-6 14-14 14" fill="none" stroke="#782b45" strokeWidth="3" strokeLinecap="round" opacity=".9" />
      <path d="M92 31l8 7-8 7" fill="none" stroke="#782b45" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 70c-8 0-14-6-14-14s6-14 14-14M22 58h16" fill="none" stroke="#b99161" strokeWidth="3" strokeLinecap="round" />
      <path d="m100 88 2 4.6 4.6 2-4.6 2-2 4.6-2-4.6-4.6-2 4.6-2Z" fill="#b99161" />
    </svg>
  );
}
