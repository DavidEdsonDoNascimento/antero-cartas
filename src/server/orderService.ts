import { prisma } from "@/lib/db";
import { ApiError } from "@/server/errors";
import { getPlan } from "@/config/plans";
import { site } from "@/config/site";
import { publishCartWithClient } from "@/server/cartService";
import { dbToDomainCart, type DbCartRow } from "@/lib/cartMapping";
import { getPaymentProvider, isMockConfirmationAllowed } from "@/server/payment";
import { getEmailProvider } from "@/server/email";
import { generateQrDataUrl } from "@/server/qrcode";
import { verifyEditToken } from "@/lib/editToken";
import type { CreateOrderInput } from "@/server/schemas";
import type { Cart } from "@/lib/types";

const cartInclude = { media: { orderBy: { position: "asc" as const } } };

export interface OrderSummary {
  id: string;
  cartId: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "EXPIRED" | "CANCELLED";
  planType: "LIMITED" | "PERMANENT";
  amount: number;
  currency: string;
  paidAt: string | null;
  createdAt: string;
}

function toSummary(o: {
  id: string;
  cartId: string;
  status: string;
  planType: string;
  amount: number;
  currency: string;
  paidAt: Date | null;
  createdAt: Date;
}): OrderSummary {
  return {
    id: o.id,
    cartId: o.cartId,
    status: o.status as OrderSummary["status"],
    planType: o.planType as OrderSummary["planType"],
    amount: o.amount,
    currency: o.currency,
    paidAt: o.paidAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  };
}

// --- Criação de pedido -------------------------------------------------------

/**
 * Cria um pedido para a carta. Idempotente: se já existir um pedido PENDING
 * para esta carta, reaproveita em vez de criar outro (evita duplicidade em
 * duplo clique / atualização da página de checkout).
 */
export async function createOrder(
  token: string | null,
  input: CreateOrderInput,
): Promise<OrderSummary> {
  if (!token) throw new ApiError("unauthorized", "Token de edição ausente.");

  const cart = await prisma.cart.findUnique({
    where: { id: input.cartId },
    include: cartInclude,
  });
  if (!cart) throw new ApiError("not_found", "Rascunho não encontrado.");
  if (!verifyEditToken(token, cart.editTokenHash)) {
    throw new ApiError("unauthorized", "Token de edição inválido.");
  }
  if (cart.status !== "DRAFT" && cart.status !== "AWAITING_PAYMENT") {
    throw new ApiError("forbidden_state", "Esta carta já foi processada.");
  }
  const contentOk = cart.title.trim() && cart.message.trim() && cart.senderName.trim() && cart.recipientType;
  if (!contentOk) {
    throw new ApiError("conflict", "Complete a cartinha antes de ir para o pagamento.");
  }

  const existingPending = await prisma.order.findFirst({
    where: { cartId: cart.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (existingPending && existingPending.planType === input.planType) {
    return toSummary(existingPending);
  }

  // Preço é sempre calculado no servidor — nunca confiar no navegador.
  const plan = getPlan(input.planType);
  const provider = getPaymentProvider();

  const order = await prisma.$transaction(async (tx) => {
    await tx.cart.update({
      where: { id: cart.id },
      data: { planType: input.planType, status: "AWAITING_PAYMENT" },
    });
    const created = await tx.order.create({
      data: {
        cartId: cart.id,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone || null,
        planType: input.planType,
        amount: plan.priceCents,
        currency: "BRL",
        paymentMethod: "MOCK",
        provider: provider.name,
        status: "PENDING",
      },
    });
    return created;
  });

  const payment = await provider.createPayment({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    method: "MOCK",
  });
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { providerPaymentId: payment.providerPaymentId },
  });

  return toSummary(updated);
}

export async function getOrderStatus(orderId: string): Promise<OrderSummary> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ApiError("not_found", "Pedido não encontrado.");
  return toSummary(order);
}

/**
 * Resultado completo do pedido (somente leitura, sem efeitos colaterais).
 * Quando PAID, inclui a carta, o link público e o QR Code — usado pela
 * página de sucesso para exibir o resultado sem repetir a confirmação.
 */
export async function getOrderResult(orderId: string): Promise<MockConfirmResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ApiError("not_found", "Pedido não encontrado.");
  return buildResultFromExisting(order);
}

// --- Confirmação mock (idempotente) -----------------------------------------

export type MockConfirmAction = "success" | "fail" | "expire";

export interface MockConfirmResult {
  order: OrderSummary;
  cart: Cart | null;
  publicUrl: string | null;
  qrCodeDataUrl: string | null;
}

/**
 * Confirma (ou simula falha/expiração) o pagamento mock.
 * Idempotente: chamadas repetidas para um pedido já resolvido retornam o
 * mesmo resultado, sem duplicar publicação, slug ou e-mail.
 */
export async function mockConfirmOrder(
  orderId: string,
  action: MockConfirmAction,
): Promise<MockConfirmResult> {
  if (!isMockConfirmationAllowed()) {
    throw new ApiError(
      "mock_disabled",
      "Confirmação mock desativada. Configure PAYMENT_MODE=mock e ALLOW_MOCK_PAYMENT_CONFIRMATION=true.",
    );
  }

  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) throw new ApiError("not_found", "Pedido não encontrado.");

  // Já resolvido: devolve o estado atual sem repetir efeitos colaterais.
  if (existing.status !== "PENDING") {
    return buildResultFromExisting(existing);
  }

  if (action !== "success") {
    const nextStatus = action === "fail" ? "FAILED" : "EXPIRED";
    const res = await prisma.order.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: { status: nextStatus },
    });
    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    void res;
    return { order: toSummary(finalOrder), cart: null, publicUrl: null, qrCodeDataUrl: null };
  }

  // Guard atômico: só um caller vence a corrida (updateMany condicional).
  const now = new Date();
  const claim = await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: { status: "PAID", paidAt: now },
  });

  if (claim.count === 0) {
    // Outra requisição confirmou entre a leitura e a escrita: idempotente.
    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    return buildResultFromExisting(finalOrder);
  }

  const publishedRow = await prisma.$transaction((tx) =>
    publishCartWithClient(tx, existing.cartId, now),
  );

  const cart = dbToDomainCart(publishedRow as unknown as DbCartRow);
  const publicUrl = `${site.url}/c/${cart.slug}`;
  const qrCodeDataUrl = await generateQrDataUrl(publicUrl);

  await deliverPublishedEmail(orderId, existing.customerName, existing.customerEmail, cart, publicUrl, qrCodeDataUrl);

  const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return { order: toSummary(finalOrder), cart, publicUrl, qrCodeDataUrl };
}

async function buildResultFromExisting(existing: {
  id: string;
  cartId: string;
  status: string;
}): Promise<MockConfirmResult> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: existing.id } });
  if (order.status !== "PAID") {
    return { order: toSummary(order), cart: null, publicUrl: null, qrCodeDataUrl: null };
  }
  const cartRow = await prisma.cart.findUnique({
    where: { id: existing.cartId },
    include: cartInclude,
  });
  const cart = cartRow ? dbToDomainCart(cartRow as unknown as DbCartRow) : null;
  const publicUrl = cart?.slug ? `${site.url}/c/${cart.slug}` : null;
  const qrCodeDataUrl = publicUrl ? await generateQrDataUrl(publicUrl) : null;
  return { order: toSummary(order), cart, publicUrl, qrCodeDataUrl };
}

/**
 * Registra e "envia" (mock) o e-mail de carta publicada, usando EmailDelivery
 * como outbox: a unicidade [orderId, type] garante um único envio mesmo sob
 * confirmações concorrentes.
 */
async function deliverPublishedEmail(
  orderId: string,
  customerName: string,
  customerEmail: string,
  cart: Cart,
  publicUrl: string,
  qrCodeDataUrl: string | null,
): Promise<void> {
  const type = "cart_published";
  try {
    await prisma.emailDelivery.create({
      data: { orderId, type, recipient: customerEmail, status: "PENDING", payload: "" },
    });
  } catch {
    return; // já existe (unique constraint) — outra chamada já está cuidando disso.
  }

  const provider = getEmailProvider();
  const planLabel = cart.planType === "PERMANENT" ? "Para Sempre" : "Essencial";
  try {
    const rendered = await provider.sendCartPublished({
      to: customerEmail,
      customerName,
      cartTitle: cart.title || site.name,
      publicUrl,
      qrCodeDataUrl,
      planLabel,
      expiresAt: cart.expiresAt,
    });
    await prisma.emailDelivery.update({
      where: { orderId_type: { orderId, type } },
      data: {
        status: "SENT",
        payload: JSON.stringify(rendered),
        attempts: { increment: 1 },
        sentAt: new Date(),
      },
    });
  } catch {
    await prisma.emailDelivery.update({
      where: { orderId_type: { orderId, type } },
      data: { status: "FAILED", attempts: { increment: 1 } },
    });
  }
}
