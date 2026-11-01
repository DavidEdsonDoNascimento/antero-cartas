import { plans, formatBRL } from "@/config/plans";
import { positioning } from "@/config/site";
import { CreateCta } from "@/components/create/CreateCta";
import { ArrowIcon, CardIcon, CheckIcon, PixIcon } from "@/components/paper-light/icons";

/**
 * Planos e pagamento. Preço, prazo e itens vêm de `config/plans.ts` (a fonte
 * única, que o servidor também usa): nenhum valor é escrito aqui. A etiqueta
 * "Mais escolhido" do plano NÃO é exibida: não há dado que a sustente.
 * O plano é escolhido no fim do fluxo, com a carta pronta; por isso há um único
 * botão para os dois, em vez de "Criar com o plano X".
 */
export function Plans() {
  return (
    <section id="planos" className="pl-section" aria-labelledby="pl-plans-title">
      <div className="pl-container">
        <div className="pl-section__head">
          <p className="pl-eyebrow">Planos</p>
          <h2 id="pl-plans-title" className="pl-display pl-h2">
            Pagamento único, <em>sem mensalidade.</em>
          </h2>
          <p className="pl-lead">Você escolhe o plano no final, com a carta já pronta.</p>
        </div>

        <div className="pl-plans">
          {plans.map((plan) => (
            <article key={plan.type} className={`pl-plan${plan.durationDays === null ? " pl-plan--forever" : ""}`}>
              <h3 className="pl-plan__name">{plan.name}</h3>
              <p className="pl-plan__price">
                {formatBRL(plan.priceCents)}
                <small>pagamento único</small>
              </p>
              <ul className="pl-plan__list">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <CheckIcon />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="pl-plans__cta">
          <ul className="pl-pay" aria-label="Formas de pagamento">
            <li>
              <PixIcon />
              Pix
            </li>
            <li>
              <CardIcon />
              Cartão
            </li>
          </ul>
          <CreateCta className="pl-btn pl-btn--primary">
            {positioning.heroCta}
            <ArrowIcon className="pl-btn__icon" />
          </CreateCta>
        </div>
      </div>
    </section>
  );
}
