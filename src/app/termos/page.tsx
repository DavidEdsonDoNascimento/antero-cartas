import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Termos de uso",
  robots: { index: false },
};

export default function TermosPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm font-medium text-vinho">
        ← {site.name}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-vinho">Termos de uso</h1>
      <p className="mt-2 text-sm text-grafite/50">
        Rascunho inicial — deve ser revisado juridicamente antes da publicação em produção.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-grafite/75">
        <section>
          <h2 className="mb-1 font-semibold text-grafite">1. O serviço</h2>
          <p>
            O {site.name}, um produto da {site.company}, permite criar cartinhas digitais
            com mensagem, fotos, música e contador de tempo, acessíveis por um link privado.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-grafite">2. Uso adequado</h2>
          <p>
            Você é responsável pelo conteúdo que inclui na cartinha. Não é permitido usar o
            serviço para conteúdo ilegal, ofensivo ou que viole direitos de terceiros,
            incluindo direitos autorais de imagens e músicas.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-grafite">3. Pagamento e disponibilidade</h2>
          <p>
            A cartinha é um produto de pagamento único. O período de disponibilidade depende
            do plano escolhido. Os valores e prazos vigentes são exibidos no momento da compra.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-grafite">4. Privacidade</h2>
          <p>
            O tratamento de dados pessoais segue a nossa{" "}
            <Link href="/privacidade" className="text-vinho underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-grafite">5. Contato</h2>
          <p>Em caso de dúvidas, fale com a {site.company} pelos canais de atendimento.</p>
        </section>
      </div>
    </main>
  );
}
