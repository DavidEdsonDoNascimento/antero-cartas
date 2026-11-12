/**
 * Camadas SVG do envelope, compartilhadas pela hero da landing
 * (`landing/EnvelopeScene`) e pelo envelope das cartas (`presentation/Envelope`).
 *
 * Só geometria e cor: nenhuma classe de estado, nenhum texto. A hero passa
 * `LANDING_ENVELOPE_COLORS` e os ids históricos (`pl-liner-a`…), e o HTML dela
 * continua idêntico ao de antes da extração — `envelopeArt.test.tsx` compara
 * com `landing/__fixtures__/envelopeScene.html`.
 *
 * Ids de `<defs>` precisam ser únicos na página: cada envelope recebe o seu
 * prefixo (`ids`), senão o segundo envelope pintaria com o gradiente do primeiro.
 */

/** Aba voltada para baixo (fechada): vértice em y=186 de um envelope de 560×336. */
export const FLAP_OUT = "4,2 556,2 280,184";

export interface EnvelopeColors {
  liner: string;
  linerMark: string;
  shade: string;
  flapInEdge: [string, string];
  flapOut: [string, string];
  side: [string, string];
  bottom: [string, string];
  stitch: string;
  topLine: string;
  highlight: string;
  crease: string;
  creaseSoft: string;
}

/** As cores exatas da hero (D76). Não mude sem atualizar a captura da landing. */
export const LANDING_ENVELOPE_COLORS: EnvelopeColors = {
  liner: "#6a2540",
  linerMark: "#b99161",
  shade: "#1c0710",
  flapInEdge: ["#efdcc4", "#f9efe2"],
  flapOut: ["#fbf2e6", "#ecd9c0"],
  side: ["#f3e6d2", "#e0c8a9"],
  bottom: ["#fbf3e7", "#eedfc9"],
  stitch: "#b99161",
  topLine: "#d4bb98",
  highlight: "#fffaf1",
  crease: "#c9ad88",
  creaseSoft: "#caa981",
};

export interface EnvelopeIds {
  linerA: string;
  linerShade: string;
  linerB: string;
  flapInEdge: string;
  flapInShade: string;
  sideL: string;
  sideR: string;
  bottom: string;
  blur: string;
  flapOut: string;
}

export const LANDING_ENVELOPE_IDS: EnvelopeIds = {
  linerA: "pl-liner-a",
  linerShade: "pl-liner-shade",
  linerB: "pl-liner-b",
  flapInEdge: "pl-flap-in-edge",
  flapInShade: "pl-flap-in-shade",
  sideL: "pl-side-l",
  sideR: "pl-side-r",
  bottom: "pl-bottom",
  blur: "pl-blur7",
  flapOut: "pl-flap-out-g",
};

export function envelopeIds(prefix: string): EnvelopeIds {
  return {
    linerA: `${prefix}-liner-a`,
    linerShade: `${prefix}-liner-shade`,
    linerB: `${prefix}-liner-b`,
    flapInEdge: `${prefix}-flap-in-edge`,
    flapInShade: `${prefix}-flap-in-shade`,
    sideL: `${prefix}-side-l`,
    sideR: `${prefix}-side-r`,
    bottom: `${prefix}-bottom`,
    blur: `${prefix}-blur7`,
    flapOut: `${prefix}-flap-out-g`,
  };
}

interface LayerProps {
  className: string;
  colors: EnvelopeColors;
  ids: EnvelopeIds;
}

function LinerPattern({ id, colors }: { id: string; colors: EnvelopeColors }) {
  return (
    <pattern id={id} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="16" height="16" fill={colors.liner} />
      <path d="M8 3.2 12.8 8 8 12.8 3.2 8Z" fill="none" stroke={colors.linerMark} strokeOpacity=".5" strokeWidth=".9" />
      <circle cx="8" cy="8" r="1" fill={colors.linerMark} fillOpacity=".6" />
    </pattern>
  );
}

/** 1 — fundo do envelope: forro com padrão. */
export function EnvelopeBack({ className, colors, ids }: LayerProps) {
  return (
    <svg className={className} viewBox="0 0 560 336" focusable="false">
      <defs>
        <LinerPattern id={ids.linerA} colors={colors} />
        <linearGradient id={ids.linerShade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.shade} stopOpacity=".5" />
          <stop offset=".55" stopColor={colors.shade} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="560" height="336" rx="9" fill={`url(#${ids.linerA})`} />
      <rect width="560" height="336" rx="9" fill={`url(#${ids.linerShade})`} />
    </svg>
  );
}

/** 2 — aba aberta (face de dentro, voltada para cima). */
export function EnvelopeFlapIn({ className, colors, ids }: LayerProps) {
  return (
    <svg className={className} viewBox="0 0 560 186" focusable="false">
      <defs>
        <LinerPattern id={ids.linerB} colors={colors} />
        <linearGradient id={ids.flapInEdge} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={colors.flapInEdge[0]} />
          <stop offset="1" stopColor={colors.flapInEdge[1]} />
        </linearGradient>
        <linearGradient id={ids.flapInShade} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={colors.shade} stopOpacity=".55" />
          <stop offset=".7" stopColor={colors.shade} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points="4,184 556,184 280,2" fill={`url(#${ids.flapInEdge})`} stroke={`url(#${ids.flapInEdge})`} strokeWidth="8" strokeLinejoin="round" />
      <polygon points="38,174 522,174 280,36" fill={`url(#${ids.linerB})`} />
      <polygon points="38,174 522,174 280,36" fill={`url(#${ids.flapInShade})`} />
      <polygon points="38,174 522,174 280,36" fill="none" stroke={colors.linerMark} strokeOpacity=".55" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** 4 — bolso frontal: três painéis dobrados, com sombra no vão da carta. */
export function EnvelopePocket({ className, colors, ids }: LayerProps) {
  return (
    <svg className={className} viewBox="0 0 560 336" focusable="false">
      <defs>
        <linearGradient id={ids.sideL} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors.side[0]} />
          <stop offset="1" stopColor={colors.side[1]} />
        </linearGradient>
        <linearGradient id={ids.sideR} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.side[0]} />
          <stop offset="1" stopColor={colors.side[1]} />
        </linearGradient>
        <linearGradient id={ids.bottom} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.bottom[0]} />
          <stop offset="1" stopColor={colors.bottom[1]} />
        </linearGradient>
        <filter id={ids.blur} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g filter={`url(#${ids.blur})`} opacity=".55">
        <path d="M0 0 280 186M560 0 280 186" stroke={colors.shade} strokeWidth="9" strokeLinecap="round" fill="none" />
      </g>
      <polygon points="4,4 280,188 4,332" fill={`url(#${ids.sideL})`} stroke={`url(#${ids.sideL})`} strokeWidth="8" strokeLinejoin="round" />
      <polygon points="556,4 280,188 556,332" fill={`url(#${ids.sideR})`} stroke={`url(#${ids.sideR})`} strokeWidth="8" strokeLinejoin="round" />
      <polygon points="4,332 280,186 556,332" fill={`url(#${ids.bottom})`} stroke={`url(#${ids.bottom})`} strokeWidth="8" strokeLinejoin="round" />
      <path d="M6 334 280 188 554 334" fill="none" stroke={colors.crease} strokeWidth="1.2" opacity=".8" transform="translate(0 2)" />
      <path d="M6 332 280 186 554 332" fill="none" stroke={colors.highlight} strokeWidth="1.6" opacity=".95" />
      <path d="M3 3 280 188 557 3" fill="none" stroke={colors.highlight} strokeWidth="1.4" opacity=".85" />
      <path d="M280 188 4 332M280 188 556 332" fill="none" stroke={colors.creaseSoft} strokeWidth="1" opacity=".5" />
    </svg>
  );
}

/** 6 — aba fechada, com pespontos. */
export function EnvelopeFlapOut({ className, colors, ids }: LayerProps) {
  return (
    <svg className={className} viewBox="0 0 560 186" focusable="false">
      <defs>
        <linearGradient id={ids.flapOut} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.flapOut[0]} />
          <stop offset="1" stopColor={colors.flapOut[1]} />
        </linearGradient>
      </defs>
      <polygon points={FLAP_OUT} fill={`url(#${ids.flapOut})`} stroke={`url(#${ids.flapOut})`} strokeWidth="8" strokeLinejoin="round" />
      <polygon points="34,16 526,16 280,160" fill="none" stroke={colors.stitch} strokeWidth="1.5" strokeDasharray="2 6.5" strokeLinecap="round" opacity=".75" />
      <path d="M4 3H556" stroke={colors.topLine} strokeWidth="1.6" />
      <path d="M5 3 280 184 555 3" fill="none" stroke={colors.highlight} strokeWidth="1.6" opacity=".95" />
    </svg>
  );
}
