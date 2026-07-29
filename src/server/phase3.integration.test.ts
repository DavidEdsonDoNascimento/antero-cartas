/**
 * Testes de INTEGRAÇÃO com banco real (Fase 3 — task 013).
 *
 * Mesmo mecanismo de opt-in de `phase2.integration.test.ts`:
 *
 *   RUN_DB_TESTS=true npm test
 *
 * Foco: idempotência e correção do webhook do Mercado Pago
 * (`applyMercadoPagoWebhook`) e das tentativas de pagamento reais — a parte
 * mais sensível da Fase 3. Os pedidos são criados pelo fluxo mock de sempre
 * (mais simples de montar em teste) e depois "promovidos" manualmente no
 * banco para o estado que uma tentativa Pix/cartão real deixaria — sem
 * chamar a API do Mercado Pago de verdade.
 *
 * Ids de evento/pagamento levam um sufixo aleatório por execução: a
 * idempotência é por (provider, providerEventId) no banco, então reusar o
 * mesmo id literal entre execuções coincidiria com o `PaymentEvent` de uma
 * rodada anterior (o índice único sobrevive mesmo depois do pedido de teste
 * ser removido, já que a relação é `onDelete: SetNull`, não `Cascade`).
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;
const DB_TIMEOUT = 60_000;
const RUN_ID = randomUUID().slice(0, 8);

describe.skipIf(!RUN)("Fase 3 — webhook do Mercado Pago (integração)", { timeout: DB_TIMEOUT }, () => {
  let prisma: typeof import("@/lib/db").prisma;
  let cartService: typeof import("@/server/cartService");
  let orderService: typeof import("@/server/orderService");

  const cartIdsToClean: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    cartService = await import("@/server/cartService");
    orderService = await import("@/server/orderService");
  });

  afterAll(async () => {
    for (const cartId of cartIdsToClean) {
      const orders = await prisma.order.findMany({ where: { cartId }, select: { id: true } });
      await prisma.paymentEvent.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
      await prisma.order.deleteMany({ where: { cartId } });
      await prisma.cart.deleteMany({ where: { id: cartId } });
    }
    await prisma.$disconnect();
  }, DB_TIMEOUT);

  /** Cria um pedido PENDING e o "promove" para o estado de uma tentativa Pix real. */
  async function createPixLikeOrder(providerPaymentId: string) {
    const { cart, editToken } = await cartService.createDraft({
      recipientType: "amigo",
      title: "Fase 3",
      message: "Mensagem de teste de integração da Fase 3",
      senderName: "Testador",
    });
    cartIdsToClean.push(cart.id);

    const order = await orderService.createOrder(editToken, {
      cartId: cart.id,
      planType: "LIMITED",
      customerName: "Comprador Fase 3",
      customerEmail: `fase3.${providerPaymentId}@example.com`,
      acceptTerms: true,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { provider: "mercadopago", paymentMethod: "PIX", providerPaymentId },
    });

    return order;
  }

  it("aprova via webhook, publica exatamente uma vez e ignora notificação duplicada", async () => {
    const paymentId = `mp_dup_001_${RUN_ID}`;
    const order = await createPixLikeOrder(paymentId);

    const first = await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_1_${RUN_ID}`,
      providerPaymentId: paymentId,
      externalReference: order.id,
      status: "approved",
      statusDetail: "accredited",
      type: "payment",
    });
    expect(first).toEqual({ kind: "applied", internalStatus: "PAID" });

    const afterFirst = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterFirst.status).toBe("PAID");
    const cartAfterFirst = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
    expect(cartAfterFirst.status).toBe("PUBLISHED");
    const slugAfterFirst = cartAfterFirst.slug;

    // Mesmo evento de novo (retry do provedor) — mesmo providerEventId.
    const duplicate = await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_1_${RUN_ID}`,
      providerPaymentId: paymentId,
      externalReference: order.id,
      status: "approved",
      statusDetail: "accredited",
      type: "payment",
    });
    expect(duplicate).toEqual({ kind: "duplicate" });

    const cartAfterDuplicate = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
    expect(cartAfterDuplicate.slug).toBe(slugAfterFirst); // não gerou um segundo slug

    const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
    expect(deliveries).toHaveLength(1); // e-mail enviado uma única vez

    // Notificação diferente (novo providerEventId), mesmo pagamento, mesmo
    // status já aplicado — idempotente por transição, não só por dedup de evento.
    const secondEventSameOutcome = await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_2_${RUN_ID}`,
      providerPaymentId: paymentId,
      externalReference: order.id,
      status: "approved",
      statusDetail: "accredited",
      type: "payment",
    });
    expect(secondEventSameOutcome).toEqual({ kind: "no_transition" });
    const deliveriesAfter = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
    expect(deliveriesAfter).toHaveLength(1); // ainda uma única entrega
  });

  it("ignora notificação fora de ordem (pending atrasado depois de approved)", async () => {
    const paymentId = `mp_order_002_${RUN_ID}`;
    const order = await createPixLikeOrder(paymentId);

    await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_a_${RUN_ID}`,
      providerPaymentId: paymentId,
      externalReference: order.id,
      status: "approved",
      statusDetail: "accredited",
      type: "payment",
    });

    // Notificação de "pending" chega atrasada, depois da aprovação já processada.
    const outOfOrder = await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_b_${RUN_ID}`,
      providerPaymentId: paymentId,
      externalReference: order.id,
      status: "pending",
      statusDetail: null,
      type: "payment",
    });
    expect(outOfOrder).toEqual({ kind: "no_transition" });

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("PAID"); // não regrediu para PENDING
  });

  it("ignora notificação de uma tentativa de pagamento já superada", async () => {
    const oldPaymentId = `mp_attempt_old_${RUN_ID}`;
    const order = await createPixLikeOrder(oldPaymentId);

    // Uma nova tentativa (ex.: cartão após Pix expirar) substitui o id atual.
    await prisma.order.update({
      where: { id: order.id },
      data: { providerPaymentId: `mp_attempt_new_${RUN_ID}`, paymentMethod: "CARD" },
    });

    const staleEvent = await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_stale_${RUN_ID}`,
      providerPaymentId: oldPaymentId, // tentativa antiga, já substituída
      externalReference: order.id,
      status: "approved",
      statusDetail: "accredited",
      type: "payment",
    });
    expect(staleEvent).toEqual({ kind: "stale_attempt" });

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("PENDING"); // não foi aprovado pela tentativa antiga
  });

  it("responde 'unknown_order' para external_reference que não existe, sem lançar erro", async () => {
    const outcome = await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_unknown_${RUN_ID}`,
      providerPaymentId: `mp_unknown_${RUN_ID}`,
      externalReference: "pedido-que-nao-existe",
      status: "approved",
      statusDetail: "accredited",
      type: "payment",
    });
    expect(outcome).toEqual({ kind: "unknown_order" });
  });

  it("REFUNDED após PAID é aplicado; nunca republica nem duplica e-mail", async () => {
    const paymentId = `mp_refund_001_${RUN_ID}`;
    const order = await createPixLikeOrder(paymentId);
    await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_paid_${RUN_ID}`,
      providerPaymentId: paymentId,
      externalReference: order.id,
      status: "approved",
      statusDetail: "accredited",
      type: "payment",
    });

    const refunded = await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_refund_${RUN_ID}`,
      providerPaymentId: paymentId,
      externalReference: order.id,
      status: "refunded",
      statusDetail: null,
      type: "payment",
    });
    expect(refunded).toEqual({ kind: "applied", internalStatus: "REFUNDED" });

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("REFUNDED");

    const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
    expect(deliveries).toHaveLength(1); // o estorno não reenvia o e-mail de publicação
  });

  it("rejeitado (rejected) nunca publica a carta", async () => {
    const paymentId = `mp_rejected_001_${RUN_ID}`;
    const order = await createPixLikeOrder(paymentId);
    const outcome = await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_rejected_${RUN_ID}`,
      providerPaymentId: paymentId,
      externalReference: order.id,
      status: "rejected",
      statusDetail: "cc_rejected_insufficient_amount",
      type: "payment",
    });
    expect(outcome).toEqual({ kind: "applied", internalStatus: "FAILED" });

    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
    expect(cart.status).not.toBe("PUBLISHED");
  });

  it("Pix expirado (cancelled + status_detail expired) vira EXPIRED, não CANCELLED", async () => {
    const paymentId = `mp_expired_001_${RUN_ID}`;
    const order = await createPixLikeOrder(paymentId);
    const outcome = await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_expired_${RUN_ID}`,
      providerPaymentId: paymentId,
      externalReference: order.id,
      status: "cancelled",
      statusDetail: "expired",
      type: "payment",
    });
    expect(outcome).toEqual({ kind: "applied", internalStatus: "EXPIRED" });
  });
});

describe.skipIf(!RUN)("Fase 3 — tentativas de pagamento (integração)", { timeout: DB_TIMEOUT }, () => {
  let prisma: typeof import("@/lib/db").prisma;
  let cartService: typeof import("@/server/cartService");
  let orderService: typeof import("@/server/orderService");

  const cartIdsToClean: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    cartService = await import("@/server/cartService");
    orderService = await import("@/server/orderService");
  });

  afterAll(async () => {
    for (const cartId of cartIdsToClean) {
      await prisma.order.deleteMany({ where: { cartId } });
      await prisma.cart.deleteMany({ where: { id: cartId } });
    }
    await prisma.$disconnect();
  }, DB_TIMEOUT);

  it("recusa nova tentativa de pagamento para pedido já PAID", async () => {
    const { cart, editToken } = await cartService.createDraft({
      recipientType: "amigo",
      title: "Já pago",
      message: "Mensagem de teste",
      senderName: "Testador",
    });
    cartIdsToClean.push(cart.id);

    const order = await orderService.createOrder(editToken, {
      cartId: cart.id,
      planType: "LIMITED",
      customerName: "Comprador",
      customerEmail: `ja.pago.${RUN_ID}@example.com`,
      acceptTerms: true,
    });
    await orderService.mockConfirmOrder(order.id, "success");

    await expect(
      orderService.createCardPaymentAttempt(order.id, editToken, {
        token: "tok",
        installments: 1,
        paymentMethodId: "visa",
      }),
    ).rejects.toMatchObject({ code: "forbidden_state" });
  });

  it("recusa tentativa de pagamento sem token de edição válido", async () => {
    const { cart, editToken } = await cartService.createDraft({
      recipientType: "amigo",
      title: "Token",
      message: "Mensagem de teste",
      senderName: "Testador",
    });
    cartIdsToClean.push(cart.id);

    const order = await orderService.createOrder(editToken, {
      cartId: cart.id,
      planType: "LIMITED",
      customerName: "Comprador",
      customerEmail: `token.invalido.${RUN_ID}@example.com`,
      acceptTerms: true,
    });

    await expect(
      orderService.createPixPaymentAttempt(order.id, "token-invalido"),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(orderService.createPixPaymentAttempt(order.id, null)).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});

describe.skipIf(!RUN)(
  "Fase 3 — falha de e-mail não desfaz a publicação (task 013, seção 17)",
  { timeout: DB_TIMEOUT },
  () => {
    let prisma: typeof import("@/lib/db").prisma;
    const cartIdsToClean: string[] = [];

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    afterAll(async () => {
      for (const cartId of cartIdsToClean) {
        const orders = await prisma.order.findMany({ where: { cartId }, select: { id: true } });
        await prisma.paymentEvent.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
        await prisma.order.deleteMany({ where: { cartId } });
        await prisma.cart.deleteMany({ where: { id: cartId } });
      }
      await prisma.$disconnect();
    }, DB_TIMEOUT);

    it("publica a carta mesmo quando o provedor de e-mail falha (Resend sem credencial)", async () => {
      // EMAIL_MODE=real sem RESEND_API_KEY faz o provider real lançar assim
      // que tentar enviar — força exatamente o caso "e-mail falha" sem mock.
      vi.stubEnv("EMAIL_MODE", "real");
      vi.stubEnv("RESEND_API_KEY", "");

      ({ prisma } = await import("@/lib/db"));
      const cartService = await import("@/server/cartService");
      const orderService = await import("@/server/orderService");

      const { cart, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: "Email falha",
        message: "Mensagem de teste",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `email.falha.${RUN_ID}@example.com`,
        acceptTerms: true,
      });

      const result = await orderService.mockConfirmOrder(order.id, "success");

      expect(result.order.status).toBe("PAID");
      expect(result.cart?.status).toBe("PUBLISHED");
      expect(result.cart?.slug).toBeTruthy();

      const delivery = await prisma.emailDelivery.findUniqueOrThrow({
        where: { orderId_type: { orderId: order.id, type: "cart_published" } },
      });
      expect(delivery.status).toBe("FAILED");

      const cartRow = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(cartRow.status).toBe("PUBLISHED");
      expect(cartRow.slug).toBe(result.cart?.slug);
    });
  },
);
