/**
 * Limites de tamanho de texto — fonte única, usada no cliente e no servidor.
 * Não confiar apenas na validação do cliente: as rotas também aplicam estes
 * limites via Zod (ver server/schemas.ts).
 */
export const LIMITS = {
  recipientName: 40,
  occasion: 60,
  title: 80,
  message: 1200,
  senderName: 40,
  signature: 60,
  customerName: 80,
  customerEmail: 160,
  customerPhone: 30,
} as const;

/** Limite central de fotos por cartinha (configurável por env). */
export const MAX_CART_PHOTOS = Number(process.env.NEXT_PUBLIC_MAX_CART_PHOTOS) || 6;
/** Tamanho máximo aceito por upload (antes de comprimir). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
