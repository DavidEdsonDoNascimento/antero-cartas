import { positioning } from "@/config/site";
import { CreateCta } from "@/components/create/CreateCta";
import { ArrowIcon, WaxSeal } from "@/components/paper-light/icons";

/** Convite final, sobre fundo de vinho: o único trecho escuro da página. */
export function FinalCta() {
  return (
    <section className="pl-final" aria-labelledby="pl-final-title">
      <div className="pl-container">
        <WaxSeal className="pl-final__seal" idSuffix="final" />
        <h2 id="pl-final-title" className="pl-display pl-h2">
          {positioning.closingTitle} <em>{positioning.closingHighlight}</em>
        </h2>
        <p className="pl-final__lead">{positioning.closingSubtitle}</p>
        <CreateCta className="pl-btn pl-btn--gold">
          {positioning.heroCta}
          <ArrowIcon className="pl-btn__icon" />
        </CreateCta>
      </div>
    </section>
  );
}
