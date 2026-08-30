/**
 * Testes de INTEGRAÇÃO da integridade do webhook do Mercado Pago (banco
 * real, provedor sempre mockado ou nunca chamado).
 *
 *   RUN_DB_TESTS=true pnpm test
 *
 * Cobrem a segunda etapa do fechamento de pagamentos (task 013, seção 9):
 * o webhook nunca pode confiar em valor, moeda, status, referência ou
 * método enviados diretamente pelo corpo da notificação — só no que uma
 * consulta direta ao provedor devolve (`fetchMercadoPagoPayment`) — e o
 * vínculo de `providerPaymentId` precisa ser atômico (compare-and-swap),
 * nunca read-then-write, inclusive quando o webhook chega ANTES de
 * `recordPaymentAttempt` rodar.
 *
 * `cardAttempt.integration.test.ts`, `phase3.integration.test.ts` e
 * `paymentMethodExclusivity.integration.test.ts` continuam cobrindo
 * idempotência de evento, transição fora de ordem e exclusão mútua entre
 * Pix e cartão — reexecutados sem alteração junto com esta correção.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;
const DB_TIMEOUT = 60_000;
const RUN_ID = randomUUID().slice(0, 8);

/** Preço do plano LIMITED usado em todos os pedidos deste arquivo: R$18,90 / 1890 centavos. */
const VALID_AMOUNT_REAIS = 18.9;
const VALID_CURRENCY = "BRL";

/** Retrato válido de um pagamento Pix aprovado, batendo com o pedido padrão. */
function validPix(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    transactionAmount: VALID_AMOUNT_REAIS,
    currencyId: VALID_CURRENCY,
    paymentMethodId: "pix",
    paymentTypeId: "bank_transfer",
    ...overrides,
  };
}

/** Retrato válido de um pagamento de cartão aprovado, batendo com o pedido padrão. */
function validCard(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    transactionAmount: VALID_AMOUNT_REAIS,
    currencyId: VALID_CURRENCY,
    paymentMethodId: "visa",
    paymentTypeId: "credit_card",
    ...overrides,
  };
}

describe.skipIf(!RUN)(
  "Fase 3 — integridade do webhook e vínculo atômico de providerPaymentId (integração)",
  { timeout: DB_TIMEOUT },
  () => {
    let prisma: typeof import("@/lib/db").prisma;
    let cartService: typeof import("@/server/cartService");
    let orderService: typeof import("@/server/orderService");

    const cartIdsToClean: string[] = [];

    beforeAll(async () => {
      ({ prisma } = await import("@/lib/db"));
      cartService = await import("@/server/cartService");
      orderService = await import("@/server/orderService");
    });

    // `createFreshOrder` pressupõe o provider REAL — Order PENDING sem
    // nenhum método vinculado ainda, esperando a primeira notificação. Com
    // o provider mock, `createOrder` já vincularia um `providerPaymentId`
    // na própria criação, invalidando esse pressuposto e fazendo os
    // webhooks sintéticos abaixo caírem em `stale_attempt` antes de chegar
    // à validação testada. O `.env.local` do desenvolvedor pode estar em
    // PAYMENT_MODE=mock (padrão local) e é carregado pelo vitest.config,
    // então — como os testes irmãos que criam pedidos "de verdade"
    // (`publicCartAccess.integration.test.ts`,
    // `route.integration.test.ts`) — cada teste declara aqui o ambiente de
    // que precisa em vez de herdar o que estiver no shell. EMAIL_MODE=mock
    // por segurança: os cenários que chegam a PAID disparam
    // `finalizeOrderAsPaid`/e-mail, e nunca devem depender de um "real"
    // deixado no ambiente local.
    beforeEach(() => {
      vi.stubEnv("PAYMENT_MODE", "real");
      vi.stubEnv("EMAIL_MODE", "mock");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    afterAll(async () => {
      for (const cartId of cartIdsToClean) {
        const orders = await prisma.order.findMany({ where: { cartId }, select: { id: true } });
        const orderIds = orders.map((o) => o.id);
        if (orderIds.length > 0) {
          await prisma.paymentEvent.deleteMany({ where: { orderId: { in: orderIds } } });
          await prisma.emailDelivery.deleteMany({ where: { orderId: { in: orderIds } } });
        }
        await prisma.order.deleteMany({ where: { cartId } });
        await prisma.cart.deleteMany({ where: { id: cartId } });
      }
      await prisma.$disconnect();
    }, DB_TIMEOUT);

    /**
     * Pedido PENDING "de verdade" (via `createOrder` real), sem nenhum
     * método vinculado ainda — o estado de um pedido esperando a PRIMEIRA
     * notificação, o que este arquivo testa (diferente de
     * `createPixLikeOrder` em phase3.integration.test.ts, que já promove o
     * pedido com `providerPaymentId` pré-gravado).
     */
    async function createFreshOrder(label: string) {
      const { cart, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: label,
        message: "Mensagem de teste de integridade do webhook",
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
      return order;
    }

    // --- 1. APPROVED com valor, moeda e método corretos ----------------------

    it("APPROVED correto vincula providerPaymentId, marca PAID e publica exatamente uma vez", async () => {
      const order = await createFreshOrder("approved-correto");
      const paymentId = `mp_ok_${RUN_ID}`;

      const outcome = await orderService.applyMercadoPagoWebhook({
        ...validPix(),
        provider: "mercadopago",
        providerEventId: `evt_ok_${RUN_ID}`,
        providerPaymentId: paymentId,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(outcome).toEqual({ kind: "applied", internalStatus: "PAID" });

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBe(paymentId);
      expect(row.paymentMethod).toBe("PIX");
      expect(row.status).toBe("PAID");

      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cart.status).toBe("PUBLISHED");

      const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
      expect(deliveries).toHaveLength(1);

      // Reentrega do MESMO evento: continua idempotente (item 8).
      const duplicate = await orderService.applyMercadoPagoWebhook({
        ...validPix(),
        provider: "mercadopago",
        providerEventId: `evt_ok_${RUN_ID}`,
        providerPaymentId: paymentId,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(duplicate).toEqual({ kind: "duplicate" });
      const deliveriesAfter = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
      expect(deliveriesAfter).toHaveLength(1); // não publicou nem enviou de novo
    });

    // --- 2. PENDING válido -----------------------------------------------------

    it("PENDING válido vincula providerPaymentId mas não publica", async () => {
      const order = await createFreshOrder("pending-valido");
      const paymentId = `mp_pending_${RUN_ID}`;

      const outcome = await orderService.applyMercadoPagoWebhook({
        ...validPix(),
        provider: "mercadopago",
        providerEventId: `evt_pending_${RUN_ID}`,
        providerPaymentId: paymentId,
        externalReference: order.id,
        status: "pending",
        statusDetail: null,
        type: "payment",
      });
      // PENDING -> PENDING é um no-op de status por construção
      // (`shouldApplyTransition`) — o vínculo é o que importa aqui, e ele
      // precisa acontecer mesmo sem mudança de status.
      expect(outcome).toEqual({ kind: "no_transition" });

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBe(paymentId);
      expect(row.paymentMethod).toBe("PIX");
      expect(row.status).toBe("PENDING");

      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cart.status).not.toBe("PUBLISHED");
      const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
      expect(deliveries).toHaveLength(0);
    });

    // --- 3. Valor divergente ----------------------------------------------------

    it("valor divergente: não vincula, não marca PAID, não publica, não cria e-mail", async () => {
      const order = await createFreshOrder("valor-divergente");

      const outcome = await orderService.applyMercadoPagoWebhook({
        ...validPix({ transactionAmount: 5.0 }), // pedido custa 18,90
        provider: "mercadopago",
        providerEventId: `evt_valor_${RUN_ID}`,
        providerPaymentId: `mp_valor_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(outcome).toEqual({ kind: "amount_mismatch" });

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBeNull();
      expect(row.status).toBe("PENDING");

      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cart.status).not.toBe("PUBLISHED");
      const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
      expect(deliveries).toHaveLength(0);
    });

    // --- 4. Moeda divergente -----------------------------------------------------

    it("moeda divergente: mesmos bloqueios do valor divergente", async () => {
      const order = await createFreshOrder("moeda-divergente");

      const outcome = await orderService.applyMercadoPagoWebhook({
        ...validPix({ currencyId: "USD" }),
        provider: "mercadopago",
        providerEventId: `evt_moeda_${RUN_ID}`,
        providerPaymentId: `mp_moeda_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(outcome).toEqual({ kind: "currency_mismatch" });

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBeNull();
      expect(row.status).toBe("PENDING");

      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cart.status).not.toBe("PUBLISHED");
      const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
      expect(deliveries).toHaveLength(0);
    });

    // --- 5. Método divergente ----------------------------------------------------

    it("Pix chegando por trás de uma tentativa ATUAL de cartão não vincula nem publica", async () => {
      const order = await createFreshOrder("pix-atras-de-cartao");

      // Tentativa de cartão ativa (em andamento) — mesmo estado que
      // `claimCardAttempt` deixaria com o provedor ainda não tendo respondido.
      await prisma.order.update({
        where: { id: order.id },
        data: {
          cardClaimedAt: new Date(),
          cardIdempotencyKey: "chave-cartao-ativa",
          cardTokenFingerprint: "fp-cartao-ativa",
        },
      });

      const outcome = await orderService.applyMercadoPagoWebhook({
        ...validPix(),
        provider: "mercadopago",
        providerEventId: `evt_metodo_pix_${RUN_ID}`,
        providerPaymentId: `mp_pix_antigo_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(outcome).toEqual({ kind: "method_mismatch" });

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBeNull();
      // A tentativa de cartão ativa não foi tocada.
      expect(row.cardIdempotencyKey).toBe("chave-cartao-ativa");
      expect(row.cardTokenFingerprint).toBe("fp-cartao-ativa");
      expect(row.status).toBe("PENDING");

      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cart.status).not.toBe("PUBLISHED");
    });

    it("cartão chegando por trás de um Pix ATUAL (vivo) não vincula nem publica", async () => {
      const order = await createFreshOrder("cartao-atras-de-pix");

      // Pix ativo e ainda pagável — mesmo estado que uma criação de Pix
      // bem-sucedida deixaria, esperando confirmação.
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentMethod: "PIX",
          pixQrCode: "qr-pix-ativo",
          pixQrCodeBase64: "b64-pix-ativo",
          pixExpiresAt: new Date(Date.now() + 3_600_000),
        },
      });

      const outcome = await orderService.applyMercadoPagoWebhook({
        ...validCard(),
        provider: "mercadopago",
        providerEventId: `evt_metodo_cartao_${RUN_ID}`,
        providerPaymentId: `mp_cartao_antigo_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(outcome).toEqual({ kind: "method_mismatch" });

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBeNull();
      // O Pix ativo não foi tocado.
      expect(row.pixQrCode).toBe("qr-pix-ativo");
      expect(row.status).toBe("PENDING");

      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cart.status).not.toBe("PUBLISHED");
    });

    // --- 7. Dois webhooks concorrentes, ids diferentes ---------------------------

    it("dois webhooks concorrentes com IDs diferentes: só um vincula, o outro vira stale_attempt", async () => {
      const order = await createFreshOrder("corrida-dois-ids");
      const paymentIdA = `mp_corrida_a_${RUN_ID}`;
      const paymentIdB = `mp_corrida_b_${RUN_ID}`;

      const settled = await Promise.allSettled([
        orderService.applyMercadoPagoWebhook({
          ...validPix(),
          provider: "mercadopago",
          providerEventId: `evt_corrida_a_${RUN_ID}`,
          providerPaymentId: paymentIdA,
          externalReference: order.id,
          status: "approved",
          statusDetail: "accredited",
          type: "payment",
        }),
        orderService.applyMercadoPagoWebhook({
          ...validPix(),
          provider: "mercadopago",
          providerEventId: `evt_corrida_b_${RUN_ID}`,
          providerPaymentId: paymentIdB,
          externalReference: order.id,
          status: "approved",
          statusDetail: "accredited",
          type: "payment",
        }),
      ]);

      const outcomes = settled.map((r) => (r.status === "fulfilled" ? r.value.kind : "rejected"));
      // Exatamente um "applied", o outro "stale_attempt" — nunca os dois
      // "applied" (o que significaria dois ids vinculados/duas publicações).
      expect(outcomes.filter((k) => k === "applied")).toHaveLength(1);
      expect(outcomes.filter((k) => k === "stale_attempt")).toHaveLength(1);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect([paymentIdA, paymentIdB]).toContain(row.providerPaymentId);
      expect(row.status).toBe("PAID");

      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cart.status).toBe("PUBLISHED");

      // Nunca duas publicações ou dois e-mails, não importa quem venceu.
      const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
      expect(deliveries).toHaveLength(1);
    });

    // --- 9. providerPaymentId existente e diferente ------------------------------

    it("providerPaymentId já vinculado e diferente continua stale_attempt mesmo com snapshot válido", async () => {
      const order = await createFreshOrder("ja-vinculado-diferente");
      const paymentIdOriginal = `mp_original_${RUN_ID}`;

      await orderService.applyMercadoPagoWebhook({
        ...validPix(),
        provider: "mercadopago",
        providerEventId: `evt_original_${RUN_ID}`,
        providerPaymentId: paymentIdOriginal,
        externalReference: order.id,
        status: "pending",
        statusDetail: null,
        type: "payment",
      });

      const outcome = await orderService.applyMercadoPagoWebhook({
        ...validPix(), // snapshot perfeitamente válido — só o id é outro
        provider: "mercadopago",
        providerEventId: `evt_outro_${RUN_ID}`,
        providerPaymentId: `mp_outro_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(outcome).toEqual({ kind: "stale_attempt" });

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBe(paymentIdOriginal); // não foi sobrescrito
      expect(row.status).toBe("PENDING"); // não foi aprovado pela tentativa errada
    });

    // --- 10. Snapshot malformado --------------------------------------------------

    it("snapshot malformado (valor ausente/inválido) nunca aprova", async () => {
      const order = await createFreshOrder("snapshot-sem-valor");

      const semValor = await orderService.applyMercadoPagoWebhook({
        ...validPix({ transactionAmount: null }),
        provider: "mercadopago",
        providerEventId: `evt_sem_valor_${RUN_ID}`,
        providerPaymentId: `mp_sem_valor_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(semValor).toEqual({ kind: "invalid_snapshot" });

      const negativo = await orderService.applyMercadoPagoWebhook({
        ...validPix({ transactionAmount: -18.9 }),
        provider: "mercadopago",
        providerEventId: `evt_negativo_${RUN_ID}`,
        providerPaymentId: `mp_negativo_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(negativo).toEqual({ kind: "invalid_snapshot" });

      const naoFinito = await orderService.applyMercadoPagoWebhook({
        ...validPix({ transactionAmount: Number.POSITIVE_INFINITY }),
        provider: "mercadopago",
        providerEventId: `evt_infinito_${RUN_ID}`,
        providerPaymentId: `mp_infinito_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(naoFinito).toEqual({ kind: "invalid_snapshot" });

      const casasIncompativeis = await orderService.applyMercadoPagoWebhook({
        ...validPix({ transactionAmount: 18.905 }),
        provider: "mercadopago",
        providerEventId: `evt_casas_${RUN_ID}`,
        providerPaymentId: `mp_casas_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(casasIncompativeis).toEqual({ kind: "invalid_snapshot" });

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBeNull();
      expect(row.status).toBe("PENDING");
      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cart.status).not.toBe("PUBLISHED");
    });

    it("snapshot malformado (moeda ausente ou método irreconhecível) nunca aprova", async () => {
      const order = await createFreshOrder("snapshot-sem-moeda-metodo");

      const semMoeda = await orderService.applyMercadoPagoWebhook({
        ...validPix({ currencyId: null }),
        provider: "mercadopago",
        providerEventId: `evt_sem_moeda_${RUN_ID}`,
        providerPaymentId: `mp_sem_moeda_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(semMoeda).toEqual({ kind: "invalid_snapshot" });

      const metodoDesconhecido = await orderService.applyMercadoPagoWebhook({
        ...validPix({ paymentMethodId: "bolbradesco", paymentTypeId: "ticket" }),
        provider: "mercadopago",
        providerEventId: `evt_metodo_desconhecido_${RUN_ID}`,
        providerPaymentId: `mp_metodo_desconhecido_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(metodoDesconhecido).toEqual({ kind: "invalid_snapshot" });

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBeNull();
      expect(row.status).toBe("PENDING");
    });
  },
);

describe.skipIf(!RUN)(
  "Fase 3 — webhook antecipado com falha ambígua vincula providerPaymentId mesmo assim",
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
     * Reproduz exatamente o cenário da task 013 seção 9, item 4: o Mercado
     * Pago cria a cobrança e a notificação sai quase junto (o provedor falso
     * dispara o webhook de dentro de `createPayment`), mas a chamada
     * original nunca recebe a resposta (`socket hang up`) — `recordPaymentAttempt`
     * NUNCA chega a rodar. Sem o vínculo atômico do webhook, o pedido
     * terminaria PAID com `providerPaymentId` nulo para sempre.
     */
    it("cartão: webhook aprova durante a chamada, que termina em socket hang up — PAID e vinculado do mesmo jeito", async () => {
      const providerPaymentId = `mp_ambiguo_webhook_${RUN_ID}`;

      vi.doMock("@/server/payment", async (importOriginal) => {
        const actual = await importOriginal<typeof import("@/server/payment")>();
        return {
          ...actual,
          getPaymentProvider: () => ({
            name: "mercadopago",
            async createPayment(input: { orderId: string }) {
              await orderService.applyMercadoPagoWebhook({
                ...validCard(),
                provider: "mercadopago",
                providerEventId: `evt_ambiguo_webhook_${RUN_ID}`,
                providerPaymentId,
                externalReference: input.orderId,
                status: "approved",
                statusDetail: "accredited",
                type: "payment",
              });
              throw new Error("socket hang up"); // ambíguo — recordPaymentAttempt nunca roda
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
        title: "Webhook ambíguo cartão",
        message: "Mensagem de teste de integridade do webhook",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `webhook.ambiguo.cartao.${RUN_ID}@example.com`,
        acceptTerms: true,
      });

      await expect(
        orderService.createCardPaymentAttempt(order.id, editToken, {
          token: "tok-ambiguo",
          installments: 1,
          paymentMethodId: "visa",
        }),
      ).rejects.toThrow(/socket hang up/);

      // O pedido NUNCA pode terminar PAID com providerPaymentId nulo.
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe("PAID");
      expect(row.providerPaymentId).toBe(providerPaymentId);
      expect(row.paymentMethod).toBe("CARD");
      // A reserva ambígua foi limpa pelo próprio vínculo do webhook.
      expect(row.cardClaimedAt).toBeNull();
      expect(row.cardIdempotencyKey).toBeNull();
      expect(row.cardTokenFingerprint).toBeNull();

      const cartRow = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cartRow.status).toBe("PUBLISHED");

      const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
      expect(deliveries).toHaveLength(1);
    });
  },
);
