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
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";

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
  "Fase 3 — corrida: webhook aprova durante a tentativa de pagamento",
  { timeout: DB_TIMEOUT },
  () => {
    let prisma: typeof import("@/lib/db").prisma;
    // Atribuído dentro de cada teste, depois do doMock, mas referenciado pelo
    // provedor falso (que só roda depois disso) — daí a declaração aqui.
    let orderService!: typeof import("@/server/orderService");
    const cartIdsToClean: string[] = [];

    // Blocos anteriores já importaram orderService: sem limpar o registro
    // ANTES do doMock, o import devolveria a instância em cache, ligada ao
    // provedor real — e o teste passaria sem nunca exercitar a corrida.
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.doUnmock("@/server/payment");
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

    /**
     * Cartão é aprovado de forma síncrona pelo Mercado Pago, e a notificação
     * chega quase junto com a resposta — pode chegar ANTES de
     * `createCardPaymentAttempt` terminar de gravar o pedido. O provedor falso
     * aqui aplica o webhook exatamente dentro dessa janela.
     */
    it("não regride para PENDING um pedido que o webhook já aprovou", async () => {
      const providerPaymentId = `mp_race_card_${RUN_ID}`;

      vi.doMock("@/server/payment", async (importOriginal) => {
        const actual = await importOriginal<typeof import("@/server/payment")>();
        return {
          ...actual,
          getPaymentProvider: () => ({
            name: "mercadopago",
            async createPayment(input: { orderId: string }) {
              await orderService.applyMercadoPagoWebhook({
                provider: "mercadopago",
                providerEventId: `evt_race_card_${RUN_ID}`,
                providerPaymentId,
                externalReference: input.orderId,
                status: "approved",
                statusDetail: "accredited",
                type: "payment",
              });
              return { providerPaymentId, status: "paid" as const, statusDetail: "accredited" };
            },
            async getPaymentStatus() {
              return "paid" as const;
            },
          }),
        };
      });

      ({ prisma } = await import("@/lib/db"));
      const cartService = await import("@/server/cartService");
      orderService = await import("@/server/orderService");

      const { cart, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: "Corrida cartão",
        message: "Mensagem de teste de integração da Fase 3",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `corrida.cartao.${RUN_ID}@example.com`,
        acceptTerms: true,
      });

      const result = await orderService.createCardPaymentAttempt(order.id, editToken, {
        token: "tok_teste",
        installments: 1,
        paymentMethodId: "visa",
      });

      // O webhook é a fonte de verdade: o pedido tem de continuar PAID.
      const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(finalOrder.status).toBe("PAID");
      expect(finalOrder.paidAt).not.toBeNull();
      expect(result.order.status).toBe("PAID");

      // E a carta publicada não pode ficar órfã de um pedido "pendente".
      const cartRow = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(cartRow.status).toBe("PUBLISHED");
      expect(cartRow.slug).toBeTruthy();

      // A referência da cobrança continua rastreável para o suporte.
      expect(finalOrder.providerPaymentId).toBe(providerPaymentId);
      expect(finalOrder.paymentMethod).toBe("CARD");
    });

    it("não regride para PENDING um pedido já pago quando a tentativa é Pix", async () => {
      const providerPaymentId = `mp_race_pix_${RUN_ID}`;

      vi.doMock("@/server/payment", async (importOriginal) => {
        const actual = await importOriginal<typeof import("@/server/payment")>();
        return {
          ...actual,
          getPaymentProvider: () => ({
            name: "mercadopago",
            async createPayment(input: { orderId: string }) {
              await orderService.applyMercadoPagoWebhook({
                provider: "mercadopago",
                providerEventId: `evt_race_pix_${RUN_ID}`,
                providerPaymentId,
                externalReference: input.orderId,
                status: "approved",
                statusDetail: "accredited",
                type: "payment",
              });
              return {
                providerPaymentId,
                status: "paid" as const,
                pix: { qrCode: "00020126", qrCodeBase64: "iVBORw0KGgo=", expiresAt: null },
              };
            },
            async getPaymentStatus() {
              return "paid" as const;
            },
          }),
        };
      });

      ({ prisma } = await import("@/lib/db"));
      const cartService = await import("@/server/cartService");
      orderService = await import("@/server/orderService");

      const { cart, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: "Corrida pix",
        message: "Mensagem de teste de integração da Fase 3",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `corrida.pix.${RUN_ID}@example.com`,
        acceptTerms: true,
      });

      const result = await orderService.createPixPaymentAttempt(order.id, editToken);

      const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(finalOrder.status).toBe("PAID");
      expect(result.order.status).toBe("PAID");
      expect(result.pix.qrCode).toBe("00020126");

      const cartRow = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(cartRow.status).toBe("PUBLISHED");
    });
  },
);

describe.skipIf(!RUN)(
  "Fase 3 — criação de Pix nunca gera dois pagamentos (incidente de 2026-08-07, pedido cmsixlhc000032ydptvluv4zu)",
  { timeout: DB_TIMEOUT },
  () => {
    let prisma: typeof import("@/lib/db").prisma;
    let orderService!: typeof import("@/server/orderService");
    const cartIdsToClean: string[] = [];

    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.doUnmock("@/server/payment");
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

    /**
     * Provedor falso que conta quantas vezes `createPayment` foi chamado —
     * é essa contagem que prova (ou refuta) a causa raiz: duas chamadas de
     * `createPixPaymentAttempt` para o mesmo pedido não podem resultar em
     * duas chamadas ao provedor real.
     */
    async function setupOrderWithFakeProvider(callCounter: { count: number }, label: string) {
      vi.doMock("@/server/payment", async (importOriginal) => {
        const actual = await importOriginal<typeof import("@/server/payment")>();
        return {
          ...actual,
          getPaymentProvider: () => ({
            name: "mercadopago",
            async createPayment() {
              callCounter.count += 1;
              const id = `mp_dup_${label}_${callCounter.count}_${RUN_ID}`;
              return {
                providerPaymentId: id,
                status: "pending" as const,
                pix: { qrCode: `qr_${id}`, qrCodeBase64: `base64_${id}`, expiresAt: null },
              };
            },
            async getPaymentStatus() {
              return "pending" as const;
            },
          }),
        };
      });

      ({ prisma } = await import("@/lib/db"));
      const cartService = await import("@/server/cartService");
      orderService = await import("@/server/orderService");

      const { cart, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: label,
        message: "Mensagem de teste de integração da Fase 3",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `${label}.${RUN_ID}@example.com`.replace(/\s+/g, ""),
        acceptTerms: true,
      });

      return { order, editToken };
    }

    it("duas chamadas concorrentes para o mesmo pedido criam só um Pix no provedor", async () => {
      const callCounter = { count: 0 };
      const { order, editToken } = await setupOrderWithFakeProvider(callCounter, "concorrente");

      // Reproduz exatamente a causa raiz do incidente: duas chamadas de
      // criação de Pix disparadas quase juntas para o MESMO pedido (no
      // navegador, isso veio do useEffect do PixPaymentPanel sendo invocado
      // duas vezes pelo React Strict Mode em desenvolvimento). Uma corrida
      // genuína pode terminar de duas formas seguras — as duas chamadas
      // convergindo pro mesmo Pix, ou a perdedora recusada com um erro de
      // conflito controlado — nunca com um segundo pagamento independente
      // no provedor nem com um QR Code diferente do registrado no pedido.
      // `allSettled` (em vez de `all`) evita que o teste seja instável só
      // porque o timing exato de qual chamada "ganha" não é determinístico.
      const settled = await Promise.allSettled([
        orderService.createPixPaymentAttempt(order.id, editToken),
        orderService.createPixPaymentAttempt(order.id, editToken),
      ]);

      // O provedor (Mercado Pago) só pode ter sido chamado uma vez — nunca
      // duas cobranças independentes para uma única ação do usuário, não
      // importa como a corrida termina.
      expect(callCounter.count).toBe(1);

      const fulfilled = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const rejected = settled.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));

      // Pelo menos uma das duas tem que ter sucesso — a corrida nunca pode
      // derrubar as duas.
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // Nunca podemos mostrar ao usuário um QR Code diferente do que fica
      // registrado no pedido — era exatamente esse o perigo do incidente
      // original (uma das duas respostas ficava associada a um pagamento
      // "stale", que o webhook nunca confirmaria).
      if (fulfilled.length === 2) {
        expect(fulfilled[0].pix).toEqual(fulfilled[1].pix);
        expect(fulfilled[0].order.status).toBe(fulfilled[1].order.status);
      }
      for (const reason of rejected) {
        expect(reason).toMatchObject({ code: "conflict" });
      }

      const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(finalOrder.pixQrCode).toBe(fulfilled[0].pix.qrCode);
      expect(finalOrder.pixClaimedAt).toBeNull(); // reserva liberada ao concluir
    });

    it("chamada repetida depois que a primeira já criou o Pix reaproveita a mesma cobrança", async () => {
      const callCounter = { count: 0 };
      const { order, editToken } = await setupOrderWithFakeProvider(callCounter, "sequencial");

      const first = await orderService.createPixPaymentAttempt(order.id, editToken);
      const second = await orderService.createPixPaymentAttempt(order.id, editToken);

      expect(callCounter.count).toBe(1);
      expect(second.pix).toEqual(first.pix);
      expect(second.order.status).toBe(first.order.status);
    });

    it("uma reserva de Pix abandonada (processo morto) não trava o pedido para sempre", async () => {
      const callCounter = { count: 0 };
      const { order, editToken } = await setupOrderWithFakeProvider(callCounter, "abandonada");

      // Simula um processo que reivindicou a criação do Pix e morreu antes
      // de chamar o provedor — sem isto, o teste teria que esperar
      // PIX_CLAIM_STALE_MS de verdade.
      await prisma.order.updateMany({
        where: { id: order.id },
        data: { pixClaimedAt: new Date(Date.now() - 60_000) },
      });

      const result = await orderService.createPixPaymentAttempt(order.id, editToken);

      expect(callCounter.count).toBe(1);
      expect(result.pix.qrCode).toBeTruthy();

      const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(finalOrder.pixClaimedAt).toBeNull();
    });

    it("uma reserva de Pix recente sem resultado ainda recusa a segunda chamada, sem criar um novo pagamento", async () => {
      const callCounter = { count: 0 };
      const { order, editToken } = await setupOrderWithFakeProvider(callCounter, "em-andamento");

      // Simula uma criação genuinamente em andamento: reservada agora mesmo,
      // provedor ainda não respondeu (nenhum Pix para reaproveitar ainda).
      await prisma.order.updateMany({
        where: { id: order.id },
        data: { pixClaimedAt: new Date() },
      });

      await expect(orderService.createPixPaymentAttempt(order.id, editToken)).rejects.toMatchObject({
        code: "conflict",
      });
      expect(callCounter.count).toBe(0);
    });
  },
);

describe.skipIf(!RUN)(
  "Fase 3 — reprocessamento de webhook interrompido no meio",
  { timeout: DB_TIMEOUT },
  () => {
    let prisma: typeof import("@/lib/db").prisma;
    const cartIdsToClean: string[] = [];

    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      vi.doUnmock("@/server/payment/mercadoPagoStatus");
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

    async function createPendingOrder(
      orderService: typeof import("@/server/orderService"),
      cartService: typeof import("@/server/cartService"),
      prismaClient: typeof import("@/lib/db").prisma,
      providerPaymentId: string,
      label: string,
    ) {
      const { cart, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: label,
        message: "Mensagem de teste de integração da Fase 3",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `${label}.${RUN_ID}@example.com`.replace(/\s+/g, ""),
        acceptTerms: true,
      });
      await prismaClient.order.update({
        where: { id: order.id },
        data: { provider: "mercadopago", paymentMethod: "PIX", providerPaymentId },
      });
      return order;
    }

    /**
     * Um processo que morre entre o registro do evento e a aplicação da
     * transição (timeout de função serverless, queda de conexão) deixa o
     * `PaymentEvent` gravado sem nada ter sido aplicado. O reenvio do Mercado
     * Pago repete o mesmo id de notificação — se ele for descartado como
     * duplicado, o pagamento fica confirmado no provedor e a carta nunca é
     * publicada.
     */
    it("aplica a transição no reenvio de um evento que ficou pela metade", async () => {
      const providerPaymentId = `mp_retry_${RUN_ID}`;
      const providerEventId = `evt_retry_${RUN_ID}`;
      let interrupt = true;

      vi.doMock("@/server/payment/mercadoPagoStatus", async (importOriginal) => {
        const actual = await importOriginal<typeof import("@/server/payment/mercadoPagoStatus")>();
        return {
          ...actual,
          shouldApplyTransition: (
            current: Parameters<typeof actual.shouldApplyTransition>[0],
            next: Parameters<typeof actual.shouldApplyTransition>[1],
          ) => {
            if (interrupt) {
              interrupt = false;
              throw new Error("processo interrompido antes de aplicar a transição");
            }
            return actual.shouldApplyTransition(current, next);
          },
        };
      });

      ({ prisma } = await import("@/lib/db"));
      const cartService = await import("@/server/cartService");
      const orderService = await import("@/server/orderService");

      const order = await createPendingOrder(
        orderService,
        cartService,
        prisma,
        providerPaymentId,
        "reprocessa",
      );

      const notification = {
        provider: "mercadopago",
        providerEventId,
        providerPaymentId,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      };

      // Primeira entrega: morre no meio. A rota responderia 500 e o Mercado
      // Pago reenviaria a mesma notificação.
      await expect(orderService.applyMercadoPagoWebhook(notification)).rejects.toThrow(
        /processo interrompido/,
      );

      const midOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(midOrder.status).toBe("PENDING"); // nada foi aplicado
      const midCart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(midCart.status).not.toBe("PUBLISHED");
      // ... mas o evento já está registrado.
      const recorded = await prisma.paymentEvent.findUniqueOrThrow({
        where: { provider_providerEventId: { provider: "mercadopago", providerEventId } },
      });
      expect(recorded.providerPaymentId).toBe(providerPaymentId);

      // Reenvio da MESMA notificação: precisa ser aplicado, não descartado.
      const retry = await orderService.applyMercadoPagoWebhook(notification);
      expect(retry).toEqual({ kind: "applied", internalStatus: "PAID" });

      const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(finalOrder.status).toBe("PAID");
      const finalCart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(finalCart.status).toBe("PUBLISHED");
      expect(finalCart.slug).toBeTruthy();

      const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
      expect(deliveries).toHaveLength(1);
    });

    /** A idempotência de verdade não pode ser afrouxada pela correção acima. */
    it("mantém como duplicado o reenvio de um evento que foi concluído", async () => {
      const providerPaymentId = `mp_done_${RUN_ID}`;
      const providerEventId = `evt_done_${RUN_ID}`;

      ({ prisma } = await import("@/lib/db"));
      const cartService = await import("@/server/cartService");
      const orderService = await import("@/server/orderService");

      const order = await createPendingOrder(
        orderService,
        cartService,
        prisma,
        providerPaymentId,
        "concluido",
      );

      const notification = {
        provider: "mercadopago",
        providerEventId,
        providerPaymentId,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      };

      const first = await orderService.applyMercadoPagoWebhook(notification);
      expect(first).toEqual({ kind: "applied", internalStatus: "PAID" });
      const slug = (await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } })).slug;

      const second = await orderService.applyMercadoPagoWebhook(notification);
      expect(second).toEqual({ kind: "duplicate" });

      const cartRow = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cartRow.slug).toBe(slug); // não republicou
      const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
      expect(deliveries).toHaveLength(1); // não reenviou e-mail
    });
  },
);

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
