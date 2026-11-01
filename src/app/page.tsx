import "@/styles/paper-light.css";
import { TrackView } from "@/components/analytics/TrackView";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ThemeShowcase } from "@/components/landing/ThemeShowcase";
import { Plans } from "@/components/landing/Plans";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";
import { dmSans, fraunces } from "@/components/landing/fonts";

/**
 * Landing "Papel e Luz". Tokens, fontes e estilos vivem sob `.pl` e só existem
 * nesta página: o app, o checkout e as cartas publicadas não são afetados.
 */
export default function Home() {
  return (
    <div className={`pl ${fraunces.variable} ${dmSans.variable}`}>
      <TrackView event="landing_viewed" />
      <a href="#conteudo" className="pl-skip">
        Pular para o conteúdo
      </a>
      <Header />

      <main id="conteudo">
        <Hero />
        <HowItWorks />
        <ThemeShowcase />
        <Plans />
        <Faq />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}
