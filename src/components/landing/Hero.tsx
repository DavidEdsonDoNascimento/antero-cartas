import { positioning } from "@/config/site";
import { CreateCta } from "@/components/create/CreateCta";
import { ArrowIcon } from "@/components/paper-light/icons";
import { EnvelopeScene } from "./EnvelopeScene";
import { EnvelopeStage } from "./EnvelopeStage";

/**
 * Hero: título, uma frase objetiva e o botão principal. No celular a ordem é
 * título → frase → "Criar minha cartinha" → envelope → "Ver exemplo": o botão
 * fica na primeira tela e o envelope abre logo abaixo, à vista. A ordem é feita
 * em CSS (`order`), então o HTML segue a leitura lógica.
 *
 * O título tem uma linha por bloco: com a quebra fixa, a troca da fonte reserva
 * pelo Fraunces não muda a altura do título, e o botão e o envelope abaixo não
 * saltam (medido: CLS de 0,19 com a quebra solta; ~0 com ela fixa).
 */
export function Hero() {
  return (
    <section className="pl-hero" aria-labelledby="pl-hero-title">
      <div className="pl-container pl-hero__grid">
        <div className="pl-hero__copy">
          <h1 id="pl-hero-title" className="pl-display pl-hero__title">
            {positioning.heroTitleLines.map((line, i) => (
              <span key={line} className="pl-line">
                {i === positioning.heroTitleLines.length - 1 ? <em>{line}</em> : line}{" "}
              </span>
            ))}
          </h1>
          <p className="pl-lead pl-hero__lead">{positioning.heroSubtitle}</p>

          <CreateCta className="pl-btn pl-btn--primary pl-hero__primary">
            {positioning.heroCta}
            <ArrowIcon className="pl-btn__icon" />
          </CreateCta>

          <a href="#exemplos" className="pl-btn pl-btn--ghost pl-hero__secondary">
            {positioning.heroSecondaryCta}
          </a>

          <p className="pl-note pl-hero__note">{positioning.heroNote}</p>
        </div>

        <div className="pl-hero__stage">
          <EnvelopeStage>
            <EnvelopeScene />
          </EnvelopeStage>
        </div>
      </div>
    </section>
  );
}
