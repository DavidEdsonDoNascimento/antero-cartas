import { MAX_CART_PHOTOS } from "@/lib/image";
import { PLAN_LIMITED_DURATION_DAYS } from "@/config/plans";

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * Dúvidas da landing: só o que decide a compra. Cada resposta afirma apenas o
 * que o produto faz hoje (prazo e limite de fotos vêm da configuração).
 */
export const faq: FaqItem[] = [
  {
    q: "Preciso instalar um aplicativo ou criar uma conta?",
    a: "Não. Você monta a cartinha no navegador, sem cadastro. Quem recebe abre o link no celular ou no computador, sem instalar nada.",
  },
  {
    q: "Como a pessoa recebe a cartinha?",
    a: "Depois da confirmação do pagamento, você recebe um link e um QR Code exclusivos e compartilha por WhatsApp, mensagem ou como preferir. Ao abrir, aparece um envelope para a pessoa tocar e revelar a carta.",
  },
  {
    q: "Posso colocar fotos e música?",
    a: `Sim. Você pode adicionar até ${MAX_CART_PHOTOS} fotos e uma música: pesquise pelo nome da música ou do artista, ou cole o link do YouTube. A música começa a tocar quando a pessoa abre o envelope. A reprodução depende da disponibilidade do vídeo no YouTube.`,
  },
  {
    q: "Por quanto tempo a cartinha fica disponível?",
    a: `No plano Essencial, por ${PLAN_LIMITED_DURATION_DAYS} dias. No plano Para Sempre, sem data para expirar.`,
  },
  {
    q: "Como funciona o pagamento?",
    a: "É um pagamento único por cartinha, sem mensalidade, por Pix ou cartão. Você só paga no final, depois de montar a carta e ver como ela ficou.",
  },
  {
    q: "A cartinha é privada?",
    a: "O link da cartinha é longo e difícil de adivinhar, as cartinhas não aparecem em buscas e não existe galeria pública. Quem tem esse link consegue abrir a carta inteira: se ele for encaminhado, a outra pessoa também vai conseguir ler.",
  },
  {
    q: "O que aparece quando a pessoa compartilha que ganhou?",
    a: "Quem recebe pode tocar em “Compartilhar que ganhei”. Isso envia um outro link, de prévia, que mostra o cenário, a primeira foto, o primeiro nome de quem recebeu e um pequeno trecho do começo da mensagem. O resto da carta, as outras fotos e a assinatura não aparecem, e a prévia não abre a carta. Esse link deixa de funcionar quando a cartinha expira, mas aplicativos como o WhatsApp podem guardar a imagem e o texto da prévia por conta própria.",
  },
];
