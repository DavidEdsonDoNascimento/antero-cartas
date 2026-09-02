"use client";

import Link from "next/link";
import type { ThemeConfig } from "@/content/themes";
import { site } from "@/config/site";
import { track } from "@/lib/analytics";

/**
 * Convite para criar a própria cartinha, exibido dentro da cartinha pública
 * (`/c/[slug]`). Existe porque a cartinha compartilhada entregava a experiência
 * emocional sem oferecer nenhum caminho de volta para o produto: o estado
 * fechado não tinha convite algum e o estado aberto terminava no botão de
 * compartilhar — a única porta de conversão da rota ficava, ironicamente, na
 * tela de cartinha indisponível.
 *
 * Um componente com duas variantes, e não dois componentes: destino,
 * comportamento de navegação e rastreamento são idênticos nos dois estados —
 * só copy e apresentação mudam. Duas cópias divergiriam.
 *
 * NUNCA colocar este convite dentro de `CardPreview`: aquele componente é
 * compartilhado com o preview ao vivo da jornada `/criar`, e o CTA apareceria
 * para quem já está criando a própria cartinha.
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

export type CardCreateInviteVariant = "discreta" | "destaque";

export function CardCreateInvite({
  variant,
  theme,
}: {
  variant: CardCreateInviteVariant;
  theme: ThemeConfig;
}) {
  // `state` e `theme` são os únicos dados enviados: rótulos agregados, nunca
  // conteúdo da cartinha. `sanitizeAnalyticsProps` ainda filtra por cima, mas
  // o filtro é rede de segurança — a decisão de não mandar nada pessoal é
  // tomada aqui. `theme` já viaja no evento `cart_opened`.
  const trackClick = () =>
    track("create_cta_from_card_clicked", {
      state: variant === "discreta" ? "closed" : "opened",
      theme: theme.id,
    });

  return variant === "discreta" ? (
    <DiscreetInvite theme={theme} onClick={trackClick} />
  ) : (
    <HighlightedInvite theme={theme} onClick={trackClick} />
  );
}

/**
 * Estado fechado. Precisa existir sem competir com "Abrir minha carta": a
 * abertura do envelope continua sendo a única ação principal da tela. Por isso
 * é texto, não botão — dois botões arredondados empilhados criariam ambiguidade
 * sobre qual é a ação primária. A subordinação é construída por quatro meios
 * somados: vem depois, tem `mt-10` (mais que o `mt-6` do botão de abrir), não
 * tem fundo nem borda, e usa o tom apagado do tema.
 *
 * `onEnvelopeMuted` sobre `envelopeBg` é o mesmo par do kicker "Uma surpresa
 * foi preparada para você", já validado em ≥4,5:1 nos quatro temas.
 */
function DiscreetInvite({ theme, onClick }: { theme: ThemeConfig; onClick: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center">
      <p className="text-xs" style={{ color: theme.onEnvelopeMuted }}>
        Quer criar uma surpresa assim?
      </p>
      {/* Só o link é clicável — a pergunta acima é texto comum. `min-h-11`
          garante o alvo de toque de 44px (WCAG 2.2 SC 2.5.8) sem engordar o
          texto, que precisa continuar pequeno para não competir. O foco por
          teclado vem do halo global de globals.css, que cobre todo <a>. */}
      <Link
        href={DESTINATION}
        onClick={onClick}
        className="mt-1 inline-flex min-h-11 items-center px-3 text-xs font-medium underline underline-offset-4 transition hover:opacity-80"
        style={{ color: theme.onEnvelopeMuted }}
      >
        Criar uma cartinha
      </Link>
    </div>
  );
}

/**
 * Estado aberto. Aqui o convite pode ter peso: chega depois da mensagem, das
 * fotos e da música, no pico emocional, e nada mais disputa a atenção.
 *
 * Fica FORA do contêiner de ações do WhatsApp de propósito. Aquele `<div>` é
 * uma coluna com `gap-2` cujos filhos têm peso idêntico, e as duas ações não
 * são equivalentes: compartilhar é para quem recebeu a cartinha, criar é para
 * quem só passou por ela. `mt-8` mais o divisor marcam essa fronteira.
 *
 * O botão reaproveita o par `accent`/`onAccent` do "Abrir minha carta" —
 * validado em ≥4,5:1 nos quatro temas e, de quebra, cria um eco visual: o
 * mesmo botão que abriu a surpresa é o que convida a criar outra.
 */
function HighlightedInvite({ theme, onClick }: { theme: ThemeConfig; onClick: () => void }) {
  return (
    <div className="mt-8 text-center">
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
        onClick={onClick}
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
