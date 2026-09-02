"use client";

import { useState } from "react";
import type { Cart } from "@/lib/types";
import { getTheme } from "@/content/themes";
import { CardPreview } from "@/components/card/CardPreview";
import { CardCreateInvite } from "@/components/card/CardCreateInvite";
import { CardCreateSeal } from "@/components/card/CardCreateSeal";
import { CardMusicBadge } from "@/components/card/CardMusicBadge";
import { CardFloatingActions } from "@/components/card/CardFloatingActions";
import { youTubeEmbedUrl } from "@/lib/youtube";
import { whatsappShareUrl } from "@/lib/whatsapp";
import type { SelectedMusic } from "@/lib/types";
import { track } from "@/lib/analytics";

/**
 * Experiência completa da carta recebida.
 * Começa com o envelope fechado e revela a carta após a interação.
 * A música só é montada (e só tenta tocar) após a abertura do envelope.
 */
export function CardExperience({ cart, shareUrl }: { cart: Cart; shareUrl: string }) {
  const [opened, setOpened] = useState(false);
  const theme = getTheme(cart.theme);
  const recipient = cart.recipientName.trim();

  function handleOpen() {
    setOpened(true);
    track("cart_opened", { theme: cart.theme, hasMusic: !!cart.music });
  }

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-10"
      style={{ background: theme.envelopeBg }}
    >
      {!opened ? (
        <ClosedEnvelope
          recipient={recipient}
          theme={theme}
          hasMusic={!!cart.music}
          onOpen={handleOpen}
        />
      ) : (
        <OpenedLetter cart={cart} shareUrl={shareUrl} />
      )}

      {/* Filho DIRETO da raiz — nunca dentro dos blocos acima — para que
          `position: fixed` seja relativo à viewport (ver CardFloatingActions). */}
      <CardFloatingActions opened={opened} hasMusic={!!cart.music} theme={theme} />
    </div>
  );
}

function ClosedEnvelope({
  recipient,
  theme,
  hasMusic,
  onOpen,
}: {
  recipient: string;
  theme: ReturnType<typeof getTheme>;
  hasMusic: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <p
        className="mb-8 max-w-xs text-sm font-medium uppercase tracking-widest"
        style={{ color: theme.onEnvelopeMuted }}
      >
        Uma surpresa foi preparada para você
      </p>

      {/* Aviso de música no desktop (no mobile é o badge flutuante). O wrapper
          controla a visibilidade responsiva — `hidden`/`lg:block` num <div> não
          colide com o `display` do próprio badge. */}
      {hasMusic && (
        <div className="mb-6 hidden lg:block">
          <CardMusicBadge theme={theme} state="closed" />
        </div>
      )}

      {/* Envelope */}
      <button
        onClick={onOpen}
        aria-label="Abrir minha carta"
        className="animate-float group relative h-48 w-72 cursor-pointer sm:h-56 sm:w-96"
      >
        <div
          className="absolute inset-0 rounded-lg shadow-2xl"
          style={{ background: theme.cardBg }}
        />
        {/* Aba do envelope — 50% (não 82%): a dobra precisa se distinguir do
            corpo do envelope com ≥3:1 (não-textual); 82% rendia ~1,5:1 em
            todos os temas, a dobra ficava praticamente invisível. */}
        <div
          className="absolute inset-x-0 top-0 origin-top transition-transform duration-500 group-hover:-translate-y-1"
          style={{
            height: "60%",
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
            background: `color-mix(in srgb, ${theme.cardBg} 50%, black)`,
          }}
        />
        {/* Selo do tema */}
        <div
          className="absolute left-1/2 top-[52%] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-lg shadow-lg"
          style={{ background: theme.accent, color: theme.onAccent }}
        >
          {theme.seal}
        </div>
      </button>

      {recipient && (
        <p
          className="mt-8 font-script text-3xl sm:text-4xl"
          style={{ color: theme.onEnvelope }}
        >
          {recipient}
        </p>
      )}

      <button
        onClick={onOpen}
        className="mt-6 rounded-full px-8 py-3 text-sm font-semibold shadow-lg transition hover:scale-105"
        style={{ background: theme.accent, color: theme.onAccent }}
      >
        Abrir minha carta {theme.seal}
      </button>

      {/* Selo de criação — no mobile é flutuante (CardFloatingActions); aqui,
          inline no desktop, depois e abaixo do botão de abrir, que continua
          sendo a única ação principal desta tela. O wrapper faz a visibilidade
          responsiva (não colide com o `display` do selo). */}
      <div className="mt-10 hidden lg:block">
        <CardCreateSeal theme={theme} state="closed" />
      </div>
    </div>
  );
}

function OpenedLetter({ cart, shareUrl }: { cart: Cart; shareUrl: string }) {
  const shareText = `Preparei uma cartinha especial para você 💌 ${shareUrl}`;
  // Derivado aqui (em vez de descer por prop) pelo mesmo motivo que
  // `CardPreview` faz: `getTheme` é uma busca pura em uma lista de quatro.
  const theme = getTheme(cart.theme);

  return (
    <div className="w-full max-w-md animate-fade-up">
      <CardPreview cart={cart} />

      {cart.music && <OpenCardMusic music={cart.music} />}

      <div className="mt-5 flex flex-col gap-2">
        <a
          href={whatsappShareUrl(shareText)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("whatsapp_share_clicked", { from: "card" })}
          className="rounded-full bg-[#25D366] px-6 py-3 text-center text-sm font-semibold text-white shadow-lg transition hover:brightness-105"
        >
          Compartilhar no WhatsApp
        </a>
      </div>

      {/* Fora do contêiner de ações acima: compartilhar é para quem RECEBEU a
          cartinha, criar é para quem só passou por ela. Ações diferentes, com
          públicos diferentes, não podem ter o mesmo peso visual. */}
      <CardCreateInvite theme={theme} />
    </div>
  );
}

function OpenCardMusic({ music }: { music: SelectedMusic }) {
  // Tenta tocar logo após a abertura (dentro do gesto do usuário). Se o
  // navegador bloquear, o próprio player mostra o botão de play e o controle
  // abaixo permite reiniciar — sem gerar erro visual.
  const [playing, setPlaying] = useState(true);

  return (
    // bg-black/55 (não /25): um véu escuro FIXO, não relativo ao envelopeBg —
    // funciona igual em temas com envelope claro (Delicado) ou escuro. O
    // texto branco continua legível porque o preto sempre escurece o que
    // está atrás, qualquer que seja a cor de base do tema.
    <div id="musica-da-cartinha" className="mt-4 scroll-mt-4 rounded-xl bg-black/55 p-3">
      <div className="flex items-center justify-between gap-3 text-xs text-white/85">
        <span className="min-w-0 truncate">
          🎵 {music.title ?? "Música da cartinha"}
          {music.channelTitle ? ` · ${music.channelTitle}` : ""}
        </span>
        <button
          onClick={() => setPlaying((v) => !v)}
          aria-pressed={playing}
          className="shrink-0 rounded-full bg-white/15 px-3 py-1 font-medium text-white transition hover:bg-white/25"
        >
          {playing ? "Pausar música" : "▶ Tocar música"}
        </button>
      </div>
      {playing && (
        <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg">
          <iframe
            title="Música da cartinha"
            src={youTubeEmbedUrl(music.videoId, { autoplay: true })}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}
      <p className="mt-2 text-center text-[11px] text-white/70">
        A reprodução depende da disponibilidade do vídeo no YouTube.{" "}
        <a
          href={music.youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Ver no YouTube
        </a>
      </p>
    </div>
  );
}
