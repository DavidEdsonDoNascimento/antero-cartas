"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { ThemeId } from "@/lib/types";
import { demoCart } from "@/content/demoCart";
import { themes } from "@/content/themes";
import { CardPreview } from "@/components/card/CardPreview";
import { ArrowIcon } from "@/components/paper-light/icons";

/**
 * Vitrine de visuais. O que aparece é o renderizador REAL das cartas
 * (`CardPreview`, com os temas legados, sem nenhuma alteração): a pessoa vê o
 * resultado verdadeiro, não uma imitação. A ilha `.pl-legacy` devolve ao
 * componente o contexto tipográfico do app, para a carta sair igual à publicada.
 *
 * `live` desliga o avanço automático das fotos (não há pausa para ele aqui).
 */
export function ThemeShowcase() {
  const [active, setActive] = useState<ThemeId>(themes[0].id);
  const cart = useMemo(() => ({ ...demoCart(), theme: active }), [active]);
  const uid = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = themes.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % themes.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + themes.length) % themes.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = themes.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(themes[next].id);
    tabs.current[next]?.focus();
  }

  return (
    <section id="exemplos" className="pl-section pl-section--tint" aria-labelledby="pl-themes-title">
      <div className="pl-container pl-showcase">
        <div>
          <p className="pl-eyebrow">Exemplos</p>
          <h2 id="pl-themes-title" className="pl-display pl-h2">
            Escolha o jeito da sua <em>carta.</em>
          </h2>
          <p className="pl-lead" style={{ marginTop: 16, marginBottom: 28 }}>
            Quatro visuais prontos. Toque em um para ver a mesma cartinha de exemplo, como a pessoa a recebe.
          </p>

          <div className="pl-themes" role="tablist" aria-label="Visual da cartinha" onKeyDown={onKeyDown}>
            {themes.map((t, i) => {
              const selected = t.id === active;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  id={`${uid}-tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${uid}-panel`}
                  tabIndex={selected ? 0 : -1}
                  className="pl-theme"
                  onClick={() => setActive(t.id)}
                >
                  <span className="pl-theme__swatch" aria-hidden>
                    <i style={{ background: t.swatch[0] }} />
                    <i style={{ background: t.swatch[1] }} />
                  </span>
                  <span>
                    <span className="pl-theme__name">{t.label}</span>
                    <span className="pl-theme__desc">{t.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <Link href="/demonstracao" className="pl-link" style={{ marginTop: 20 }}>
            Abrir a experiência completa
            <ArrowIcon className="pl-btn__icon" />
          </Link>
        </div>

        <div className="pl-stagecard">
          <div
            id={`${uid}-panel`}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${active}`}
            tabIndex={0}
            className="pl-stagecard__inner pl-legacy"
          >
            <CardPreview cart={cart} live />
          </div>
          <p className="pl-note" style={{ marginTop: 14, textAlign: "center", position: "relative", zIndex: 1 }}>
            Exemplo fictício
          </p>
        </div>
      </div>
    </section>
  );
}
