import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/presentation.css";
import { getPublicCart } from "@/server/cartService";
import { buildPublicGiftUrl } from "@/lib/publicUrl";
import { buildPublicPreviewDTO } from "@/lib/publicPreview";
import { resolveExperience } from "@/content/presentation/presets";
import { getTheme } from "@/content/themes";
import type { Cart } from "@/lib/types";
import { CardExperience } from "@/components/card/CardExperience";
import { RecipientExperience } from "@/components/presentation/RecipientExperience";
import { Scene } from "@/components/presentation/Scene";
import { Envelope } from "@/components/presentation/Envelope";
import { GiftShareButton } from "@/components/share/GiftShareButton";
import { presentationFontVars } from "@/components/presentation/fonts";

/**
 * Rota pública, porém NÃO indexável. Link de posse: quem tem o endereço lê a
 * carta inteira (sem login, PIN ou senha — decisão de produto).
 *
 * Dois renderizadores, escolhidos por `resolveExperience`:
 * - `presentation` NULL (toda carta anterior à 2.0) → `CardExperience`, o
 *   renderizador legado, sem nenhuma mudança visual na carta;
 * - com estilo → `RecipientExperience` (cenário, envelope, efeitos).
 *
 * Nos dois, o botão de compartilhar mostra SÓ a prévia pública `/presente/`,
 * nunca este link.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "Uma cartinha para você",
};

/** A prévia que a folha de compartilhar mostra: exatamente o que `/presente/` exibirá. */
function sharePreview(cart: Cart) {
  const first = cart.media[0];
  return buildPublicPreviewDTO({
    publicId: cart.publicId ?? "pendente",
    presentation: cart.presentation,
    presentationOptions: cart.presentationOptions,
    theme: cart.theme,
    sharePreviewVersion: cart.sharePreviewVersion,
    recipientName: cart.recipientName,
    message: cart.message,
    firstPhoto: first
      ? {
          width: null,
          height: null,
          focalX: first.framing?.x ?? null,
          focalY: first.framing?.y ?? null,
          zoom: first.framing?.zoom ?? null,
        }
      : null,
    hasMusic: Boolean(cart.music),
  });
}

export default async function CartaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublicCart(slug);

  if (result.state !== "ok") {
    return <NotAvailable expired={result.state === "expired"} />;
  }

  const cart = result.cart;
  const giftUrl = cart.publicId ? buildPublicGiftUrl(cart.publicId) : null;
  const preview = sharePreview(cart);
  // Na folha de compartilhar, a foto da prévia vem da própria carta (quem está
  // aqui já a vê inteira); o link compartilhado usa a rota pública.
  if (preview.photo && cart.media[0]) preview.photo.src = cart.media[0].url;
  const share = <GiftShareButton slug={slug} initialUrl={giftUrl} preview={preview} />;
  const experience = resolveExperience(cart);

  if (experience.kind === "legacy") {
    const theme = getTheme(cart.theme);
    return (
      <CardExperience
        cart={cart}
        share={
          <div
            className="ps"
            style={
              {
                "--ps-backdrop": theme.cardBg,
                "--ps-text": theme.ink,
                "--ps-text-muted": theme.inkMuted,
                "--ps-button": theme.accent,
                "--ps-on-button": theme.onAccent,
              } as CSSProperties
            }
          >
            {share}
          </div>
        }
      />
    );
  }

  const { preset, effect } = experience;
  const recipient = cart.recipientName.trim();
  // Só o conteúdo da carta vai para o componente do navegador: sem id, status,
  // plano, datas internas nem chave de storage das fotos.
  const letter = {
    title: cart.title,
    recipientName: cart.recipientName,
    message: cart.message,
    senderName: cart.senderName,
    signature: cart.signature,
    music: cart.music,
    relationshipStartDate: cart.relationshipStartDate,
    showRelationshipCounter: cart.showRelationshipCounter,
    media: cart.media.map((m) => ({ ...m, cartId: "", storageKey: null })),
  };
  return (
    <div className={presentationFontVars}>
      <RecipientExperience
        letter={letter}
        preset={preset}
        effect={effect}
        scene={<Scene style={preset.id} uid="c" fixed />}
        envelope={<Envelope palette={preset.envelope} uid="c-env" label={recipient ? `Para ${recipient}` : "Para você"} />}
        share={share}
      />
    </div>
  );
}

function NotAvailable({ expired }: { expired: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-vinho px-6 text-center text-creme">
      <div className="text-4xl">💌</div>
      <h1 className="font-serif text-2xl">
        {expired ? "Esta cartinha expirou" : "Cartinha não encontrada"}
      </h1>
      <p className="max-w-sm text-sm text-creme/70">
        {expired
          ? "O período de disponibilidade deste link chegou ao fim."
          : "O link pode estar incompleto ou a cartinha ainda não foi publicada."}
      </p>
      {/* Direto para `/criar`, não para a landing: quem chega aqui já veio de
          um link de cartinha e demonstrou interesse — obrigá-lo a atravessar a
          página inicial só adiciona um passo. */}
      <Link
        href="/criar"
        className="rounded-full bg-dourado px-6 py-3 text-sm font-semibold text-vinho"
      >
        Criar a minha cartinha
      </Link>
    </div>
  );
}
