/**
 * Configuração central da marca e textos comerciais.
 * Nome, logotipo e copy ficam aqui para facilitar testes e troca rápida.
 * Nada de valores comerciais espalhados pelos componentes.
 */

export const site = {
  name: "Antero Cartas",
  company: "Antero Sistemas",
  tagline: "Uma surpresa simples que vira lembrança",
  description:
    "Crie uma cartinha digital com mensagem, fotos, música e contador de tempo. Ela abre no celular por um link exclusivo — sem app, sem cadastro. Pronta em poucos minutos.",
  // Ajuste para o domínio real quando publicar.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://cartas.anterosistemas.com.br",
  // Número usado nos links de ajuda por WhatsApp (somente dígitos, com DDI).
  whatsappSupport: process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT ?? "5599999999999",
} as const;

/**
 * Frases de posicionamento reaproveitáveis (podem ser refinadas depois).
 */
export const positioning = {
  heroTitle: "Transforme suas palavras em uma",
  heroHighlight: "experiência inesquecível",
  heroSubtitle:
    "Uma cartinha digital com a sua mensagem, fotos e música. Ela abre no celular por um link só de vocês — sem instalar nada, sem criar conta.",
  heroCta: "Criar minha cartinha",
  topbar: ["Pagamento único", "Sem mensalidade", "Entrega digital na hora"],
  closingTitle: "Pronto para preparar a surpresa?",
  closingSubtitle:
    "Você escolhe as lembranças. A gente ajuda a transformar tudo em um presente que emociona.",
} as const;

/**
 * Texto de garantia. Configurável — não afirmamos garantia legal/comercial
 * sem confirmação da Antero. Deixe `enabled: false` até validar.
 */
export const guarantee = {
  enabled: false,
  title: "Feito com cuidado",
  text: "Se algo não sair como esperado com a sua cartinha, fale com a gente pelo WhatsApp e vamos ajudar você.",
} as const;
