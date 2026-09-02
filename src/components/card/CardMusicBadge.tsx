"use client";

import type { ThemeConfig } from "@/content/themes";
import { track } from "@/lib/analytics";

/**
 * Indicador de que a cartinha tem música. Existe porque quem recebe pode não
 * perceber a trilha — o celular pode estar no silencioso ou com o volume
 * zerado, e só há sinal de música DEPOIS de abrir o envelope.
 *
 * O que o código sabe de verdade é só uma coisa: `cart.music != null`. Não há
 * integração com a IFrame API do YouTube, então "está tocando", "pausado" ou
 * "autoplay bloqueado" seriam suposição. Por isso o indicador afirma apenas
 * "esta cartinha tem música" — nunca reprodução.
 *
 * - `state="closed"`: informativo. Não é foco, não é botão, não parece
 *   clicável (`role="img"`, sem `href`, sem `tabindex`). Ainda não há player.
 * - `state="opened"`: link para o player (`#musica-da-cartinha`). O controle
 *   de play/pause continua no painel — este é só um atalho de rolagem.
 */
export function CardMusicBadge({
  theme,
  state,
  className = "",
}: {
  theme: ThemeConfig;
  state: "closed" | "opened";
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3 text-xs font-semibold shadow-lg";
  // Mesmo par e mesma aresta de definição do selo (ver CardCreateSeal): pílula
  // `accent`, texto `onAccent`, borda `onEnvelope` (recorta contra o fundo em
  // todos os temas). A forma difere do selo — pílula sem disco serrilhado —
  // para não se confundir com ele.
  const style = {
    background: theme.accent,
    color: theme.onAccent,
    border: `1px solid ${theme.onEnvelope}`,
  };

  const note = (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0" role="presentation">
      <path
        d="M9 17.5V5l10-2v12"
        fill="none"
        stroke={theme.onAccent}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.4" cy="17.5" r="2.6" fill={theme.onAccent} />
      <circle cx="16.4" cy="15" r="2.6" fill={theme.onAccent} />
    </svg>
  );

  if (state === "closed") {
    return (
      <span
        role="img"
        aria-label="Esta cartinha tem música"
        className={`${base} py-1.5 ${className}`}
        style={style}
      >
        {note}
        <span aria-hidden>Com música</span>
      </span>
    );
  }

  return (
    <a
      href="#musica-da-cartinha"
      onClick={() => track("card_music_indicator_clicked", { theme: theme.id })}
      className={`${base} min-h-11 py-2 ${className}`}
      style={style}
    >
      {note}
      Ir para música
    </a>
  );
}
