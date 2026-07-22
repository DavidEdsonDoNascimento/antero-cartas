import type { Metadata } from "next";
import { CardLoader } from "@/components/card/CardLoader";

/**
 * Rota pública, porém NÃO indexável.
 * As cartinhas nunca entram em buscas nem em sitemap.
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
  return <CardLoader slug={slug} />;
}
