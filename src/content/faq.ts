import { MAX_CART_PHOTOS } from "@/lib/image";

export interface FaqItem {
  q: string;
  a: string;
}

/** Pelo menos 8 perguntas frequentes (Landing). */
export const faq: FaqItem[] = [
  {
    q: "Preciso instalar algum aplicativo?",
    a: "Não. A cartinha abre direto no navegador do celular ou do computador, por um link exclusivo. Quem recebe não precisa instalar nada nem criar conta.",
  },
  {
    q: "Preciso criar uma conta para montar a cartinha?",
    a: "Não é preciso cadastro para montar e comprar. Você monta tudo em poucos minutos e recebe o link por e-mail depois da confirmação.",
  },
  {
    q: "Quanto tempo leva para ficar pronta?",
    a: "Em média 3 minutos. São quatro etapas simples: para quem é, título e mensagem, personalização e assinatura.",
  },
  {
    q: "Consigo colocar fotos e música?",
    a: `Sim. Você pode adicionar até ${MAX_CART_PHOTOS} fotos e uma música: pesquise pelo nome da música ou do artista, ou cole o link do YouTube. A música começa a tocar quando a pessoa abre o envelope. A reprodução depende da disponibilidade do vídeo no YouTube.`,
  },
  {
    q: "Como a pessoa recebe a cartinha?",
    a: "Você recebe um link e um QR Code exclusivos e pode compartilhar por WhatsApp, mensagem ou como preferir. Ao abrir, aparece um envelope para a pessoa clicar e revelar a carta.",
  },
  {
    q: "Por quanto tempo a cartinha fica disponível?",
    a: "Depende do plano escolhido. O plano Essencial mantém a cartinha por um período determinado; o plano Para Sempre não tem data para expirar.",
  },
  {
    q: "O pagamento é único ou é mensalidade?",
    a: "É pagamento único por cartinha. Não existe mensalidade nem cobrança recorrente.",
  },
  {
    q: "A cartinha é privada?",
    a: "Sim. O link é longo e difícil de adivinhar, as cartinhas não aparecem em buscas e não existe galeria pública. Só quem tem o link consegue abrir.",
  },
  {
    q: "Posso escolher o visual da cartinha?",
    a: "Sim. Você escolhe entre temas visuais diferentes e vê o resultado no preview em tempo real enquanto monta.",
  },
];
