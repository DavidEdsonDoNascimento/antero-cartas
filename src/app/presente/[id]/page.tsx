import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/styles/presentation.css";
import { getPublicPreview } from "@/server/publicPreviewService";
import { PublicGiftView } from "@/components/share/PublicGiftView";
import { presentationFontVars } from "@/components/presentation/fonts";

/**
 * Prévia pública de uma carta. Não indexável (`noindex` no HTML e no cabeçalho,
 * ver `next.config.ts`), fora do sitemap e, de propósito, NÃO bloqueada no
 * `robots.txt`: os robôs de prévia (WhatsApp, Telegram…) precisam ler a página
 * para montar o cartão do link, e um bloqueio impediria também que vissem o
 * `noindex`.
 *
 * Carta inexistente, expirada ou estornada: 404 de verdade, sem dizer o motivo.
 */
export const dynamic = "force-dynamic";

const TITLE = "Uma cartinha especial 💌";
const DESCRIPTION = "Alguém ganhou uma cartinha digital da Antero Cartas. Veja uma prévia e crie a sua.";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await getPublicPreview(id);
  const name = result.state === "ok" ? result.preview.recipientFirstName : null;
  const title = name ? `${name} ganhou uma cartinha especial 💌` : TITLE;
  return {
    title,
    description: DESCRIPTION,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    // Sem `canonical` para a raiz: cada prévia é ela mesma (e não indexada).
    alternates: { canonical: null },
    openGraph: { title, description: DESCRIPTION, type: "website", siteName: "Antero Cartas" },
    twitter: { card: "summary_large_image", title, description: DESCRIPTION },
  };
}

export default async function PresentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPublicPreview(id);
  if (result.state !== "ok") notFound();
  return (
    <div className={presentationFontVars}>
      <PublicGiftView preview={result.preview} />
    </div>
  );
}
