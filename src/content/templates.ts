import type { RecipientType } from "@/lib/types";

/**
 * Modelos de mensagem para o botão "Preciso de inspiração".
 * Tudo local, sem IA (feature flag AI_WRITING_ASSISTANT controla o futuro).
 * A pessoa insere um modelo e depois pode editar livremente.
 */

export interface MessageTemplate {
  title: string;
  message: string;
}

const byRecipient: Partial<Record<RecipientType, MessageTemplate[]>> = {
  namorada: [
    {
      title: "Pra você, meu amor",
      message:
        "Se eu pudesse escolher de novo, escolheria você mil vezes. Obrigado por cada risada, cada abraço e por transformar os dias comuns em lembranças que eu quero guardar pra sempre. Te amo mais do que as palavras conseguem dizer.",
    },
    {
      title: "O meu lugar favorito é você",
      message:
        "Não importa onde a gente esteja, do seu lado eu me sinto em casa. Queria que você soubesse o quanto é especial pra mim e o quanto eu sou grato por ter você comigo. Você faz tudo valer a pena.",
    },
  ],
  namorado: [
    {
      title: "Pra você, meu amor",
      message:
        "Você chegou e deixou tudo mais leve. Obrigada por me ouvir, por me fazer rir e por estar comigo mesmo nos dias difíceis. Eu amo o jeito que a gente se entende. Te amo, hoje e sempre.",
    },
    {
      title: "Do meu jeito, com todo o coração",
      message:
        "Escrever isso é a minha forma de dizer o que às vezes não cabe num abraço: você é muito importante pra mim. Obrigada por cada momento nosso. Que venham muitos outros.",
    },
  ],
  esposa: [
    {
      title: "À mulher da minha vida",
      message:
        "Construir a vida ao seu lado é a melhor decisão que eu já tomei. Obrigado por caminhar comigo, por acreditar em nós e por fazer da nossa casa um lugar tão bom de voltar. Te amo cada dia mais.",
    },
  ],
  marido: [
    {
      title: "Ao homem da minha vida",
      message:
        "Com você eu aprendi que amor também é parceria no dia a dia. Obrigada por cuidar de nós, por me apoiar e por seguir de mãos dadas comigo. Eu te escolho todos os dias.",
    },
  ],
  mae: [
    {
      title: "Pra minha mãe, com amor",
      message:
        "Mãe, obrigada por tudo o que você é. Pelo colo, pelos conselhos e por nunca soltar a minha mão. Tudo o que eu tenho de bom começou com você. Te amo mais do que consigo mostrar.",
    },
  ],
  pai: [
    {
      title: "Pro meu pai",
      message:
        "Pai, obrigado por ser meu exemplo. Por cada lição em silêncio e por estar sempre por perto quando eu precisei. Você me ensinou o que é ser forte e gentil ao mesmo tempo. Te amo.",
    },
  ],
  amigo: [
    {
      title: "Pra uma amizade que é presente",
      message:
        "Amizade de verdade é rara, e a nossa é dessas. Obrigado por estar comigo nas melhores histórias e também nos perrengues. Você faz a vida ficar mais divertida. Valeu por tudo, de coração.",
    },
  ],
  filho: [
    {
      title: "Pro meu maior orgulho",
      message:
        "Ver você crescer é o meu maior presente. Quero que você saiba que eu me orgulho de quem você é e que pode contar comigo pra sempre. Te amo com todo o meu coração.",
    },
  ],
};

const genericTemplates: MessageTemplate[] = [
  {
    title: "Uma mensagem do coração",
    message:
      "Preparei esse cantinho especial só pra dizer o quanto você é importante pra mim. Obrigado por fazer parte da minha vida e por todos os momentos que a gente já viveu. Que venham muitos outros.",
  },
  {
    title: "Só pra te lembrar",
    message:
      "Às vezes a correria não deixa a gente dizer o que sente. Então parei tudo pra te dizer: você faz diferença na minha vida. Guarde essa cartinha como um abraço meu, sempre que quiser.",
  },
];

export function getTemplates(recipient: RecipientType | null): MessageTemplate[] {
  const specific = recipient ? byRecipient[recipient] : undefined;
  return [...(specific ?? []), ...genericTemplates];
}
