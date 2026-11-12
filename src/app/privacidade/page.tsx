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
            expõem dados de outras cartinhas. Quem tem o link consegue abrir a carta inteira, sem
            senha: se o link for encaminhado, quem o receber também poderá lê-la.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-grafite">3.1 Prévia de compartilhamento</h2>
          <p>
            Cada cartinha publicada também tem um link de prévia, separado do link da carta e que
            não leva a ela. Ele só circula se alguém com o link da carta usar “Compartilhar que
            ganhei”. A prévia mostra o cenário do estilo escolhido, a primeira foto, o primeiro
            nome de quem recebe, um pequeno trecho do começo da mensagem (cortado no servidor) e
            se a carta tem música. Não mostra o restante da mensagem, as outras fotos, a
            assinatura nem o nome de quem enviou. A foto da prévia é gerada de novo, sem os dados
            internos do arquivo (como a localização). Quem cria a carta é avisado disso antes do
            pagamento. Cartinhas criadas antes desta regra mostram só o cenário e o envelope.
          </p>
          <p className="mt-2">
            O link de prévia deixa de funcionar quando a cartinha expira ou o pagamento é
            estornado, e não aparece em buscas. Não há opção para desativá-lo antes disso: quem
            quiser retirá-lo pode falar com o suporte. Aplicativos e redes sociais (como o
            WhatsApp) podem guardar a imagem e o texto da prévia em seus próprios servidores; essas
            cópias não ficam sob nosso controle e não são apagadas quando a cartinha expira.
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
