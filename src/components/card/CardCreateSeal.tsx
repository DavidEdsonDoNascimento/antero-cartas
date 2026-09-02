"use client";

import Link from "next/link";
import type { ThemeConfig } from "@/content/themes";
import { track } from "@/lib/analytics";

/**
 * Selo de criação — a "marca de cera" do Antero como convite para `/criar`
 * dentro da cartinha pública (`/c/[slug]`). No mobile é flutuante (montado por
 * `CardFloatingActions`); no desktop entra inline, logo abaixo da ação
 * principal de cada estado.
 *
 * --- Restrição de navegação (idêntica a CardCreateInvite.tsx — leia o cabeçalho
 * de lá) ---
 *
 * `next/link` puro, e JAMAIS `CreateCta`: aquele componente dispara
 * `prefetchCartInit()` em `onPointerEnter`, ou seja um `POST /api/carts` que
 * grava uma linha `Cart` só por passar o dedo. Enquanto o visitante está em
 * `/c/[slug]` a página é somente leitura: sem escrita no banco, sem tocar em
 * `localStorage`, sem levar nenhum dado da cartinha para `/criar`. O `href` é a
 * string fixa `"/criar"` e o componente sequer recebe o `cart` — só o tema e o
 * estado — para não haver caminho por onde um dado escorra. Nenhum handler de
 * ponteiro/toque/foco: só o clique navega e rastreia.
 */

const DESTINATION = "/criar";

// Círculo serrilhado de 12 lóbulos (viewBox 24×24) — o formato de lacre de cera.
// Gerado uma vez; ver claude-reports/2026-09-02 para o script.
const SEAL_PATH =
  "M 12.00 2.80 A 3.21 3.21 0 0 1 16.60 4.03 A 3.21 3.21 0 0 1 19.97 7.40 " +
  "A 3.21 3.21 0 0 1 21.20 12.00 A 3.21 3.21 0 0 1 19.97 16.60 A 3.21 3.21 0 0 1 16.60 19.97 " +
  "A 3.21 3.21 0 0 1 12.00 21.20 A 3.21 3.21 0 0 1 7.40 19.97 A 3.21 3.21 0 0 1 4.03 16.60 " +
  "A 3.21 3.21 0 0 1 2.80 12.00 A 3.21 3.21 0 0 1 4.03 7.40 A 3.21 3.21 0 0 1 7.40 4.03 " +
  "A 3.21 3.21 0 0 1 12.00 2.80 Z";

export function CardCreateSeal({
  theme,
  state,
  className = "",
}: {
  theme: ThemeConfig;
  /** Estado da cartinha no momento do clique — vai no evento, igual ao bloco final. */
  state: "closed" | "opened";
  className?: string;
}) {
  return (
    <Link
      href={DESTINATION}
      aria-label="Criar a minha cartinha"
      onClick={() =>
        track("create_cta_from_card_clicked", {
          state,
          theme: theme.id,
          surface: "seal",
        })
      }
      className={`inline-flex items-center gap-2 rounded-full py-2 pr-4 pl-2 text-sm font-semibold shadow-lg transition hover:scale-[1.03] ${className}`}
      // Pílula `accent` / texto `onAccent` — o par já validado ≥4,5:1 do botão
      // "Abrir minha carta". A borda em `onEnvelope` recorta a pílula contra o
      // fundo em TODOS os temas (≥5,9:1), inclusive o Delicado, onde `accent`
      // sobre `envelopeBg` fica no limite de 3:1.
      style={{
        background: theme.accent,
        color: theme.onAccent,
        border: `1px solid ${theme.onEnvelope}`,
      }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-8 w-8" role="presentation">
          <path d={SEAL_PATH} fill={theme.onAccent} />
          <path
            d="M12 7.6v8.8M7.6 12h8.8"
            stroke={theme.accent}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      Criar cartinha
    </Link>
  );
}
