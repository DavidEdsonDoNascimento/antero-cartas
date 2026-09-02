"use client";

import { useEffect, useState } from "react";
import type { ThemeConfig } from "@/content/themes";
import { CardCreateSeal } from "./CardCreateSeal";
import { CardMusicBadge } from "./CardMusicBadge";

/**
 * Ancoragem flutuante — só no mobile (`lg:hidden`) — do selo de criação e do
 * indicador de música na cartinha pública.
 *
 * Renderizado como filho DIRETO da raiz de `CardExperience`, nunca dentro de
 * `ClosedEnvelope`/`OpenedLetter`: o wrapper do `OpenedLetter` tem
 * `animate-fade-up`, cujas keyframes de `translateY` criam um containing block
 * durante os 0,6s da animação — um `position: fixed` ali ficaria preso ao
 * wrapper e depois saltaria para a viewport. Montado na raiz, `fixed` é
 * relativo à viewport de verdade (nenhum ancestral transformado).
 *
 * Cantos inferiores opostos: música à esquerda (informação), selo à direita
 * (ação — convenção de FAB). Cada um some quando deixa de fazer sentido:
 * - o selo, quando o bloco final (`#card-final-cta`) entra na viewport — evita
 *   dois caminhos para `/criar` visíveis ao mesmo tempo;
 * - o indicador, quando o player (`#musica-da-cartinha`) entra na viewport — o
 *   controle já está à vista e o badge cobriria a base do iframe.
 *
 * Em paisagem baixa os dois somem por CSS (`.card-float-dock`, ver globals.css)
 * — cobririam o envelope; o convite/indicador inline do desktop assume.
 */
export function CardFloatingActions({
  opened,
  hasMusic,
  theme,
}: {
  opened: boolean;
  hasMusic: boolean;
  theme: ThemeConfig;
}) {
  const finalCtaVisible = useElementInViewport("card-final-cta", opened);
  const playerVisible = useElementInViewport("musica-da-cartinha", opened && hasMusic);

  return (
    <>
      {hasMusic && !(opened && playerVisible) && (
        <div className="card-float-dock fixed bottom-[var(--card-float-inset-b)] left-[var(--card-float-inset-l)] z-20 lg:hidden">
          <CardMusicBadge
            theme={theme}
            state={opened ? "opened" : "closed"}
            className={opened ? "" : "animate-music-pulse"}
          />
        </div>
      )}

      {!finalCtaVisible && (
        <div className="card-float-dock fixed right-[var(--card-float-inset-r)] bottom-[var(--card-float-inset-b)] z-20 lg:hidden">
          <CardCreateSeal theme={theme} state={opened ? "opened" : "closed"} />
        </div>
      )}
    </>
  );
}

/**
 * `true` quando o elemento de `id` está na viewport. `false` quando desligado,
 * quando o elemento não existe, ou em ambiente sem `IntersectionObserver`
 * (jsdom nos testes) — nesse caso os flutuantes simplesmente não se escondem,
 * que é o comportamento seguro. `enabled` acompanha `opened`/`hasMusic`, que na
 * cartinha pública só vão de `false` para `true` uma vez (o envelope não
 * fecha), então não há estado obsoleto a limpar.
 */
function useElementInViewport(id: string, enabled: boolean): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const el = document.getElementById(id);
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, enabled]);

  return enabled ? visible : false;
}
