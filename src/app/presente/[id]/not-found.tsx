import Link from "next/link";
import "@/styles/presentation.css";
import { getPreset } from "@/content/presentation/presets";
import { Scene } from "@/components/presentation/Scene";
import { presetVars } from "@/components/presentation/tokens";
import { presentationFontVars } from "@/components/presentation/fonts";

/**
 * Prévia inexistente, expirada ou estornada: a mesma página para os três (o
 * motivo não é revelado), com HTTP 404 de verdade.
 */
export default function PresenteNaoEncontrado() {
  const preset = getPreset("papel-luz");
  return (
    <div className={presentationFontVars}>
      <div className="ps ps-page" style={presetVars(preset)}>
        <Scene style={preset.id} uid="nf" fixed />
        <main className="ps-main ps-main--center">
          <div className="ps-plaque ps-plaque--block ps-gift__card">
            <h1 className="ps-gift__title">Este presente não está mais disponível</h1>
            <p className="ps-gift__lead">
              O link pode ter expirado ou estar incompleto. Que tal preparar uma cartinha para alguém especial?
            </p>
            <div className="ps-gift__cta">
              <Link href="/criar" className="ps-btn ps-btn--block">
                Criar minha cartinha
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
