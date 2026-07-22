import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";
import { demoCart } from "@/content/demoCart";
import { CardExperience } from "@/components/card/CardExperience";

export const metadata: Metadata = {
  title: "Demonstração",
  description: "Veja como fica uma cartinha digital do Antero Cartas, do envelope fechado à carta aberta.",
};

export default function DemonstracaoPage() {
  const cart = demoCart();
  return (
    <main className="relative">
      <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-full bg-black/40 px-4 py-1.5 text-xs font-medium text-white backdrop-blur">
        Exemplo fictício de demonstração ·{" "}
        <Link href="/criar" className="underline">
          criar a minha
        </Link>
      </div>
      <CardExperience cart={cart} shareUrl={`${site.url}/demonstracao`} />
    </main>
  );
}
