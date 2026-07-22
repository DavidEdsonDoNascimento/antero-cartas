import type { Cart, CartMedia } from "@/lib/types";

/**
 * Carta fictícia de demonstração (marcada como demo).
 * Usada na landing e em /demonstracao para mostrar o produto sem dados reais.
 * As "fotos" são SVGs embutidos (sem rede) só para exibir o carrossel.
 */
function demoPhoto(id: string, from: string, to: string, emoji: string, position: number): CartMedia {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><defs><linearGradient id='g${id}' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs><rect width='400' height='300' fill='url(#g${id})'/><text x='200' y='185' font-size='110' text-anchor='middle'>${emoji}</text></svg>`;
  return {
    id: `media_demo_${id}`,
    cartId: "cart_demo",
    type: "photo",
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    storageKey: null,
    position,
    createdAt: new Date().toISOString(),
  };
}

export function demoCart(): Cart {
  const now = new Date().toISOString();
  return {
    id: "cart_demo",
    slug: "demonstracao",
    status: "PUBLISHED",
    recipientType: "namorada",
    recipientName: "Ana",
    occasion: "declaracao",
    title: "Para o meu amor",
    message:
      "Se eu pudesse escolher de novo, escolheria você mil vezes.\n\nObrigado por cada risada, cada abraço e por transformar os dias comuns nas melhores lembranças. Que a gente continue escrevendo essa história juntos, sem pressa e com muito carinho.",
    senderName: "Lucas",
    signature: "Com todo o meu amor,",
    theme: "romantico",
    music: null,
    relationshipStartDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 862).toISOString(),
    showRelationshipCounter: true,
    planType: "PERMANENT",
    media: [
      demoPhoto("1", "#681d35", "#d98c9f", "💗", 0),
      demoPhoto("2", "#c6a15b", "#fff9f4", "🌅", 1),
      demoPhoto("3", "#4e1528", "#c6a15b", "✨", 2),
    ],
    expiresAt: null,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
