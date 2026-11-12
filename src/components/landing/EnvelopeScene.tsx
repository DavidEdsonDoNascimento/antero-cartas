/**
 * A cena da hero: envelope, carta, fotografia, música e detalhes. Server
 * Component, 100% decorativo (`aria-hidden`): o texto do exemplo não é o
 * conteúdo da página e o leitor de tela não precisa percorrê-lo.
 *
 * Feita só de HTML + SVG + CSS (`src/styles/paper-light.css`), sem imagem
 * externa, sem biblioteca de animação e sem canvas. As camadas do envelope vêm
 * de `presentation/envelopeArt` (as mesmas das cartas), com as cores e os ids
 * históricos da hero: o HTML gerado é idêntico ao anterior à extração. A abertura é comandada por
 * `data-state` em `EnvelopeStage`; aqui só existe a estrutura.
 *
 * Camadas (z-index): 1 fundo/forro · 2 aba aberta · 3 carta · 4 bolso frontal ·
 * 6 aba fechada · 7 lacre · 8+ fotografia, música, ramo e pétalas.
 *
 * O exemplo ("Ana", "Lucas") é fictício e a legenda do palco diz isso.
 */
import { NoteIcon, Petal, SunsetPhoto, Sprig, WaxSeal } from "@/components/paper-light/icons";
import {
  EnvelopeBack,
  EnvelopeFlapIn,
  EnvelopeFlapOut,
  EnvelopePocket,
  LANDING_ENVELOPE_COLORS as C,
  LANDING_ENVELOPE_IDS as IDS,
} from "@/components/presentation/envelopeArt";

export function EnvelopeScene() {
  return (
    <div className="pl-scene" aria-hidden="true">
      <div className="pl-stage__glow" />
      <div className="pl-env-shadow" />

      <div className="pl-env">
        {/* 1 — fundo do envelope: forro de vinho com padrão dourado */}
        <EnvelopeBack className="pl-layer pl-layer--back" colors={C} ids={IDS} />

        {/* 2 — aba aberta (face de dentro, voltada para cima) */}
        <div className="pl-flap-in">
          <EnvelopeFlapIn className="pl-layer" colors={C} ids={IDS} />
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
        <EnvelopePocket className="pl-layer pl-pocket" colors={C} ids={IDS} />
        <div className="pl-sheen" />

        {/* 6 — aba fechada, com pespontos dourados */}
        <div className="pl-flap-out">
          <EnvelopeFlapOut className="pl-layer" colors={C} ids={IDS} />
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
