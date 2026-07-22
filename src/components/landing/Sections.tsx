import Link from "next/link";
import { plans, formatBRL } from "@/config/plans";
import { site, guarantee, positioning } from "@/config/site";
import { MAX_CART_PHOTOS } from "@/lib/image";
import { recipients } from "@/content/recipients";
import { occasions } from "@/content/occasions";
import { testimonials, testimonialsAreDemo } from "@/content/testimonials";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      {eyebrow && (
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-dourado">
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl font-semibold text-vinho sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-grafite/60">{subtitle}</p>}
    </div>
  );
}

export function HowItWorks() {
  const steps = [
    { icon: "✍️", title: "Crie", text: "Escolha para quem é, escreva o título e a mensagem. Sem ideias? Use nossos modelos." },
    { icon: "🎨", title: "Personalize", text: `Adicione até ${MAX_CART_PHOTOS} fotos, uma música e um contador de tempo. Escolha o tema visual.` },
    { icon: "💌", title: "Pague e compartilhe", text: "Pagamento único, sem cadastro. Receba o link exclusivo e envie por WhatsApp." },
  ];
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {steps.map((s, i) => (
        <div key={s.title} className="rounded-2xl border border-rosa/20 bg-white p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rosa-soft text-2xl">
            {s.icon}
          </div>
          <p className="mb-1 text-xs font-semibold text-dourado">Passo {i + 1}</p>
          <h3 className="mb-2 text-lg font-semibold text-vinho">{s.title}</h3>
          <p className="text-sm text-grafite/60">{s.text}</p>
        </div>
      ))}
    </div>
  );
}

export function ForWhom() {
  const chips = [
    ...recipients.filter((r) => r.id !== "outro").map((r) => `${r.emoji} ${r.label}`),
    ...occasions.filter((o) => o.id !== "outra").slice(0, 5).map((o) => `${o.emoji} ${o.label}`),
  ];
  return (
    <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2.5">
      {chips.map((c) => (
        <span
          key={c}
          className="rounded-full border border-rosa/30 bg-white px-4 py-2 text-sm text-grafite/75"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

export function Benefits() {
  const items = [
    { icon: "⏱️", title: "Pronta em minutos", text: "Quatro etapas simples e um preview que mostra o resultado em tempo real." },
    { icon: "🔗", title: "Link exclusivo", text: "Um endereço só de vocês, privado e difícil de adivinhar." },
    { icon: "🎵", title: "Fotos e música", text: `Até ${MAX_CART_PHOTOS} fotos e a música de vocês tocando ao abrir o envelope.` },
    { icon: "📱", title: "Funciona no celular", text: "Abre no navegador, sem instalar nenhum aplicativo." },
    { icon: "🙅", title: "Não exige cadastro", text: "Monte e envie sem criar conta nem senha." },
    { icon: "💳", title: "Pagamento único", text: "Você paga uma vez por cartinha. Sem mensalidade." },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.title} className="flex gap-3 rounded-2xl border border-rosa/20 bg-white p-5">
          <span className="text-2xl">{it.icon}</span>
          <div>
            <h3 className="font-semibold text-vinho">{it.title}</h3>
            <p className="mt-0.5 text-sm text-grafite/60">{it.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Plans() {
  return (
    <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
      {plans.map((plan) => (
        <div
          key={plan.type}
          className={`relative rounded-2xl border-2 bg-white p-6 ${
            plan.highlight ? "border-dourado shadow-lg" : "border-rosa/25"
          }`}
        >
          {plan.badge && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-dourado px-3 py-1 text-xs font-semibold text-white">
              {plan.badge}
            </span>
          )}
          <h3 className="text-lg font-semibold text-vinho">{plan.name}</h3>
          <p className="mt-2">
            <span className="text-3xl font-bold text-vinho">{formatBRL(plan.priceCents)}</span>
            <span className="ml-1 text-sm text-grafite/50">único</span>
          </p>
          <ul className="mt-4 space-y-2 text-sm text-grafite/70">
            {plan.features.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-green-600">✓</span> {f}
              </li>
            ))}
          </ul>
          <Link
            href="/criar"
            className={`mt-6 block rounded-full px-5 py-3 text-center text-sm font-semibold transition ${
              plan.highlight
                ? "bg-vinho text-creme hover:bg-vinho-deep"
                : "border border-vinho text-vinho hover:bg-vinho hover:text-creme"
            }`}
          >
            Criar com o plano {plan.name}
          </Link>
        </div>
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <div>
      {testimonialsAreDemo && (
        <p className="mx-auto mb-6 w-fit rounded-full bg-dourado/15 px-4 py-1.5 text-center text-xs font-medium text-grafite/70">
          Exemplos de demonstração — serão substituídos por depoimentos reais
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {testimonials.map((t) => (
          <figure key={t.name} className="rounded-2xl border border-rosa/20 bg-white p-5">
            <div className="mb-2 text-dourado">★★★★★</div>
            <blockquote className="text-sm leading-relaxed text-grafite/75">
              “{t.text}”
            </blockquote>
            <figcaption className="mt-3 text-sm font-medium text-vinho">
              {t.name} <span className="font-normal text-grafite/50">· {t.relation}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function Guarantee() {
  if (!guarantee.enabled) return null;
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-dourado/40 bg-dourado/10 p-6 text-center">
      <div className="mb-2 text-3xl">🛡️</div>
      <h3 className="font-semibold text-vinho">{guarantee.title}</h3>
      <p className="mt-1 text-sm text-grafite/70">{guarantee.text}</p>
    </div>
  );
}

export function FinalCta() {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl bg-vinho px-6 py-12 text-center text-creme">
      <h2 className="text-3xl font-semibold sm:text-4xl">{positioning.closingTitle}</h2>
      <p className="mx-auto mt-3 max-w-md text-creme/80">{positioning.closingSubtitle}</p>
      <Link
        href="/criar"
        className="mt-8 inline-block rounded-full bg-dourado px-8 py-4 text-base font-semibold text-vinho shadow-lg transition hover:brightness-105"
      >
        {positioning.heroCta} →
      </Link>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-rosa/20 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-grafite/60 sm:flex-row">
        <div>
          <p className="font-serif text-lg font-bold text-vinho">{site.name}</p>
          <p className="text-xs">Um produto {site.company}</p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/criar" className="hover:text-vinho">Criar cartinha</Link>
          <Link href="/demonstracao" className="hover:text-vinho">Demonstração</Link>
          <Link href="/termos" className="hover:text-vinho">Termos</Link>
          <Link href="/privacidade" className="hover:text-vinho">Privacidade</Link>
        </nav>
      </div>
    </footer>
  );
}
