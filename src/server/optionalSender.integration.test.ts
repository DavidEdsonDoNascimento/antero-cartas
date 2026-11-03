/**
 * Testes de INTEGRAÇÃO (banco real, pagamento sempre simulado) da carta sem
 * remetente.
 *
 *   RUN_DB_TESTS=true pnpm test        (ou pnpm test:integration:pg17)
 *
 * Decisão O1 (relatório 2026-11-03, seções J.4 e N.3): o nome de quem envia
 * passa a ser opcional. Antes, `createOrder` (`orderService.ts`) e
 * `assertPublishable` (`cartService.ts`) exigiam `senderName` não vazio. O
 * segundo roda DENTRO da transação de confirmação do pagamento: uma carta
 * cujo remetente fosse apagado em `AWAITING_PAYMENT` (a carta continua
 * editável com a cobrança aberta) tinha o Pix aprovado recusado na
 * publicação, e o pedido ficava PENDING com o dinheiro já pago.
 *
 * Cobre:
 * 1. Rascunho com remetente vazio (criação e autosave apagando o nome).
 * 2. Pedido com remetente vazio.
 * 3. Confirmação simulada do pagamento (mock e webhook aprovado).
 * 4. Publicação correta após o pagamento (slug, datas, conteúdo).
 * 5. Reprocessamento idempotente da confirmação (mock repetido e o mesmo
 *    evento de webhook reentregue).
 * 6. Carta publicada abrindo sem assinatura (`getPublicCart`).
 * 7. Carta com remetente preenchido, como antes.
 * 8. Os demais campos obrigatórios continuam recusados, no pedido e na
 *    publicação.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;
const DB_TIMEOUT = 60_000;
const RUN_ID = randomUUID().slice(0, 8);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Retrato válido de webhook Pix aprovado, batendo com o plano LIMITED (R$18,90/BRL). */
function validPixWebhookFields() {
  return {
    transactionAmount: 18.9,
    currencyId: "BRL",
    paymentMethodId: "pix",
    paymentTypeId: "bank_transfer",
  } as const;
}

/** Confirmação mock é fail-closed: cada teste declara o ambiente de que precisa. */
function useMockPayment(): void {
  vi.stubEnv("PAYMENT_MODE", "mock");
  vi.stubEnv("ALLOW_MOCK_PAYMENT_CONFIRMATION", "true");
  vi.stubEnv("EMAIL_MODE", "mock");
}

/**
 * Pedido sem pagamento vinculado, esperando o primeiro webhook (mesmo motivo
 * de `webhookPaymentIntegrity.integration.test.ts`). Nenhuma chamada ao
 * Mercado Pago acontece: o webhook recebe o retrato do pagamento pronto.
 */
function useWebhookPayment(): void {
  vi.stubEnv("PAYMENT_MODE", "real");
  vi.stubEnv("EMAIL_MODE", "mock");
}

describe.skipIf(!RUN)(
  "Carta sem remetente — pedido, pagamento simulado e publicação (integração)",
  { timeout: DB_TIMEOUT },
  () => {
    let prisma: typeof import("@/lib/db").prisma;
    let cartService: typeof import("@/server/cartService");
    let orderService: typeof import("@/server/orderService");
    let PLAN_LIMITED_DURATION_DAYS: number;
    const cartIdsToClean: string[] = [];

    beforeAll(async () => {
      ({ prisma } = await import("@/lib/db"));
      cartService = await import("@/server/cartService");
      orderService = await import("@/server/orderService");
      ({ PLAN_LIMITED_DURATION_DAYS } = await import("@/config/plans"));
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

    async function createDraft(label: string, overrides: Record<string, unknown> = {}) {
      const { cart, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: `Sem remetente — ${label}`,
        message: "Mensagem de teste, sem conteúdo sensível",
        senderName: "",
        ...overrides,
      });
      cartIdsToClean.push(cart.id);
      return { cart, editToken };
    }

    function orderInput(cartId: string, label: string) {
      return {
        cartId,
        planType: "LIMITED" as const,
        customerName: "Comprador",
        customerEmail: `sem.remetente.${label}.${RUN_ID}@example.com`,
        acceptTerms: true as const,
      };
    }

    async function expectConflict(promise: Promise<unknown>) {
      await expect(promise).rejects.toMatchObject({ name: "ApiError", code: "conflict" });
    }

    // --- 1. Rascunho -----------------------------------------------------------

    it("rascunho aceita remetente vazio na criação e no autosave", async () => {
      const { cart, editToken } = await createDraft("rascunho", { senderName: "Nome provisório" });
      expect(cart.senderName).toBe("Nome provisório");

      const cleared = await cartService.updateDraft(cart.id, editToken, { senderName: "" });
      expect(cleared.senderName).toBe("");

      const row = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(row.senderName).toBe("");
      expect(row.status).toBe("DRAFT");
    });

    // --- 2 a 6. Pedido, confirmação mock, publicação, idempotência, leitura ----

    it("pedido, confirmação mock e publicação de carta sem remetente; reconfirmar é idempotente", async () => {
      useMockPayment();
      const { cart, editToken } = await createDraft("mock", { signature: "" });

      // 2. Pedido: antes da correção, "Complete a cartinha antes de ir para o pagamento."
      const order = await orderService.createOrder(editToken, orderInput(cart.id, "mock"));
      expect(order.status).toBe("PENDING");
      const awaiting = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(awaiting.status).toBe("AWAITING_PAYMENT");

      // 3. Confirmação simulada.
      const result = await orderService.mockConfirmOrder(order.id, "success");
      expect(result.order.status).toBe("PAID");
      expect(result.publicUrl).toMatch(/\/c\/[A-Za-z0-9_-]+$/);

      // 4. Publicação correta.
      const published = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(published.status).toBe("PUBLISHED");
      expect(published.slug).toBeTruthy();
      expect(published.publishedAt).not.toBeNull();
      expect(published.planType).toBe("LIMITED");
      expect(published.expiresAt!.getTime() - published.publishedAt!.getTime()).toBe(
        PLAN_LIMITED_DURATION_DAYS * DAY_MS,
      );
      expect(published.senderName).toBe("");
      expect(published.signature).toBe("");
      expect(published.message).toBe("Mensagem de teste, sem conteúdo sensível");
      expect(result.publicUrl).toContain(published.slug!);

      // 5. Reprocessar a confirmação não republica, não troca o slug nem duplica e-mail.
      const again = await orderService.mockConfirmOrder(order.id, "success");
      expect(again.order.status).toBe("PAID");
      expect(again.publicUrl).toBe(result.publicUrl);
      const republished = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(republished.slug).toBe(published.slug);
      expect(republished.publishedAt!.getTime()).toBe(published.publishedAt!.getTime());
      expect(republished.expiresAt!.getTime()).toBe(published.expiresAt!.getTime());
      expect(await prisma.emailDelivery.count({ where: { orderId: order.id } })).toBe(1);
      expect(await prisma.order.count({ where: { cartId: cart.id, status: "PAID" } })).toBe(1);

      // 6. A carta abre pelo link público, sem remetente nem assinatura.
      const opened = await cartService.getPublicCart(published.slug!);
      expect(opened.state).toBe("ok");
      if (opened.state !== "ok") return;
      expect(opened.cart.senderName).toBe("");
      expect(opened.cart.signature).toBe("");
      expect(opened.cart.message).toBe("Mensagem de teste, sem conteúdo sensível");
    });

    it("remetente apagado com a cobrança aberta: o pagamento aprovado por webhook publica (antes ficava PENDING)", async () => {
      useWebhookPayment();
      const { cart, editToken } = await createDraft("webhook", { senderName: "Testador" });
      const order = await orderService.createOrder(editToken, orderInput(cart.id, "webhook"));

      // A carta continua editável em AWAITING_PAYMENT: a pessoa volta e apaga o nome.
      const edited = await cartService.updateDraft(cart.id, editToken, { senderName: "" });
      expect(edited.senderName).toBe("");
      expect(edited.status).toBe("AWAITING_PAYMENT");

      const event = {
        ...validPixWebhookFields(),
        provider: "mercadopago",
        providerEventId: `evt_sem_remetente_${RUN_ID}`,
        providerPaymentId: `mp_sem_remetente_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      };

      // 3. Antes da correção, assertPublishable lançava aqui e a transação inteira voltava.
      const outcome = await orderService.applyMercadoPagoWebhook(event);
      expect(outcome).toEqual({ kind: "applied", internalStatus: "PAID" });

      // 4. Publicada, com o remetente vazio que estava gravado no momento do pagamento.
      const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(orderRow.status).toBe("PAID");
      expect(orderRow.paidAt).not.toBeNull();
      const published = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(published.status).toBe("PUBLISHED");
      expect(published.slug).toBeTruthy();
      expect(published.senderName).toBe("");

      // 5. O mesmo evento reentregue é descartado como duplicado.
      const duplicate = await orderService.applyMercadoPagoWebhook(event);
      expect(duplicate).toEqual({ kind: "duplicate" });
      const after = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(after.slug).toBe(published.slug);
      expect(after.publishedAt!.getTime()).toBe(published.publishedAt!.getTime());
      expect(await prisma.emailDelivery.count({ where: { orderId: order.id } })).toBe(1);

      // 6. Abre pelo link público.
      const opened = await cartService.getPublicCart(published.slug!);
      expect(opened.state).toBe("ok");
    });

    // --- 7. Remetente preenchido -------------------------------------------------

    it("carta com remetente e assinatura funciona como antes", async () => {
      useMockPayment();
      const { cart, editToken } = await createDraft("com-remetente", {
        senderName: "Testador",
        signature: "Com carinho",
      });
      const order = await orderService.createOrder(editToken, orderInput(cart.id, "com-remetente"));
      const result = await orderService.mockConfirmOrder(order.id, "success");
      expect(result.order.status).toBe("PAID");

      const published = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(published.status).toBe("PUBLISHED");
      const opened = await cartService.getPublicCart(published.slug!);
      expect(opened.state).toBe("ok");
      if (opened.state !== "ok") return;
      expect(opened.cart.senderName).toBe("Testador");
      expect(opened.cart.signature).toBe("Com carinho");
    });

    // --- 8. Demais campos obrigatórios -------------------------------------------

    it.each([
      ["título vazio", { title: "" }],
      ["mensagem vazia", { message: "" }],
      ["mensagem só com espaços", { message: "  \n  " }],
      ["sem tipo de destinatário", { recipientType: null }],
    ] as const)("pedido continua recusado: %s", async (label, missing) => {
      useMockPayment();
      const { cart, editToken } = await createDraft(`recusa-${label}`, missing);
      await expectConflict(orderService.createOrder(editToken, orderInput(cart.id, "recusa")));

      const row = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(row.status).toBe("DRAFT");
      expect(await prisma.order.count({ where: { cartId: cart.id } })).toBe(0);
    });

    it("publicação continua recusada sem mensagem: o pagamento volta inteiro e o pedido fica PENDING", async () => {
      useMockPayment();
      const { cart, editToken } = await createDraft("recusa-publicacao");
      const order = await orderService.createOrder(editToken, orderInput(cart.id, "recusa-publicacao"));

      // Mensagem apagada com a cobrança aberta.
      await cartService.updateDraft(cart.id, editToken, { message: "" });

      await expectConflict(orderService.mockConfirmOrder(order.id, "success"));

      const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(orderRow.status).toBe("PENDING");
      expect(orderRow.paidAt).toBeNull();
      const cartRow = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(cartRow.status).toBe("AWAITING_PAYMENT");
      expect(cartRow.slug).toBeNull();
      expect(await prisma.emailDelivery.count({ where: { orderId: order.id } })).toBe(0);
    });

    it("limite de tamanho do remetente continua valendo", async () => {
      const { draftUpdateSchema } = await import("@/server/schemas");
      const { LIMITS } = await import("@/lib/limits");
      expect(draftUpdateSchema.safeParse({ senderName: "" }).success).toBe(true);
      expect(draftUpdateSchema.safeParse({ senderName: "x".repeat(LIMITS.senderName) }).success).toBe(true);
      expect(draftUpdateSchema.safeParse({ senderName: "x".repeat(LIMITS.senderName + 1) }).success).toBe(false);
    });
  },
);
