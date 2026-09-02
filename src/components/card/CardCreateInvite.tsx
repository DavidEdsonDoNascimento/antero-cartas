"use client";

import Link from "next/link";
import type { ThemeConfig } from "@/content/themes";
import { site } from "@/config/site";
import { track } from "@/lib/analytics";

/**
 * Bloco de conversão no fim da cartinha pública ABERTA (`/c/[slug]`). Chega
 * depois da mensagem, das fotos e da música, no pico emocional, quando nada
 * mais disputa a atenção — por isso pode ter peso (divisor + promessa + botão
 * + assinatura).
 *
 * Fica FORA do contêiner de ações do WhatsApp de propósito: compartilhar é
 * para quem RECEBEU a cartinha, criar é para quem só passou por ela. `mt-8`
 * mais o divisor marcam essa fronteira.
 *
 * O convite do estado FECHADO não é mais texto solto — virou o selo
 * (`CardCreateSeal`), flutuante no mobile e inline no desktop.
 *
 * NUNCA colocar este bloco dentro de `CardPreview`: aquele componente é
 * compartilhado com o preview ao vivo de `/criar`, e o CTA apareceria para
 * quem já está criando a própria cartinha.
 *
 * --- Restrição de navegação (o ponto mais importante deste arquivo) ---
 *
 * Usa `next/link` puro, e JAMAIS `CreateCta`. Aquele componente dispara
 * `prefetchCartInit()` em `onPointerEnter` — ou seja, um `POST /api/carts` que
 * cria uma linha `Cart` real no banco só por passar o mouse/dedo. Na landing
 * isso é um bom negócio (D45, docs/0004_Decisions.md): quem chega ali já
 * demonstrou intenção de comprar. Aqui o público é outro — gente que quer ver
 * a surpresa que recebeu, não criar uma — e a rota é compartilhada em massa.
 * Pior: `resolveCartInit()` também limpa `antero:session`/`antero:draft`
 * quando a sessão não é mais editável, então o próprio remetente, ao abrir o
 * link da carta que acabou de publicar, teria seu estado local apagado e um
 * rascunho criado sem ter clicado em nada.
 *
 * Enquanto o visitante estiver em `/c/[slug]`, esta página é somente leitura:
 * sem escrita no banco, sem tocar em `localStorage`, sem levar nenhum dado da
 * cartinha visualizada para `/criar`. O `href` é a string fixa "/criar" — o
 * componente sequer recebe o `cart`, só o tema, para não haver como vazar.
 *
 * O prefetch de rota padrão do `<Link>` continua ligado de propósito: ele
 * apenas baixa o payload de `/criar` (uma página leve, sem chamada de rede no
 * servidor) e não cria rascunho nenhum.
 */

const DESTINATION = "/criar";

export function CardCreateInvite({ theme }: { theme: ThemeConfig }) {
  // `state`, `theme` e `surface` são os únicos dados enviados: rótulos
  // agregados, nunca conteúdo da cartinha. `sanitizeAnalyticsProps` ainda
  // filtra por cima, mas o filtro é rede de segurança — a decisão de não
  // mandar nada pessoal é tomada aqui. `theme` já viaja no evento `cart_opened`.
  const trackClick = () =>
    track("create_cta_from_card_clicked", {
      state: "opened",
      theme: theme.id,
      surface: "final_block",
    });

  return (
    // `id` é o alvo do IntersectionObserver de `CardFloatingActions`: quando
    // este bloco entra na viewport, o selo flutuante se esconde.
    <div id="card-final-cta" className="mt-8 text-center">
      {/* Divisor decorativo. `color-mix` sobre o token do tema (e não uma cor
          fixa nem `opacity` solta) porque o tema Delicado é o único com
          envelope claro — qualquer cinza fixo sumiria nele ou gritaria nos
          outros três. */}
      <div
        aria-hidden
        className="mx-auto h-px w-24"
        style={{
          background: `color-mix(in srgb, ${theme.onEnvelopeMuted} 35%, transparent)`,
        }}
      />

      <p className="mt-6 text-base font-medium" style={{ color: theme.onEnvelope }}>
        Gostou desta surpresa? 💌
      </p>
      <p
        className="mx-auto mt-1 max-w-xs text-sm text-balance"
        style={{ color: theme.onEnvelopeMuted }}
      >
        Crie uma cartinha para alguém especial em poucos minutos.
      </p>

      {/* Um único botão no bloco. `hover:scale-105` (e não brilho/troca de cor)
          mantém o contraste invariante no hover e repete exatamente o gesto do
          botão "Abrir minha carta". */}
      <Link
        href={DESTINATION}
        onClick={trackClick}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full px-8 py-3 text-sm font-semibold shadow-lg transition hover:scale-105"
        style={{ background: theme.accent, color: theme.onAccent }}
      >
        Criar minha cartinha
      </Link>

      {/* Assinatura, não marca-d'água: a marca já aparece no <title> da página
          e na prévia OG do link. Aqui ela serve para identificar a origem
          quando a cartinha circula como captura de tela. */}
      <p className="mt-4 text-[11px]" style={{ color: theme.onEnvelopeMuted }}>
        {site.name}
      </p>
    </div>
  );
}
