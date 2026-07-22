/**
 * Modelo de dados mínimo, proporcional ao MVP.
 * Usado localmente na Fase 1 e pronto para persistência (Prisma) na Fase 2.
 */

export type CartStatus =
  | "DRAFT"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "PUBLISHED"
  | "EXPIRED"
  | "CANCELLED";

export type PlanType = "LIMITED" | "PERMANENT";

export type PaymentMethod = "PIX" | "CARD";

export type OrderStatus = "pending" | "paid" | "failed" | "refunded" | "expired";

export type RecipientType =
  | "namorada"
  | "namorado"
  | "esposa"
  | "marido"
  | "mae"
  | "pai"
  | "amigo"
  | "filho"
  | "outro";

export type ThemeId = "romantico" | "elegante" | "delicado" | "celebracao";

export interface CartMedia {
  id: string;
  cartId: string;
  type: "photo";
  /** Data URL (Fase 1) ou URL do storage (Fase 2+). */
  url: string;
  storageKey: string | null;
  position: number;
  createdAt: string;
}

/**
 * Música escolhida — metadados mínimos, sem guardar a resposta bruta da API.
 * `source` distingue busca (YouTube Data API) de link colado manualmente.
 */
export interface SelectedMusic {
  videoId: string;
  youtubeUrl: string;
  title?: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  source: "search" | "manual";
}

export interface Cart {
  id: string;
  slug: string | null;
  status: CartStatus;
  recipientType: RecipientType | null;
  recipientName: string;
  occasion: string | null;
  title: string;
  message: string;
  senderName: string;
  signature: string;
  theme: ThemeId;
  music: SelectedMusic | null;
  relationshipStartDate: string | null;
  showRelationshipCounter: boolean;
  planType: PlanType | null;
  media: CartMedia[];
  expiresAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  cartId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerDocument?: string;
  planType: PlanType;
  /** Valor em centavos. */
  amount: number;
  paymentMethod: PaymentMethod;
  provider: string;
  providerPaymentId: string | null;
  status: OrderStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}
