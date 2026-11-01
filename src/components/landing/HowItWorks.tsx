import { StepPersonalizeArt, StepSendArt, StepWriteArt } from "@/components/paper-light/icons";

const STEPS = [
  {
    Art: StepWriteArt,
    title: "Escreva",
    text: "Conte o que sente. Sem ideias? Comece por um modelo de mensagem.",
  },
  {
    Art: StepPersonalizeArt,
    title: "Deixe com a sua cara",
    text: "Adicione fotos, uma música e escolha o visual. Tudo é opcional.",
  },
  {
    Art: StepSendArt,
    title: "Envie por link",
    text: "Depois do pagamento, compartilhe o link ou o QR Code. Quem recebe abre no celular.",
  },
];

/** "Como funciona" contado por imagem: um desenho, um título e uma frase por passo. */
export function HowItWorks() {
  return (
    <section id="como-funciona" className="pl-section" aria-labelledby="pl-how-title">
      <div className="pl-container">
        <div className="pl-section__head">
          <p className="pl-eyebrow">Como funciona</p>
          <h2 id="pl-how-title" className="pl-display pl-h2">
            Simples de fazer, <em>bonito de receber.</em>
          </h2>
        </div>

        <ol className="pl-steps">
          {STEPS.map(({ Art, title, text }, i) => (
            <li key={title} className="pl-step">
              <div className="pl-step__art">
                <Art />
              </div>
              <div>
                <p className="pl-step__num">Passo {i + 1}</p>
                <h3 className="pl-h3">{title}</h3>
                <p className="pl-step__text">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
