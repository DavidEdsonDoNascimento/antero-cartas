import { z } from "zod";
import { LIMITS } from "@/lib/limits";

/** Validação central do servidor. Não confiar apenas no cliente. */

export const recipientTypeEnum = z.enum([
  "namorada",
  "namorado",
  "esposa",
  "marido",
  "mae",
  "pai",
  "amigo",
  "filho",
  "outro",
]);

export const themeEnum = z.enum(["romantico", "elegante", "delicado", "celebracao"]);
export const planEnum = z.enum(["LIMITED", "PERMANENT"]);

export const musicSchema = z
  .object({
    videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/),
    youtubeUrl: z.string().url().max(300),
    title: z.string().max(200).optional(),
    channelTitle: z.string().max(200).optional(),
    thumbnailUrl: z.string().url().max(500).optional(),
    source: z.enum(["search", "manual"]),
  })
  .nullable();

/** Atualização parcial do rascunho (autosave). Todos os campos opcionais. */
export const draftUpdateSchema = z
  .object({
    recipientType: recipientTypeEnum.nullable(),
    recipientName: z.string().max(LIMITS.recipientName),
    occasion: z.string().max(LIMITS.occasion).nullable(),
    title: z.string().max(LIMITS.title),
    message: z.string().max(LIMITS.message),
    senderName: z.string().max(LIMITS.senderName),
    signature: z.string().max(LIMITS.signature),
    theme: themeEnum,
    music: musicSchema,
    relationshipStartDate: z.string().datetime().nullable(),
    showRelationshipCounter: z.boolean(),
    planType: planEnum.nullable(),
    /** updatedAt conhecido pelo cliente, para proteção contra corrida. */
    clientUpdatedAt: z.string().datetime().optional(),
  })
  .partial()
  .strict();

export type DraftUpdateInput = z.infer<typeof draftUpdateSchema>;

/** Reordenação das fotos: lista completa de ids na nova ordem. */
export const reorderSchema = z.object({
  order: z.array(z.string().min(1)).min(1).max(24),
});

/** Criação de pedido. O valor NÃO vem do cliente — é calculado no servidor. */
export const createOrderSchema = z.object({
  cartId: z.string().min(1),
  planType: planEnum,
  customerName: z.string().trim().min(1).max(LIMITS.customerName),
  customerEmail: z.string().trim().email().max(LIMITS.customerEmail),
  customerPhone: z
    .string()
    .trim()
    .max(LIMITS.customerPhone)
    .optional()
    .or(z.literal("")),
  acceptTerms: z.literal(true),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Corpo do pagamento de cartão: só o token gerado pelo Payment Brick no
 * navegador chega aqui — nunca número, validade ou CVV (task 013, seção 8).
 */
export const cardPaymentSchema = z.object({
  token: z.string().min(1).max(200),
  installments: z.number().int().min(1).max(24),
  paymentMethodId: z.string().min(1).max(50),
  issuerId: z.string().max(50).optional(),
});

export type CardPaymentInput = z.infer<typeof cardPaymentSchema>;
