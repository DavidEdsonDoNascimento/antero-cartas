import { faq } from "@/content/faq";

/**
 * Dúvidas em `<details>`: abre e fecha sem JavaScript, funciona com teclado
 * (Enter/Espaço) e leitor de tela de graça, e continua legível se o script
 * falhar. A primeira pergunta nasce aberta.
 */
export function Faq() {
  return (
    <section id="duvidas" className="pl-section pl-section--tint" aria-labelledby="pl-faq-title">
      <div className="pl-container">
        <div className="pl-section__head">
          <p className="pl-eyebrow">Dúvidas</p>
          <h2 id="pl-faq-title" className="pl-display pl-h2">
            Antes de <em>começar.</em>
          </h2>
        </div>

        <div className="pl-faq">
          {faq.map((item, i) => (
            <details key={item.q} className="pl-faq__item" open={i === 0}>
              <summary className="pl-faq__q">{item.q}</summary>
              <p className="pl-faq__a">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
