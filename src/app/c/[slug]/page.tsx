import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCart } from "@/server/cartService";
import { CardExperience } from "@/components/card/CardExperience";

/**
 * Rota pública, porém NÃO indexável.
 * Server Component: busca a carta publicada direto no backend (Fase 2),
 * substituindo a leitura via localStorage — abre em qualquer navegador.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "Uma cartinha para você",
};

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

  return <CardExperience cart={result.cart} shareUrl={`${appUrl()}/c/${slug}`} />;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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
      <Link
        href="/"
        className="rounded-full bg-dourado px-6 py-3 text-sm font-semibold text-vinho"
      >
        Criar a minha cartinha
      </Link>
    </div>
  );
}
