/**
 * Requisitos de conteúdo para publicar (`assertPublishable`).
 *
 * Remetente é opcional (decisão O1, relatório 2026-11-03, seção J.4): uma
 * carta sem nome de quem envia é publicável. Título, mensagem, tipo de
 * destinatário e plano continuam obrigatórios.
 *
 * Banco falso: só a regra é testada aqui. O fluxo completo (pedido, pagamento
 * simulado, webhook e leitura pública) está em
 * `optionalSender.integration.test.ts`.
 */
import { describe, it, expect, vi } from "vitest";
import type { DbCartRow } from "@/lib/cartMapping";
import { ApiError } from "@/server/errors";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { assertPublishable } = await import("@/server/cartService");

function row(overrides: Partial<DbCartRow> = {}): DbCartRow {
  const now = new Date();
  return {
    id: "cart_publicavel",
    slug: null,
    status: "AWAITING_PAYMENT",
    recipientType: "amigo",
    recipientName: "",
    occasion: null,
    title: "Uma cartinha para você",
    message: "Mensagem de teste",
    senderName: "Testador",
    signature: "",
    theme: "romantico",
    musicVideoId: null,
    musicUrl: null,
    musicTitle: null,
    musicChannelTitle: null,
    musicThumbnailUrl: null,
    musicSource: null,
    relationshipStartDate: null,
    showRelationshipCounter: false,
    planType: "LIMITED",
    expiresAt: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    media: [],
    ...overrides,
  };
}

function conflictOf(fn: () => void): ApiError | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
}

describe("assertPublishable", () => {
  it("aceita a carta completa com remetente (comportamento anterior)", () => {
    expect(() => assertPublishable(row())).not.toThrow();
  });

  it("aceita remetente vazio", () => {
    expect(() => assertPublishable(row({ senderName: "" }))).not.toThrow();
  });

  it("aceita remetente só com espaços", () => {
    expect(() => assertPublishable(row({ senderName: "   " }))).not.toThrow();
  });

  it("aceita carta sem remetente e sem assinatura", () => {
    expect(() => assertPublishable(row({ senderName: "", signature: "" }))).not.toThrow();
  });

  it.each([
    ["título vazio", { title: "" }],
    ["título só com espaços", { title: "   " }],
    ["mensagem vazia", { message: "" }],
    ["mensagem só com espaços", { message: " \n\t " }],
    ["sem tipo de destinatário", { recipientType: null }],
    ["sem plano", { planType: null }],
  ] as const)("continua recusando %s, mesmo sem remetente", (_label, missing) => {
    const err = conflictOf(() => assertPublishable(row({ senderName: "", ...missing })));
    expect(err?.code).toBe("conflict");
  });
});
