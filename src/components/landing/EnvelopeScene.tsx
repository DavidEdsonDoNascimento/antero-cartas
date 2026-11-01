/**
 * A cena da hero: envelope, carta, fotografia, música e detalhes. Server
 * Component, 100% decorativo (`aria-hidden`): o texto do exemplo não é o
 * conteúdo da página e o leitor de tela não precisa percorrê-lo.
 *
 * Feita só de HTML + SVG + CSS (`src/styles/paper-light.css`), sem imagem
 * externa, sem biblioteca de animação e sem canvas. A abertura é comandada por
 * `data-state` em `EnvelopeStage`; aqui só existe a estrutura.
 *
 * Camadas (z-index): 1 fundo/forro · 2 aba aberta · 3 carta · 4 bolso frontal ·
 * 6 aba fechada · 7 lacre · 8+ fotografia, música, ramo e pétalas.
 *
 * O exemplo ("Ana", "Lucas") é fictício e a legenda do palco diz isso.
 */
import { NoteIcon, Petal, SunsetPhoto, Sprig, WaxSeal } from "@/components/paper-light/icons";

/** Aba voltada para baixo (fechada): vértice em y=186 de um envelope de 560×336. */
const FLAP_OUT = "4,2 556,2 280,184";

export function EnvelopeScene() {
  return (
    <div className="pl-scene" aria-hidden="true">
      <div className="pl-stage__glow" />
      <div className="pl-env-shadow" />

      <div className="pl-env">
        {/* 1 — fundo do envelope: forro de vinho com padrão dourado */}
        <svg className="pl-layer pl-layer--back" viewBox="0 0 560 336" focusable="false">
          <defs>
            <pattern id="pl-liner-a" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="16" height="16" fill="#6a2540" />
              <path d="M8 3.2 12.8 8 8 12.8 3.2 8Z" fill="none" stroke="#b99161" strokeOpacity=".5" strokeWidth=".9" />
              <circle cx="8" cy="8" r="1" fill="#b99161" fillOpacity=".6" />
            </pattern>
            <linearGradient id="pl-liner-shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1c0710" stopOpacity=".5" />
              <stop offset=".55" stopColor="#1c0710" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="560" height="336" rx="9" fill="url(#pl-liner-a)" />
          <rect width="560" height="336" rx="9" fill="url(#pl-liner-shade)" />
        </svg>

        {/* 2 — aba aberta (face de dentro, voltada para cima) */}
        <div className="pl-flap-in">
          <svg className="pl-layer" viewBox="0 0 560 186" focusable="false">
            <defs>
              <pattern id="pl-liner-b" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="16" height="16" fill="#6a2540" />
                <path d="M8 3.2 12.8 8 8 12.8 3.2 8Z" fill="none" stroke="#b99161" strokeOpacity=".5" strokeWidth=".9" />
                <circle cx="8" cy="8" r="1" fill="#b99161" fillOpacity=".6" />
              </pattern>
              <linearGradient id="pl-flap-in-edge" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#efdcc4" />
                <stop offset="1" stopColor="#f9efe2" />
              </linearGradient>
              <linearGradient id="pl-flap-in-shade" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#1c0710" stopOpacity=".55" />
                <stop offset=".7" stopColor="#1c0710" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points="4,184 556,184 280,2" fill="url(#pl-flap-in-edge)" stroke="url(#pl-flap-in-edge)" strokeWidth="8" strokeLinejoin="round" />
            <polygon points="38,174 522,174 280,36" fill="url(#pl-liner-b)" />
            <polygon points="38,174 522,174 280,36" fill="url(#pl-flap-in-shade)" />
            <polygon points="38,174 522,174 280,36" fill="none" stroke="#b99161" strokeOpacity=".55" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </div>

        {/* 3 — a carta (sai do envelope) */}
        <div className="pl-letter-clip">
          <div className="pl-letter">
            <p className="pl-letter__to">Para Ana,</p>
            <p className="pl-letter__text">Se eu pudesse escolher de novo, escolheria você mil vezes.</p>
            <p className="pl-letter__sign">Lucas</p>
          </div>
        </div>

        {/* 4 — bolso frontal: três painéis dobrados, com sombra no vão da carta */}
        <svg className="pl-layer pl-pocket" viewBox="0 0 560 336" focusable="false">
          <defs>
            <linearGradient id="pl-side-l" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f3e6d2" />
              <stop offset="1" stopColor="#e0c8a9" />
            </linearGradient>
            <linearGradient id="pl-side-r" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f3e6d2" />
              <stop offset="1" stopColor="#e0c8a9" />
            </linearGradient>
            <linearGradient id="pl-bottom" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbf3e7" />
              <stop offset="1" stopColor="#eedfc9" />
            </linearGradient>
            <filter id="pl-blur7" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>
          <g filter="url(#pl-blur7)" opacity=".55">
            <path d="M0 0 280 186M560 0 280 186" stroke="#1c0710" strokeWidth="9" strokeLinecap="round" fill="none" />
          </g>
          <polygon points="4,4 280,188 4,332" fill="url(#pl-side-l)" stroke="url(#pl-side-l)" strokeWidth="8" strokeLinejoin="round" />
          <polygon points="556,4 280,188 556,332" fill="url(#pl-side-r)" stroke="url(#pl-side-r)" strokeWidth="8" strokeLinejoin="round" />
          <polygon points="4,332 280,186 556,332" fill="url(#pl-bottom)" stroke="url(#pl-bottom)" strokeWidth="8" strokeLinejoin="round" />
          <path d="M6 334 280 188 554 334" fill="none" stroke="#c9ad88" strokeWidth="1.2" opacity=".8" transform="translate(0 2)" />
          <path d="M6 332 280 186 554 332" fill="none" stroke="#fffaf1" strokeWidth="1.6" opacity=".95" />
          <path d="M3 3 280 188 557 3" fill="none" stroke="#fffaf1" strokeWidth="1.4" opacity=".85" />
          <path d="M280 188 4 332M280 188 556 332" fill="none" stroke="#caa981" strokeWidth="1" opacity=".5" />
        </svg>
        <div className="pl-sheen" />

        {/* 6 — aba fechada, com pespontos dourados */}
        <div className="pl-flap-out">
          <svg className="pl-layer" viewBox="0 0 560 186" focusable="false">
            <defs>
              <linearGradient id="pl-flap-out-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fbf2e6" />
                <stop offset="1" stopColor="#ecd9c0" />
              </linearGradient>
            </defs>
            <polygon points={FLAP_OUT} fill="url(#pl-flap-out-g)" stroke="url(#pl-flap-out-g)" strokeWidth="8" strokeLinejoin="round" />
            <polygon points="34,16 526,16 280,160" fill="none" stroke="#b99161" strokeWidth="1.5" strokeDasharray="2 6.5" strokeLinecap="round" opacity=".75" />
            <path d="M4 3H556" stroke="#d4bb98" strokeWidth="1.6" />
            <path d="M5 3 280 184 555 3" fill="none" stroke="#fffaf1" strokeWidth="1.6" opacity=".95" />
          </svg>
        </div>

        {/* 7 — lacre de cera sobre a ponta da aba */}
        <WaxSeal className="pl-seal" idSuffix="stage" />
      </div>

      {/* Fotografia, música e detalhes que acompanham a carta */}
      <div className="pl-photo">
        <span className="pl-photo__tape" />
        <SunsetPhoto className="pl-photo__img" />
      </div>
      <div className="pl-chip">
        <span className="pl-chip__disc">
          <NoteIcon />
        </span>
        A música de vocês
      </div>
      <Sprig className="pl-sprig" />
      <Petal className="pl-petal pl-petal--1" idSuffix="1" />
      <Petal className="pl-petal pl-petal--2" idSuffix="2" />
      <Petal className="pl-petal pl-petal--3" idSuffix="3" />
    </div>
  );
}
