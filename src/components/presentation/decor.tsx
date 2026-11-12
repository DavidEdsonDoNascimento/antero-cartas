/**
 * Ilustrações originais das cenas (rosas, velas, morangos, flores, ramos).
 * SVG puro, sem imagem externa e sem biblioteca. Todas decorativas
 * (`aria-hidden`): o que importa para quem usa leitor de tela é o texto da
 * carta, não a mesa.
 *
 * `uid` namespaceia os `<defs>`: a mesma peça pode aparecer duas vezes na
 * página (prévia do editor + "ver como vai abrir") e um gradiente definido num
 * SVG escondido deixa de pintar nos outros em alguns navegadores.
 */
import type { CSSProperties } from "react";

interface DecorProps {
  uid: string;
  className?: string;
  style?: CSSProperties;
}

const svgBase = { "aria-hidden": true, focusable: false } as const;

/* ---------------------------------------------------------------- Rosa --- */

export interface RoseColors {
  light: string;
  mid: string;
  dark: string;
}

/** Rosa vista de cima: pétalas em camadas e o miolo em espiral. */
export function Rose({ uid, colors, className, style }: DecorProps & { colors: RoseColors }) {
  const g = `${uid}-rose`;
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} {...svgBase}>
      <defs>
        <radialGradient id={`${g}-o`} cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor={colors.mid} />
          <stop offset="1" stopColor={colors.dark} />
        </radialGradient>
        <radialGradient id={`${g}-p`} cx="50%" cy="20%" r="85%">
          <stop offset="0" stopColor={colors.light} />
          <stop offset=".55" stopColor={colors.mid} />
          <stop offset="1" stopColor={colors.dark} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill={`url(#${g}-o)`} />
      {petals.map((deg) => (
        <ellipse
          key={deg}
          cx="50"
          cy="29"
          rx="19"
          ry="24"
          fill={`url(#${g}-p)`}
          opacity=".92"
          transform={`rotate(${deg + 15} 50 50)`}
        />
      ))}
      {petals.map((deg) => (
        <ellipse
          key={`i${deg}`}
          cx="50"
          cy="38"
          rx="12"
          ry="15"
          fill={`url(#${g}-p)`}
          transform={`rotate(${deg + 45} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="13" fill={colors.dark} />
      <path
        d="M50 43c6 0 9 5 5 9-5 5-13 1-12-6 1-9 15-11 20-2 4 8-2 17-11 18"
        fill="none"
        stroke={colors.light}
        strokeOpacity=".75"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Folha com nervura: acompanha rosas e buquês. */
export function Leaf({ uid, color, className, style }: DecorProps & { color: string }) {
  const g = `${uid}-leaf`;
  return (
    <svg viewBox="0 0 80 32" className={className} style={style} {...svgBase}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".95" />
          <stop offset="1" stopColor={color} stopOpacity=".7" />
        </linearGradient>
      </defs>
      <path d="M2 16C20 0 54 0 78 16 54 32 20 32 2 16Z" fill={`url(#${g})`} />
      <path d="M4 16H72M24 16l10-7M24 16l10 7M44 16l10-6M44 16l10 6" stroke="#fff" strokeOpacity=".35" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Buquê deitado: três rosas, folhas e uma fita. */
export function RoseBouquet({
  uid,
  rose,
  leaf,
  ribbon,
  className,
  style,
}: DecorProps & { rose: RoseColors; leaf: string; ribbon: string }) {
  return (
    <div className={className} style={style} aria-hidden="true">
      <svg viewBox="0 0 200 140" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} {...svgBase}>
        <path d="M24 128C60 104 96 88 150 66" stroke="#5f7a4e" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M30 132C70 112 104 100 160 88" stroke="#56704a" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <path d="M20 122C56 92 98 70 140 44" stroke="#5f7a4e" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <path d="M58 120c6-10 20-14 26-8-4 8-18 14-26 8Z" fill={ribbon} />
        <path d="M58 120c-10-4-18 2-20 10 10 2 18-2 20-10Z" fill={ribbon} opacity=".85" />
        <path d="M58 120c4 6 2 14-6 18" stroke={ribbon} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </svg>
      <Leaf uid={`${uid}-l1`} color={leaf} style={{ position: "absolute", left: "38%", top: "18%", width: "30%", rotate: "-38deg" }} />
      <Leaf uid={`${uid}-l2`} color={leaf} style={{ position: "absolute", left: "58%", top: "52%", width: "26%", rotate: "8deg" }} />
      <Leaf uid={`${uid}-l3`} color={leaf} style={{ position: "absolute", left: "30%", top: "58%", width: "24%", rotate: "160deg" }} />
      <Rose uid={`${uid}-r1`} colors={rose} style={{ position: "absolute", left: "56%", top: "6%", width: "34%" }} />
      <Rose uid={`${uid}-r2`} colors={rose} style={{ position: "absolute", left: "70%", top: "38%", width: "28%", rotate: "40deg" }} />
      <Rose uid={`${uid}-r3`} colors={rose} style={{ position: "absolute", left: "44%", top: "34%", width: "30%", rotate: "-20deg" }} />
    </div>
  );
}

/* -------------------------------------------------------------- Vela ---- */

/** Vela com chama. O brilho é uma camada CSS (`.ps-glow`) atrás, mais barata que filtro SVG. */
export function Candle({
  uid,
  wax,
  className,
  style,
  height = 120,
}: DecorProps & { wax: [string, string]; height?: number }) {
  const g = `${uid}-candle`;
  const top = 160 - height;
  return (
    <svg viewBox="0 0 60 200" className={className} style={style} {...svgBase}>
      <defs>
        <linearGradient id={`${g}-w`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={wax[1]} />
          <stop offset=".35" stopColor={wax[0]} />
          <stop offset=".8" stopColor={wax[0]} />
          <stop offset="1" stopColor={wax[1]} />
        </linearGradient>
        <radialGradient id={`${g}-f`} cx="50%" cy="70%" r="60%">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset=".45" stopColor="#ffd77a" />
          <stop offset="1" stopColor="#f08a3c" stopOpacity=".9" />
        </radialGradient>
      </defs>
      <ellipse cx="30" cy="196" rx="24" ry="4" fill="#000" opacity=".18" />
      <rect x="10" y={top} width="40" height={height + 34} rx="6" fill={`url(#${g}-w)`} />
      <ellipse cx="30" cy={top + 1} rx="20" ry="4.5" fill={wax[0]} />
      <ellipse cx="30" cy={top + 1} rx="14" ry="2.6" fill={wax[1]} opacity=".45" />
      <path d={`M22 ${top + 2}c0 8 3 12 4 18`} stroke={wax[0]} strokeWidth="3" strokeLinecap="round" opacity=".9" />
      <path d={`M30 ${top}v-8`} stroke="#3a2a22" strokeWidth="1.8" strokeLinecap="round" />
      <path className="ps-flame" d={`M30 ${top - 36}c7 9 9 16 6 22-2 4-10 4-12 0-3-6-1-13 6-22Z`} fill={`url(#${g}-f)`} />
    </svg>
  );
}

/* ----------------------------------------------------------- Morangos --- */

export function Strawberry({ uid, className, style }: DecorProps) {
  const g = `${uid}-straw`;
  const seeds: [number, number][] = [
    [22, 22], [32, 20], [42, 23], [17, 32], [27, 31], [37, 30], [47, 32],
    [22, 41], [32, 40], [42, 41], [27, 50], [37, 49], [32, 58],
  ];
  return (
    <svg viewBox="0 0 64 72" className={className} style={style} {...svgBase}>
      <defs>
        <radialGradient id={g} cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset=".6" stopColor="#d7263d" />
          <stop offset="1" stopColor="#8e1325" />
        </radialGradient>
      </defs>
      <path d="M32 70C14 60 4 40 8 24 11 13 22 11 32 14c10-3 21-1 24 10 4 16-6 36-24 46Z" fill={`url(#${g})`} />
      {seeds.map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="1.2" ry="1.9" fill="#f6d77a" opacity=".9" />
      ))}
      <path d="M32 16 20 8l9 2-5-9 8 7 2-8 3 8 7-6-4 9 9-2-11 8Z" fill="#4f7d3a" />
      <path d="M32 9V1" stroke="#4f7d3a" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="22" cy="28" rx="5" ry="9" fill="#fff" opacity=".18" transform="rotate(20 22 28)" />
    </svg>
  );
}

/** Pratinho com morangos. */
export function StrawberryDish({ uid, rim, className, style }: DecorProps & { rim: string }) {
  return (
    <div className={className} style={style} aria-hidden="true">
      <svg viewBox="0 0 200 90" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} {...svgBase}>
        <ellipse cx="100" cy="62" rx="96" ry="26" fill="#000" opacity=".12" />
        <ellipse cx="100" cy="56" rx="94" ry="26" fill="#fffdf9" />
        <ellipse cx="100" cy="56" rx="94" ry="26" fill="none" stroke={rim} strokeWidth="2.4" />
        <ellipse cx="100" cy="54" rx="70" ry="17" fill="#f4ede4" />
      </svg>
      <Strawberry uid={`${uid}-s1`} style={{ position: "absolute", left: "22%", bottom: "26%", width: "26%", rotate: "-24deg" }} />
      <Strawberry uid={`${uid}-s2`} style={{ position: "absolute", left: "42%", bottom: "32%", width: "28%", rotate: "6deg" }} />
      <Strawberry uid={`${uid}-s3`} style={{ position: "absolute", left: "60%", bottom: "24%", width: "24%", rotate: "34deg" }} />
    </div>
  );
}

/* --------------------------------------------------------------- Flores --- */

/** Flor de cinco pétalas (cerejeira). */
export function Blossom({ uid, petal, center, className, style }: DecorProps & { petal: string; center: string }) {
  const g = `${uid}-bl`;
  return (
    <svg viewBox="0 0 40 40" className={className} style={style} {...svgBase}>
      <defs>
        <radialGradient id={g} cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor={petal} />
        </radialGradient>
      </defs>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cx="20" cy="10.5" rx="7" ry="9" fill={`url(#${g})`} transform={`rotate(${deg} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="3.6" fill={center} />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <circle key={deg} cx="20" cy="14.5" r=".9" fill={center} transform={`rotate(${deg} 20 20)`} />
      ))}
    </svg>
  );
}

/** Galho com flores: enquadra os cantos da cena Floral. */
export function BlossomBranch({
  uid,
  petal,
  center,
  bark,
  className,
  style,
}: DecorProps & { petal: string; center: string; bark: string }) {
  const flowers: [number, number, number][] = [
    [84, -2, 16], [62, 8, 22], [44, 22, 18], [74, 30, 16], [28, 40, 20], [52, 48, 14], [14, 62, 16], [36, 70, 12],
  ];
  return (
    <div className={className} style={style} aria-hidden="true">
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} {...svgBase}>
        <path d="M100 2C76 14 54 30 34 52 22 66 12 80 2 98" stroke={bark} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M58 30C64 36 72 38 80 36M36 50c-4 8-4 16 0 22M70 18c4 4 6 8 6 14" stroke={bark} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      {flowers.map(([x, y, w], i) => (
        <Blossom
          key={i}
          uid={`${uid}-${i}`}
          petal={petal}
          center={center}
          style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: `${w}%`, rotate: `${i * 37}deg` }}
        />
      ))}
    </div>
  );
}

/** Margarida: miolo dourado e pétalas finas. */
export function Daisy({ uid, petal = "#ffffff", center = "#e8b64c", className, style }: DecorProps & { petal?: string; center?: string }) {
  const g = `${uid}-dz`;
  return (
    <svg viewBox="0 0 40 40" className={className} style={style} {...svgBase}>
      <defs>
        <radialGradient id={g} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffe28a" />
          <stop offset="1" stopColor={center} />
        </radialGradient>
      </defs>
      {Array.from({ length: 14 }, (_, i) => (
        <ellipse key={i} cx="20" cy="9" rx="2.6" ry="8" fill={petal} stroke="#000" strokeOpacity=".06" transform={`rotate(${(i * 360) / 14} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="5" fill={`url(#${g})`} />
    </svg>
  );
}

/** Ramalhete de flores do campo (Floral). */
export function Wildflowers({ uid, accent, className, style }: DecorProps & { accent: string }) {
  return (
    <div className={className} style={style} aria-hidden="true">
      <svg viewBox="0 0 120 140" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} {...svgBase}>
        <g stroke="#6f8a5a" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M60 138C58 110 46 70 30 40" />
          <path d="M60 138C62 104 66 64 84 30" />
          <path d="M60 138C60 100 58 70 60 22" />
          <path d="M60 138C52 116 40 100 16 86" />
          <path d="M60 138C70 118 86 104 106 96" />
        </g>
        <g fill="#8aa572">
          <ellipse cx="42" cy="96" rx="9" ry="4" transform="rotate(-40 42 96)" />
          <ellipse cx="76" cy="90" rx="9" ry="4" transform="rotate(36 76 90)" />
          <ellipse cx="58" cy="70" rx="8" ry="3.6" transform="rotate(-70 58 70)" />
        </g>
        <path d="M44 126c10 6 22 6 32 0l-4 10H48Z" fill={accent} opacity=".85" />
      </svg>
      <Daisy uid={`${uid}-d1`} style={{ position: "absolute", left: "14%", top: "18%", width: "30%" }} />
      <Daisy uid={`${uid}-d2`} style={{ position: "absolute", left: "58%", top: "12%", width: "26%" }} />
      <Blossom uid={`${uid}-b1`} petal="#f4b6c6" center="#c9718a" style={{ position: "absolute", left: "38%", top: "4%", width: "24%" }} />
      <Blossom uid={`${uid}-b2`} petal="#f7cdd8" center="#b0506f" style={{ position: "absolute", left: "2%", top: "52%", width: "20%" }} />
      <Daisy uid={`${uid}-d3`} style={{ position: "absolute", left: "76%", top: "56%", width: "20%" }} />
    </div>
  );
}

/* ------------------------------------------------------- Ramos e vasos --- */

/** Ramo de eucalipto: folhas redondas ao longo do caule. */
export function Eucalyptus({ uid, color, className, style }: DecorProps & { color: string }) {
  const g = `${uid}-eu`;
  const leaves: [number, number, number][] = [
    [18, 128, 12], [36, 112, 11], [20, 96, 11], [40, 82, 10], [26, 66, 10], [44, 54, 9], [34, 38, 8], [48, 26, 7],
  ];
  return (
    <svg viewBox="0 0 70 150" className={className} style={style} {...svgBase}>
      <defs>
        <radialGradient id={g} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M30 148C30 110 34 70 54 10" stroke="#7d8a6a" strokeWidth="2" fill="none" strokeLinecap="round" />
      {leaves.map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill={color} />
          <circle cx={x} cy={y} r={r} fill={`url(#${g})`} />
        </g>
      ))}
    </svg>
  );
}

/** Vaso de cerâmica com um ou dois galhos. */
export function BudVase({ uid, glaze, bud, className, style }: DecorProps & { glaze: [string, string]; bud: string }) {
  const g = `${uid}-vase`;
  return (
    <svg viewBox="0 0 80 200" className={className} style={style} {...svgBase}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={glaze[1]} />
          <stop offset=".4" stopColor={glaze[0]} />
          <stop offset="1" stopColor={glaze[1]} />
        </linearGradient>
      </defs>
      <path d="M40 132C38 96 30 50 16 12M40 132C44 92 52 56 64 30" stroke="#6f7a5a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {[
        [16, 12], [22, 34], [27, 56], [64, 30], [58, 50],
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="4" ry="6.5" fill={bud} transform={`rotate(${i % 2 ? 24 : -20} ${x} ${y})`} />
      ))}
      <ellipse cx="40" cy="196" rx="26" ry="4" fill="#000" opacity=".14" />
      <path d="M30 126h20c2 10 16 22 16 42 0 18-12 28-26 28s-26-10-26-28c0-20 14-32 16-42Z" fill={`url(#${g})`} />
      <ellipse cx="40" cy="126" rx="10" ry="2.6" fill={glaze[1]} />
      <path d="M24 160c2-10 8-18 12-22" stroke="#fff" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Pétala solta sobre a mesa. */
export function LoosePetal({ uid, colors, className, style }: DecorProps & { colors: [string, string] }) {
  const g = `${uid}-lp`;
  return (
    <svg viewBox="0 0 40 52" className={className} style={style} {...svgBase}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
      </defs>
      <path d="M20 2C34 10 40 28 32 42c-5 8-19 8-24 0C0 28 6 10 20 2Z" fill={`url(#${g})`} />
      <path d="M20 8c-2 12-2 24 0 36" stroke="#fff" strokeOpacity=".35" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

/** Estrela de quatro pontas (brilho e confete dourado). */
export function Sparkle({ color, className, style }: { color: string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 20 20" className={className} style={style} {...svgBase}>
      <path d="M10 0c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10Z" fill={color} />
    </svg>
  );
}

/** Borboleta: as asas batem por `scaleX` (CSS), sem JavaScript. */
export function Butterfly({ uid, wings, className, style }: DecorProps & { wings: [string, string] }) {
  const g = `${uid}-bf`;
  return (
    <svg viewBox="0 0 60 44" className={className} style={style} {...svgBase}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={wings[0]} />
          <stop offset="1" stopColor={wings[1]} />
        </linearGradient>
      </defs>
      <g className="ps-wing ps-wing--l">
        <path d="M29 22C20 4 4 0 2 10c-2 9 10 14 27 12Z" fill={`url(#${g})`} />
        <path d="M29 24C16 26 8 34 12 40c4 5 14 0 17-16Z" fill={`url(#${g})`} opacity=".85" />
      </g>
      <g className="ps-wing ps-wing--r">
        <path d="M31 22C40 4 56 0 58 10c2 9-10 14-27 12Z" fill={`url(#${g})`} />
        <path d="M31 24c13 2 21 10 17 16-4 5-14 0-17-16Z" fill={`url(#${g})`} opacity=".85" />
      </g>
      <rect x="28.6" y="12" width="2.8" height="22" rx="1.4" fill="#3a2a2e" />
      <path d="M30 12c-2-6-5-9-8-10M30 12c2-6 5-9 8-10" stroke="#3a2a2e" strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Xícara de chá com pires e um fio de vapor (Papel e Luz). */
export function Teacup({ uid, glaze, rim, className, style }: DecorProps & { glaze: [string, string]; rim: string }) {
  const g = `${uid}-cup`;
  return (
    <svg viewBox="0 0 140 110" className={className} style={style} {...svgBase}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={glaze[1]} />
          <stop offset=".45" stopColor={glaze[0]} />
          <stop offset="1" stopColor={glaze[1]} />
        </linearGradient>
      </defs>
      <ellipse cx="70" cy="98" rx="62" ry="9" fill="#000" opacity=".12" />
      <ellipse cx="70" cy="92" rx="60" ry="12" fill={glaze[0]} />
      <ellipse cx="70" cy="92" rx="60" ry="12" fill="none" stroke={rim} strokeWidth="1.6" />
      <ellipse cx="70" cy="90" rx="34" ry="6" fill={glaze[1]} opacity=".6" />
      <path d="M30 44h80c0 26-14 44-40 44S30 70 30 44Z" fill={`url(#${g})`} />
      <path d="M110 52c14-2 20 6 16 14s-14 8-20 6" fill="none" stroke={glaze[1]} strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="70" cy="44" rx="40" ry="8" fill={glaze[0]} />
      <ellipse cx="70" cy="45" rx="34" ry="5.6" fill="#b98a5c" />
      <ellipse cx="70" cy="44" rx="40" ry="8" fill="none" stroke={rim} strokeWidth="1.6" />
      <path d="M38 56c4 14 12 22 24 26" stroke="#fff" strokeOpacity=".4" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path className="ps-steam" d="M62 34c-6-8 6-12 0-22M78 34c-6-8 6-12 0-22" fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
