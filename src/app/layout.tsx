import type { Metadata } from "next";
import { Playfair_Display, Inter, Dancing_Script } from "next/font/google";
import "./globals.css";
import { site } from "@/config/site";
import { WebAnalytics } from "@/components/analytics/WebAnalytics";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const dancing = Dancing_Script({
  variable: "--font-dancing",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  keywords: [
    "cartinha digital",
    "carta de amor online",
    "presente digital",
    "surpresa para namorado",
    "surpresa para namorada",
    "homenagem digital",
    "carta para mãe",
    "carta para pai",
  ],
  // Canonical relativo: resolvido contra `metadataBase`, então acompanha
  // automaticamente o domínio de NEXT_PUBLIC_SITE_URL (task 011, seção 8.3).
  // Cada rota que precisar de canonical próprio sobrescreve em seu metadata.
  alternates: { canonical: "/" },
  openGraph: {
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    type: "website",
    locale: "pt_BR",
    siteName: site.name,
    url: site.url,
  },
  // A imagem vem de `opengraph-image.tsx` / `twitter-image.tsx`; aqui só o
  // formato do card (imagem grande) para o preview do X e do WhatsApp.
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${playfair.variable} ${inter.variable} ${dancing.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-creme text-grafite">
        {children}
        <WebAnalytics />
      </body>
    </html>
  );
}
