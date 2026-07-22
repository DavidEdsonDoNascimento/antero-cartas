import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Política de privacidade",
  robots: { index: false },
};

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm font-medium text-vinho">
        ← {site.name}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-vinho">Política de privacidade</h1>
      <p className="mt-2 text-sm text-grafite/50">
        Rascunho inicial alinhado à LGPD — deve ser revisado juridicamente antes da produção.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-grafite/75">
        <section>
          <h2 className="mb-1 font-semibold text-grafite">1. Minimização de dados</h2>
          <p>
            Coletamos apenas o necessário para criar e entregar a cartinha: e-mail e nome do
            comprador, além do conteúdo que você adiciona (mensagem, fotos, música). Dados
            como celular e CPF só são solicitados quando exigidos pelo pagamento ou emissão fiscal.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-grafite">2. Uso das informações</h2>
          <p>
            Usamos seus dados para processar o pagamento, publicar a cartinha, enviar o link
            por e-mail e prestar suporte. Não vendemos seus dados.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-grafite">3. Privacidade das cartinhas</h2>
          <p>
            As cartinhas são acessíveis por um link privado, longo e difícil de adivinhar. Elas
            não são indexadas por mecanismos de busca, não aparecem em galerias públicas e não
            expõem dados de outras cartinhas.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-grafite">4. Retenção</h2>
          <p>
            O conteúdo da cartinha é mantido conforme o plano contratado. Após esse período, ou
            mediante solicitação, os dados podem ser removidos segundo a nossa política de
            retenção configurável.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-grafite">5. Seus direitos</h2>
          <p>
            Você pode solicitar acesso, correção ou exclusão dos seus dados pessoais entrando em
            contato com a {site.company}.
          </p>
        </section>
      </div>
    </main>
  );
}
