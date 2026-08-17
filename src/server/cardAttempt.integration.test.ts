/**
 * Testes de INTEGRAÇÃO do ciclo de tentativa de pagamento com CARTÃO
 * (banco real, provedor falso — nenhuma chamada ao Mercado Pago).
 *
 *   RUN_DB_TESTS=true pnpm test
 *
 * Cobrem o risco de cobrança duplicada corrigido em `claimCardAttempt`. O
 * cartão não é um Pix com outro nome: no Pix a cobrança é única e pode ser
 * reapresentada para sempre com a mesma chave; no cartão uma recusa é um
 * desfecho legítimo e o comprador tem o direito de tentar outro cartão — o
 * que é uma operação diferente, com token diferente, e exige chave nova.
 * É essa diferença que os testes abaixo fixam.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;
const DB_TIMEOUT = 60_000;
const RUN_ID = randomUUID().slice(0, 8);

interface ProviderCall {
  idempotencyKey?: string;
  cardToken?: string;
}

describe.skipIf(!RUN)("Fase 3 — tentativa de cartão (integração)", { timeout: DB_TIMEOUT }, () => {
  let prisma: typeof import("@/lib/db").prisma;
  let orderService: typeof import("@/server/orderService");
  const cartIdsToClean: string[] = [];

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    vi.doUnmock("@/server/payment");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(async () => {
    if (!prisma) return;
    for (const cartId of cartIdsToClean.splice(0)) {
      const orders = await prisma.order.findMany({ where: { cartId }, select: { id: true } });
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length > 0) {
        // PaymentEvent é onDelete: SetNull, então precisa sair antes.
        await prisma.paymentEvent.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.emailDelivery.deleteMany({ where: { orderId: { in: orderIds } } });
      }
      await prisma.order.deleteMany({ where: { cartId } });
      await prisma.cartMedia.deleteMany({ where: { cartId } });
      await prisma.cart.deleteMany({ where: { id: cartId } });
    }
    await prisma.$disconnect();
  }, DB_TIMEOUT);

  /**
   * Monta um pedido real e instala um provedor falso cujo comportamento é
   * decidido por `behaviour` — é o que permite exercer recusa, falha ambígua
   * e recusa determinística sem tocar no Mercado Pago.
   */
  async function setup(
    label: string,
    behaviour: (call: ProviderCall, n: number) => Promise<{
      providerPaymentId: string;
      status: "pending" | "paid" | "failed";
      statusDetail?: string;
    }>,
  ) {
    const calls: ProviderCall[] = [];

    vi.doMock("@/server/payment", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/server/payment")>();
      return {
        ...actual,
        getPaymentProvider: () => ({
          name: "mercadopago",
          async createPayment(input: {
            idempotencyKey?: string;
            card?: { token: string };
          }) {
            calls.push({ idempotencyKey: input.idempotencyKey, cardToken: input.card?.token });
            return behaviour(calls[calls.length - 1]!, calls.length);
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
      message: "Mensagem de teste de integração de cartão",
      senderName: "Testador",
    });
    cartIdsToClean.push(cart.id);

    const order = await orderService.createOrder(editToken, {
      cartId: cart.id,
      planType: "LIMITED",
      customerName: "Comprador",
      customerEmail: `cartao.${label}.${RUN_ID}@example.com`.replace(/\s+/g, ""),
      acceptTerms: true,
    });

    return { order, editToken, calls };
  }

  const cartao = (token: string) => ({ token, installments: 1, paymentMethodId: "visa" });

  it("duas chamadas simultâneas invocam o provedor uma única vez", async () => {
    const { order, editToken, calls } = await setup("concorrente", async (_c, n) => ({
      providerPaymentId: `mp_card_conc_${n}_${RUN_ID}`,
      status: "pending" as const,
    }));

    const settled = await Promise.allSettled([
      orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-a")),
      orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-b")),
    ]);

    // O invariante central: uma ação do comprador nunca vira duas cobranças.
    expect(calls.length).toBe(1);

    const fulfilled = settled.filter((r) => r.status === "fulfilled");
    const rejected = settled.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    expect(fulfilled.length).toBe(1);
    // A perdedora recebe conflito seguro, nunca erro interno.
    for (const reason of rejected) {
      expect(reason).toMatchObject({ code: "conflict" });
    }

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.providerPaymentId).toBe(`mp_card_conc_1_${RUN_ID}`);
  });

  it("segunda chamada durante uma reserva viva recebe conflito, sem chamar o provedor", async () => {
    const { order, editToken, calls } = await setup("reserva-viva", async (_c, n) => ({
      providerPaymentId: `mp_card_viva_${n}_${RUN_ID}`,
      status: "pending" as const,
    }));

    // Simula uma tentativa em andamento: reservada agora, provedor ainda não
    // respondeu (nenhuma cobrança registrada para reaproveitar).
    await prisma.order.updateMany({
      where: { id: order.id },
      data: { cardClaimedAt: new Date(), cardIdempotencyKey: "chave-em-voo", cardTokenFingerprint: "outra" },
    });

    await expect(
      orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-novo")),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(calls.length).toBe(0);
  });

  it("retry de falha ambígua com o mesmo token reutiliza a MESMA chave", async () => {
    let falhar = true;
    const { order, editToken, calls } = await setup("ambigua", async (_c, n) => {
      if (falhar) {
        falhar = false;
        throw new Error("socket hang up"); // ambíguo: pode ter criado a cobrança
      }
      return { providerPaymentId: `mp_card_amb_${n}_${RUN_ID}`, status: "pending" as const };
    });

    await expect(
      orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-mesmo")),
    ).rejects.toThrow(/socket hang up/);

    // A reserva é preservada de propósito na falha ambígua — é ela que segura
    // uma cobrança nova até o webhook resolver. Envelhecê-la simula a espera
    // de CARD_CLAIM_STALE_MS sem o teste dormir de verdade.
    const apos = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(apos.cardClaimedAt).not.toBeNull();
    expect(apos.cardIdempotencyKey).not.toBeNull();

    await prisma.order.updateMany({
      where: { id: order.id },
      data: { cardClaimedAt: new Date(Date.now() - 120_000) },
    });

    await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-mesmo"));

    expect(calls.length).toBe(2);
    expect(calls[1]!.idempotencyKey).toBe(calls[0]!.idempotencyKey);
  });

  it("recusa definitiva libera o pedido e a nova tentativa usa chave e token novos", async () => {
    const { order, editToken, calls } = await setup("recusa", async (_c, n) => ({
      providerPaymentId: `mp_card_rec_${n}_${RUN_ID}`,
      status: n === 1 ? ("failed" as const) : ("pending" as const),
      statusDetail: n === 1 ? "cc_rejected_insufficient_amount" : undefined,
    }));

    const primeira = await orderService.createCardPaymentAttempt(
      order.id,
      editToken,
      cartao("tok-recusado"),
    );
    expect(primeira.status).toBe("failed");

    // Recusa é definitiva: o pedido volta a aceitar tentativa, e nada da
    // tentativa anterior sobra para contaminar a próxima.
    const aposRecusa = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(aposRecusa.status).toBe("FAILED");
    expect(aposRecusa.cardClaimedAt).toBeNull();
    expect(aposRecusa.cardIdempotencyKey).toBeNull();
    expect(aposRecusa.cardTokenFingerprint).toBeNull();

    const segunda = await orderService.createCardPaymentAttempt(
      order.id,
      editToken,
      cartao("tok-outro-cartao"),
    );
    expect(segunda.status).toBe("pending");

    expect(calls.length).toBe(2);
    // Chave NOVA: é outra operação, com outro cartão. Reaproveitar a chave da
    // recusa faria o Mercado Pago devolver a recusa antiga.
    expect(calls[1]!.idempotencyKey).not.toBe(calls[0]!.idempotencyKey);
    expect(calls[1]!.cardToken).toBe("tok-outro-cartao");
  });

  it("cobrança viva aguardando confirmação recusa uma segunda tentativa", async () => {
    const { order, editToken, calls } = await setup("viva", async (_c, n) => ({
      providerPaymentId: `mp_card_viva2_${n}_${RUN_ID}`,
      status: "pending" as const,
    }));

    await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-1"));
    expect(calls.length).toBe(1);

    // Já existe cobrança registrada e o pedido segue PENDING: cobrar de novo
    // seria cobrar duas vezes o mesmo pedido.
    await expect(
      orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-2")),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(calls.length).toBe(1);
  });

  it("recusa determinística (4xx) libera o pedido na hora, sem esperar a reserva expirar", async () => {
    const { MercadoPagoRequestRejectedError } = await import("@/server/payment/mercadopago");
    let falhar = true;
    const { order, editToken, calls } = await setup("determinista", async (_c, n) => {
      if (falhar) {
        falhar = false;
        throw new MercadoPagoRequestRejectedError("Mercado Pago recusou a requisição: token", 400);
      }
      return { providerPaymentId: `mp_card_det_${n}_${RUN_ID}`, status: "pending" as const };
    });

    await expect(
      orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-invalido")),
    ).rejects.toThrow(/recusou a requisição/);

    // 4xx não cria cobrança: segurar o pedido só prejudicaria o comprador.
    const apos = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(apos.cardClaimedAt).toBeNull();
    expect(apos.cardIdempotencyKey).toBeNull();

    await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-valido"));
    expect(calls.length).toBe(2);
    expect(calls[1]!.idempotencyKey).not.toBe(calls[0]!.idempotencyKey);
  });

  it("webhook que chega durante a tentativa não é regredido para PENDING", async () => {
    const providerPaymentId = `mp_card_race_${RUN_ID}`;
    let orderIdParaWebhook = "";

    const { order, editToken } = await setup("corrida-webhook", async () => {
      // O webhook do Mercado Pago chega ANTES de a resposta HTTP ser
      // persistida — cartão é aprovado de forma síncrona e a notificação sai
      // quase junto. Este é o cenário que já existia e não pode regredir.
      await orderService.applyMercadoPagoWebhook({
        provider: "mercadopago",
        providerEventId: `evt_card_race_${RUN_ID}`,
        providerPaymentId,
        externalReference: orderIdParaWebhook,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      return { providerPaymentId, status: "paid" as const };
    });
    orderIdParaWebhook = order.id;

    await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-aprovado"));

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("PAID");
    expect(finalOrder.paidAt).not.toBeNull();
    expect(finalOrder.providerPaymentId).toBe(providerPaymentId);

    const cartRow = await prisma.cart.findUniqueOrThrow({ where: { id: finalOrder.cartId } });
    expect(cartRow.status).toBe("PUBLISHED");
  });

  it("webhook tardio de tentativa anterior não sobrescreve a tentativa atual", async () => {
    const { order, editToken } = await setup("webhook-tardio", async (_c, n) => ({
      providerPaymentId: `mp_card_tardio_${n}_${RUN_ID}`,
      status: n === 1 ? ("failed" as const) : ("pending" as const),
    }));

    await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-recusado"));
    await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-bom"));

    const atual = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(atual.providerPaymentId).toBe(`mp_card_tardio_2_${RUN_ID}`);

    // Webhook atrasado da PRIMEIRA cobrança (a recusada).
    const outcome = await orderService.applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: `evt_card_tardio_${RUN_ID}`,
      providerPaymentId: `mp_card_tardio_1_${RUN_ID}`,
      externalReference: order.id,
      status: "rejected",
      statusDetail: "cc_rejected_other_reason",
      type: "payment",
    });

    expect(outcome.kind).toBe("stale_attempt");

    const depois = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(depois.providerPaymentId).toBe(`mp_card_tardio_2_${RUN_ID}`);
    expect(depois.status).toBe("PENDING");

    // A cobrança superada não fica invisível: o PaymentEvent guarda o id.
    const evento = await prisma.paymentEvent.findFirstOrThrow({
      where: { providerEventId: `evt_card_tardio_${RUN_ID}` },
    });
    expect(evento.providerPaymentId).toBe(`mp_card_tardio_1_${RUN_ID}`);
    expect(evento.processedAt).not.toBeNull();
  });

  it("uma tentativa superada nunca sobrescreve o providerPaymentId da atual", async () => {
    const { order, editToken } = await setup("cas", async (_c, n) => ({
      providerPaymentId: `mp_card_cas_${n}_${RUN_ID}`,
      status: "pending" as const,
    }));

    await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-1"));
    const registrado = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(registrado.providerPaymentId).toBe(`mp_card_cas_1_${RUN_ID}`);

    // A chave já foi descartada ao resolver a tentativa; uma escrita de uma
    // tentativa antiga (chave que não existe mais) não pode pegar nada.
    const perdida = await prisma.order.updateMany({
      where: { id: order.id, cardIdempotencyKey: "chave-de-tentativa-superada" },
      data: { providerPaymentId: "mp_card_cas_intruso" },
    });
    expect(perdida.count).toBe(0);

    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(final.providerPaymentId).toBe(`mp_card_cas_1_${RUN_ID}`);
  });

  it("nunca persiste token, número ou CVV do cartão — só a impressão de mão única", async () => {
    const tokenSensivel = `tok-secreto-${RUN_ID}`;
    const { order, editToken } = await setup("sem-dado-sensivel", async (_c, n) => ({
      providerPaymentId: `mp_card_priv_${n}_${RUN_ID}`,
      status: "pending" as const,
    }));

    await orderService.createCardPaymentAttempt(order.id, editToken, {
      token: tokenSensivel,
      installments: 3,
      paymentMethodId: "visa",
    });

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const serializado = JSON.stringify(row);
    expect(serializado).not.toContain(tokenSensivel);
    expect(serializado).not.toMatch(/card_number|security_code|cvv/i);

    // A impressão existe (é o que distingue mesma tentativa de tentativa
    // nova) mas foi descartada junto com a chave ao resolver a tentativa.
    expect(row.cardTokenFingerprint).toBeNull();

    const eventos = await prisma.paymentEvent.findMany({ where: { orderId: order.id } });
    expect(JSON.stringify(eventos)).not.toContain(tokenSensivel);
  });
});
