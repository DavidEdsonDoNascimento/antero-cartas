"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { EffectId, PresentationPreset } from "@/content/presentation/presets";
import { LetterSheet, type LetterContent } from "@/components/letter/LetterSheet";
import { OpenCardMusic } from "@/components/card/CardExperience";
import { CardCreateInvite } from "@/components/card/CardCreateInvite";
import { CardFloatingActions } from "@/components/card/CardFloatingActions";
import { NoteIcon } from "@/components/paper-light/icons";
import { track } from "@/lib/analytics";
import { EffectsLayer } from "./EffectsLayer";
import { presetVars } from "./tokens";

type Stage = "closed" | "opening" | "open";

/** Tempo da abertura no CSS (`ps-letter-rise` termina em ≈1,85 s). */
const OPENING_MS = 1900;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Celular modesto ou economia de dados: sem a camada de efeitos (a cena continua). */
function isLowEndDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) ||
    (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) ||
    nav.connection?.saveData === true
  );
}

/**
 * Abertura da carta com estilo (2.0): cenário, envelope fechado com o nome,
 * "Abrir minha carta", lacre, aba, carta subindo e efeitos — e então a carta
 * inteira para ler.
 *
 * - O cenário e o envelope chegam prontos do servidor (`scene`, `envelope`):
 *   o desenho não entra no JavaScript desta página.
 * - A carta inteira já está no HTML (`hidden` até abrir). Sem JavaScript, o
 *   `<noscript>` mostra a carta direto; com movimento reduzido, abre sem
 *   animação.
 * - A música monta no toque de abrir (dentro do gesto, como a carta legada).
 * - Depois de abrir, o foco vai para o título da carta.
 * - `preview`: usado pelo editor ("Ver como vai abrir"): sem música tocando,
 *   sem compartilhar nem convite.
 */
export function RecipientExperience({
  letter,
  preset,
  effect,
  scene,
  envelope,
  share,
  preview = false,
  onClose,
}: {
  letter: LetterContent;
  preset: PresentationPreset;
  effect: EffectId;
  scene: ReactNode;
  envelope: ReactNode;
  /** Botão "Compartilhar que ganhei" (só na carta publicada). */
  share?: ReactNode;
  preview?: boolean;
  /** Prévia do editor: volta para a edição. */
  onClose?: () => void;
}) {
  const [stage, setStage] = useState<Stage>("closed");
  const [lowFx, setLowFx] = useState(false);
  const headingId = useId();
  // Ids de `<defs>` SVG: sem os caracteres especiais que o React usa no useId.
  const fxUid = `fx${headingId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const timer = useRef<number | null>(null);
  const recipient = letter.recipientName.trim();
  const theme = preset.letter;

  useEffect(() => {
    // Só no navegador (o servidor não conhece o aparelho): sem isso o HTML não hidrata igual.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLowFx(isLowEndDevice());
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (stage !== "open") return;
    // Depois de a carta aparecer: o leitor de tela começa pelo título.
    const t = window.setTimeout(() => document.getElementById(headingId)?.focus({ preventScroll: false }), 60);
    return () => window.clearTimeout(t);
  }, [stage, headingId]);

  function handleOpen() {
    if (stage !== "closed") return;
    if (!preview) track("cart_opened", { theme: preset.id, hasMusic: !!letter.music, presentation: true });
    if (prefersReducedMotion()) {
      setStage("open");
      return;
    }
    setStage("opening");
    timer.current = window.setTimeout(() => setStage("open"), OPENING_MS);
  }

  return (
    <div
      className="ps ps-page"
      style={presetVars(preset)}
      data-lowfx={lowFx || undefined}
      data-preview={preview || undefined}
    >
      {scene}

      <main className="ps-main">
        {stage !== "open" && (
          <section className="ps-closed" aria-labelledby={`${headingId}-closed`}>
            <h1 id={`${headingId}-closed`} className="ps-sr">
              {recipient ? `Uma cartinha para ${recipient}` : "Uma cartinha para você"}
            </h1>
            <p className="ps-plaque">Uma surpresa foi preparada para você</p>
            <div className="ps-stage" data-state={stage === "opening" ? "opening" : "closed"}>
              <div className="ps-stage__art">{envelope}</div>
            </div>
            <button type="button" className="ps-btn" onClick={handleOpen} disabled={stage === "opening"}>
              {stage === "opening" ? "Abrindo…" : "Abrir minha carta"}
            </button>
            {letter.music && (
              <p className="ps-plaque ps-plaque--muted">
                <NoteIcon width={16} height={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                Esta cartinha tem música. Ela começa quando você abrir.
              </p>
            )}
            {preview && onClose && (
              <button type="button" className="ps-btn ps-btn--ghost" onClick={onClose}>
                Voltar para a edição
              </button>
            )}
          </section>
        )}

        {/* A carta inteira, já no HTML. `hidden` até abrir; sem JS, o noscript a mostra. */}
        <div
          className="ps-open"
          hidden={stage === "closed"}
          data-entered={stage === "open" || undefined}
          style={stage === "opening" ? { opacity: 0, pointerEvents: "none" } : undefined}
        >
          <LetterSheet letter={letter} theme={theme} headingId={headingId} headingLevel={1} preview={preview} />

          {!preview && letter.music && stage !== "closed" && <OpenCardMusic music={letter.music} />}

          {stage === "open" && (
            <div className="ps-actions">
              {share}
              {preview && onClose && (
                <button type="button" className="ps-btn" onClick={onClose}>
                  Voltar para a edição
                </button>
              )}
            </div>
          )}

          {/* O convite reaproveitado da carta legada pinta texto em `onEnvelope` sobre
              `envelopeBg`: aqui ele ganha esse fundo, em vez de cair sobre a arte. */}
          {!preview && stage === "open" && (
            <div className="ps-invite" style={{ background: theme.envelopeBg }}>
              <CardCreateInvite theme={theme} />
            </div>
          )}
        </div>
      </main>

      <noscript>
        <style>{".ps-open[hidden]{display:flex!important}.ps-closed{display:none!important}"}</style>
      </noscript>

      <EffectsLayer effect={effect} style={preset.id} uid={fxUid} play={stage === "open"} />

      {!preview && <CardFloatingActions opened={stage === "open"} hasMusic={!!letter.music} theme={theme} />}
    </div>
  );
}
