"use client";

import { useState } from "react";
import type { Cart } from "@/lib/types";
import { getTheme } from "@/content/themes";
import { CardPreview } from "@/components/card/CardPreview";
import { youTubeEmbedUrl } from "@/lib/youtube";
import { whatsappShareUrl } from "@/lib/whatsapp";
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
    track("cart_opened", { theme: cart.theme, hasMusic: !!cart.musicVideoId });
  }

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-10"
      style={{ background: theme.envelopeBg }}
    >
      {!opened ? (
        <ClosedEnvelope recipient={recipient} theme={theme} onOpen={handleOpen} />
      ) : (
        <OpenedLetter cart={cart} shareUrl={shareUrl} />
      )}
    </div>
  );
}

function ClosedEnvelope({
  recipient,
  theme,
  onOpen,
}: {
  recipient: string;
  theme: ReturnType<typeof getTheme>;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="mb-8 max-w-xs text-sm font-medium uppercase tracking-widest text-white/70">
        Uma surpresa foi preparada para você
      </p>

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
        {/* Aba do envelope */}
        <div
          className="absolute inset-x-0 top-0 origin-top transition-transform duration-500 group-hover:-translate-y-1"
          style={{
            height: "60%",
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
            background: `color-mix(in srgb, ${theme.cardBg} 82%, black)`,
          }}
        />
        {/* Selo do tema */}
        <div
          className="absolute left-1/2 top-[52%] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-lg shadow-lg"
          style={{ background: theme.accent, color: theme.envelopeBg }}
        >
          {theme.seal}
        </div>
      </button>

      {recipient && (
        <p className="mt-8 font-script text-3xl text-white sm:text-4xl">{recipient}</p>
      )}

      <button
        onClick={onOpen}
        className="mt-6 rounded-full px-8 py-3 text-sm font-semibold shadow-lg transition hover:scale-105"
        style={{ background: theme.accent, color: theme.envelopeBg }}
      >
        Abrir minha carta {theme.seal}
      </button>
    </div>
  );
}

function OpenedLetter({ cart, shareUrl }: { cart: Cart; shareUrl: string }) {
  // Tenta tocar após a abertura (dentro do gesto do usuário). Se o navegador
  // bloquear, o controle abaixo permite iniciar manualmente — sem erro visual.
  const [musicOn, setMusicOn] = useState(true);
  const shareText = `Preparei uma cartinha especial para você 💌 ${shareUrl}`;

  return (
    <div className="w-full max-w-md animate-fade-up">
      <CardPreview cart={cart} />

      {cart.musicVideoId && (
        <div className="mt-4 rounded-xl bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3 text-xs text-white/85">
            <span className="flex items-center gap-1.5">🎵 Música da cartinha</span>
            <button
              onClick={() => setMusicOn((v) => !v)}
              aria-pressed={musicOn}
              className="rounded-full bg-white/15 px-3 py-1 font-medium text-white transition hover:bg-white/25"
            >
              {musicOn ? "Pausar música" : "▶ Tocar música"}
            </button>
          </div>
          {musicOn && (
            <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg">
              <iframe
                title="Música da cartinha"
                src={youTubeEmbedUrl(cart.musicVideoId, { autoplay: true })}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          )}
        </div>
      )}

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
    </div>
  );
}
