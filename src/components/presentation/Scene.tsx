/**
 * Cenário de um estilo: parede, luz, mesa e a decoração própria dele.
 *
 * Server-safe (sem estado nem efeito): a página do destinatário e a prévia
 * pública o renderizam no servidor e passam pronto para o lado do cliente, sem
 * somar o desenho ao JavaScript. 100% decorativo (`aria-hidden`).
 *
 * As posições e tamanhos ficam em `src/styles/presentation.css`, em unidades
 * da própria cena (`--s`, 1% do menor lado), para a mesma composição servir no
 * celular em pé, no desktop e na moldura de prévia do editor.
 *
 * Cada estilo é uma composição diferente, não uma troca de cor:
 * - Papel e Luz: luz de janela em faixas, linho claro, xícara de chá, ramos e pétalas;
 * - Romântico: toalha rosada, buquê de rosas, velas e morangos, confete dourado;
 * - Romântico Noturno: mesa escura, três velas acesas, rosas escuras, brilho;
 * - Floral: galhos floridos nos cantos e um ramalhete de flores do campo;
 * - Delicado: linho creme, um vaso com um galho e um fio dourado.
 */
import type { PresentationId } from "@/content/presentation/presets";
import { Sprig } from "@/components/paper-light/icons";
import {
  BlossomBranch,
  BudVase,
  Candle,
  Eucalyptus,
  LoosePetal,
  Rose,
  RoseBouquet,
  Sparkle,
  StrawberryDish,
  Teacup,
  Wildflowers,
} from "./decor";

const PETAL_ROSE: [string, string] = ["#f3d3d8", "#d99aa6"];
const PETAL_RED: [string, string] = ["#e06a83", "#9b2f4f"];
const PETAL_DARK: [string, string] = ["#a2354f", "#5e1730"];
const PETAL_PINK: [string, string] = ["#fbe0e8", "#e8a6b9"];

function PapelLuz({ uid }: { uid: string }) {
  return (
    <>
      <div className="ps-d ps-window" />
      <Sprig className="ps-d ps-d-sprig" />
      <Sprig className="ps-d ps-d-sprig2" />
      <div className="ps-d ps-window ps-window--2" />
      <Teacup uid={`${uid}-t`} glaze={["#fffaf3", "#e6d6c2"]} rim="#c9a45c" className="ps-d ps-d-cup" />
      <LoosePetal uid={`${uid}-p1`} colors={PETAL_ROSE} className="ps-d ps-d-p1" />
      <LoosePetal uid={`${uid}-p2`} colors={PETAL_ROSE} className="ps-d ps-d-p2" />
      <LoosePetal uid={`${uid}-p3`} colors={PETAL_ROSE} className="ps-d ps-d-p3" />
    </>
  );
}

function Romantico({ uid }: { uid: string }) {
  return (
    <>
      <div className="ps-d ps-glow ps-d-glow1" />
      <div className="ps-d ps-glow ps-d-glow2" />
      <Candle uid={`${uid}-c1`} wax={["#fff6ea", "#e9d6bf"]} height={124} className="ps-d ps-d-candle1" />
      <Candle uid={`${uid}-c2`} wax={["#fff6ea", "#e9d6bf"]} height={86} className="ps-d ps-d-candle2" />
      <RoseBouquet
        uid={`${uid}-b`}
        rose={{ light: "#f07a92", mid: "#c8314f", dark: "#7c1530" }}
        leaf="#5f8a4e"
        ribbon="#c9a45c"
        className="ps-d ps-d-bouquet"
      />
      <StrawberryDish uid={`${uid}-s`} rim="#c9a45c" className="ps-d ps-d-dish" />
      <LoosePetal uid={`${uid}-p1`} colors={PETAL_RED} className="ps-d ps-d-p1" />
      <LoosePetal uid={`${uid}-p2`} colors={PETAL_RED} className="ps-d ps-d-p2" />
      <LoosePetal uid={`${uid}-p3`} colors={PETAL_RED} className="ps-d ps-d-p3" />
      <Sparkle color="#d8b46a" className="ps-d ps-d-k1" />
      <Sparkle color="#d8b46a" className="ps-d ps-d-k2" />
      <Sparkle color="#e9cf91" className="ps-d ps-d-k3" />
    </>
  );
}

function Noturno({ uid }: { uid: string }) {
  return (
    <>
      <div className="ps-d ps-glow ps-d-glow1" />
      <div className="ps-d ps-glow ps-d-glow2" />
      <div className="ps-d ps-glow ps-d-glow3" />
      <Candle uid={`${uid}-c1`} wax={["#f3e6d2", "#c9b190"]} height={132} className="ps-d ps-d-candle1" />
      <Candle uid={`${uid}-c2`} wax={["#f3e6d2", "#c9b190"]} height={96} className="ps-d ps-d-candle2" />
      <Candle uid={`${uid}-c3`} wax={["#f3e6d2", "#c9b190"]} height={70} className="ps-d ps-d-candle3" />
      <Rose uid={`${uid}-r1`} colors={{ light: "#b0465f", mid: "#7a1f36", dark: "#3d0b1b" }} className="ps-d ps-d-rose1" />
      <Rose uid={`${uid}-r2`} colors={{ light: "#b0465f", mid: "#7a1f36", dark: "#3d0b1b" }} className="ps-d ps-d-rose2" />
      <LoosePetal uid={`${uid}-p1`} colors={PETAL_DARK} className="ps-d ps-d-p1" />
      <LoosePetal uid={`${uid}-p2`} colors={PETAL_DARK} className="ps-d ps-d-p2" />
      <Sparkle color="#e2c27e" className="ps-d ps-d-k1" />
      <Sparkle color="#e2c27e" className="ps-d ps-d-k2" />
      <Sparkle color="#f1dca8" className="ps-d ps-d-k3" />
      <Sparkle color="#e2c27e" className="ps-d ps-d-k4" />
    </>
  );
}

function Floral({ uid }: { uid: string }) {
  return (
    <>
      <BlossomBranch uid={`${uid}-b1`} petal="#f5b9c8" center="#c9718a" bark="#7a5a4a" className="ps-d ps-d-branch1" />
      <BlossomBranch uid={`${uid}-b2`} petal="#f9d2dc" center="#b0506f" bark="#7a5a4a" className="ps-d ps-d-branch2" />
      <Wildflowers uid={`${uid}-w`} accent="#e8a6b9" className="ps-d ps-d-wild" />
      <LoosePetal uid={`${uid}-p1`} colors={PETAL_PINK} className="ps-d ps-d-p1" />
      <LoosePetal uid={`${uid}-p2`} colors={PETAL_PINK} className="ps-d ps-d-p2" />
      <LoosePetal uid={`${uid}-p3`} colors={PETAL_PINK} className="ps-d ps-d-p3" />
    </>
  );
}

function Delicado({ uid }: { uid: string }) {
  return (
    <>
      <div className="ps-d ps-d-frame" />
      <Eucalyptus uid={`${uid}-e`} color="#a9b59a" className="ps-d ps-d-euca" />
      <BudVase uid={`${uid}-v`} glaze={["#f4efe6", "#d6cbb9"]} bud="#c9b99c" className="ps-d ps-d-vase" />
      <Sparkle color="#c2ab84" className="ps-d ps-d-k1" />
    </>
  );
}

const COMPOSITIONS: Record<PresentationId, (p: { uid: string }) => React.ReactElement> = {
  "papel-luz": PapelLuz,
  romantico: Romantico,
  noturno: Noturno,
  floral: Floral,
  delicado: Delicado,
};

/** Estilos que esta cena sabe desenhar. O teste de presets confere contra `ready`. */
export const SCENE_STYLES = Object.keys(COMPOSITIONS) as PresentationId[];

export function Scene({
  style,
  uid,
  fixed = false,
  className = "",
}: {
  style: PresentationId;
  /** Prefixo único dos `<defs>` desta instância. */
  uid: string;
  /** Fundo da página inteira (fica parado sob o conteúdo que rola). */
  fixed?: boolean;
  className?: string;
}) {
  const Composition = COMPOSITIONS[style] ?? COMPOSITIONS["papel-luz"];
  return (
    <div
      className={`ps-scene${fixed ? " ps-scene--fixed" : ""}${className ? ` ${className}` : ""}`}
      data-style={style}
      aria-hidden="true"
    >
      <div className="ps-scene__wall" />
      <div className="ps-scene__table" />
      <div className="ps-scene__light" />
      <Composition uid={uid} />
      <div className="ps-scene__vignette" />
    </div>
  );
}
