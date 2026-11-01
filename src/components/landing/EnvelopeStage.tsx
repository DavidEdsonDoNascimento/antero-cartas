"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Palco da hero: comanda a abertura do envelope e deixa tocar para rever.
 *
 * - Nasce "fechado" (também no HTML do servidor): o envelope aparece com o lacre
 *   e a carta escondida, e a abertura só começa quando o palco entra na tela. No
 *   celular o palco fica abaixo do botão principal, então a animação não roda
 *   fora de vista.
 * - Com `prefers-reduced-motion`, o CSS ignora o estado "fechado" e a cena já
 *   nasce aberta: este componente continua funcionando, só não há o que animar.
 * - A cena (`children`) é um Server Component: o JavaScript daqui só liga o
 *   estado e o botão de rever.
 */
export function EnvelopeStage({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"closed" | "opening">("closed");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const t = window.setTimeout(() => setState("opening"), 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("opening");
          io.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function replay() {
    setState("closed");
    // Um quadro com o estado "fechado" pintado: sem ele a animação não reinicia.
    window.setTimeout(() => setState("opening"), 90);
  }

  return (
    <div ref={ref} className="pl-stage" data-state={state}>
      <div className="pl-stage__art">
        {children}
        <button type="button" className="pl-stage__hit" onClick={replay}>
          <span className="pl-sr">Ver a carta de exemplo abrir de novo</span>
        </button>
      </div>
      <span className="pl-stage__caption">
        Exemplo fictício
        <span className="pl-stage__again"> · toque para ver de novo</span>
      </span>
    </div>
  );
}
