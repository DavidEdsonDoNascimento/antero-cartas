import Link from "next/link";
import { positioning } from "@/config/site";
import { Header } from "@/components/landing/Header";
import { DemoSection } from "@/components/landing/DemoSection";
import { Faq } from "@/components/landing/Faq";
import { TrackView } from "@/components/analytics/TrackView";
import {
  Benefits,
  FinalCta,
  Footer,
  ForWhom,
  Guarantee,
  HowItWorks,
  Plans,
  SectionHeading,
  Testimonials,
} from "@/components/landing/Sections";

export default function Home() {
  return (
    <>
      <TrackView event="landing_viewed" />
      <Header />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl font-bold leading-tight text-grafite sm:text-5xl">
                {positioning.heroTitle}{" "}
                <span className="text-vinho">{positioning.heroHighlight}</span>
              </h1>
              <p className="mx-auto mt-5 max-w-lg text-lg text-grafite/70 lg:mx-0">
                {positioning.heroSubtitle}
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
                <Link
                  href="/criar"
                  className="w-full rounded-full bg-vinho px-8 py-4 text-center text-base font-semibold text-creme shadow-lg transition hover:bg-vinho-deep sm:w-auto"
                >
                  {positioning.heroCta} →
                </Link>
                <Link
                  href="/demonstracao"
                  className="w-full rounded-full border border-vinho px-8 py-4 text-center text-base font-semibold text-vinho transition hover:bg-vinho hover:text-creme sm:w-auto"
                >
                  Ver exemplo
                </Link>
              </div>
              <p className="mt-4 text-sm text-grafite/50">
                Sem instalar aplicativo · Sem cadastro · Pronta em ~3 minutos
              </p>
            </div>

            <div className="flex justify-center">
              <DemoSection />
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="bg-creme-dark/40 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading
              eyebrow="Como funciona"
              title="Em três passos simples"
              subtitle="Do primeiro clique ao envio, sem complicação."
            />
            <HowItWorks />
          </div>
        </section>

        {/* Para quem é */}
        <section id="para-quem" className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading
              eyebrow="Para quem é"
              title="Uma lembrança para cada pessoa especial"
              subtitle="Namorados, família, amigos e todas as ocasiões que merecem ser lembradas."
            />
            <ForWhom />
          </div>
        </section>

        {/* Demonstração */}
        <section className="bg-creme-dark/40 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading
              eyebrow="Demonstração"
              title="Veja o envelope abrir"
              subtitle="Clique no envelope abaixo e veja como a pessoa vai receber a sua cartinha."
            />
            <DemoSection />
          </div>
        </section>

        {/* Benefícios */}
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading eyebrow="Benefícios" title="Tudo o que sua cartinha tem" />
            <Benefits />
          </div>
        </section>

        {/* Planos */}
        <section id="planos" className="bg-creme-dark/40 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading
              eyebrow="Planos"
              title="Escolha por quanto tempo ela dura"
              subtitle="Pagamento único por cartinha. Sem mensalidade."
            />
            <Plans />
            <div className="mt-8">
              <Guarantee />
            </div>
          </div>
        </section>

        {/* Depoimentos */}
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading eyebrow="Depoimentos" title="Quem já surpreendeu alguém" />
            <Testimonials />
          </div>
        </section>

        {/* Dúvidas */}
        <section id="duvidas" className="bg-creme-dark/40 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHeading eyebrow="Dúvidas frequentes" title="Perguntas que sempre chegam" />
            <Faq />
          </div>
        </section>

        {/* CTA final */}
        <section className="px-4 py-16">
          <FinalCta />
        </section>
      </main>

      <Footer />
    </>
  );
}
