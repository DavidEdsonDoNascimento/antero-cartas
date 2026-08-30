/**
 * Testes de INTEGRAÇÃO (banco real, Mercado Pago mockado — nenhuma chamada
 * real) da correção do incidente de Production de 2026-08-30: um cartão foi
 * aprovado pelo Mercado Pago, mas a leitura da página de sucesso caiu na
 * janela entre `Order -> PAID` e `Cart -> PUBLISHED` (duas transações
 * separadas) e mostrou "Não foi possível concluir o pedido." para um
 * pagamento que, na verdade, tinha sido aceito.
 *
 *   RUN_DB_TESTS=true pnpm test
 *
 * Cobre:
 * 1. `finalizeOrderAsPaid` agora atômico: publicação falha -> Order
 *    permanece PENDING e Cart não é publicada (rollback completo).
 * 2. Sucesso altera Order e Cart juntos, na mesma escrita.
 * 3. `createOrder` recusa uma nova Order quando já existe uma Order PAID
 *    para a Cart, independentemente de `Cart.status` (rede de segurança do
 *    "Tentar novamente" contra segunda cobrança).
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;
const DB_TIMEOUT = 60_000;
const RUN_ID = randomUUID().slice(0, 8);

/** Retrato válido de webhook Pix aprovado, batendo com o plano LIMITED (R$18,90/BRL). */
function validPixWebhookFields() {
  return {
    transactionAmount: 18.9,
    currencyId: "BRL",
    paymentMethodId: "pix",
    paymentTypeId: "bank_transfer",
  } as const;
}

describe.skipIf(!RUN)(
  "finalizeOrderAsPaid — atomicidade Order/Cart (incidente 2026-08-30)",
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

    // `createOrder` só devolve o pedido com `providerPaymentId` nulo (pronto
    // para o webhook sintético vincular) quando o provider NÃO é o mock —
    // ver mesmo comentário em publicCartAccess.integration.test.ts. Nunca
    // toca `.env.local` no disco; EMAIL_MODE forçado a "mock" para nunca
    // depender (nem por acidente) de um "real" deixado no ambiente local.
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

    /** Cria um rascunho completo (publicável) e o pedido PENDING correspondente. */
    async function createDraftAndOrder(label: string) {
      vi.stubEnv("PAYMENT_MODE", "real");
      vi.stubEnv("EMAIL_MODE", "mock");

      const { cart, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: `Teste de atomicidade — ${label}`,
        message: "Mensagem de teste, sem conteúdo sensível",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `atomic.${label}.${RUN_ID}@example.com`.replace(/\s+/g, ""),
        acceptTerms: true,
      });

      return { cart, editToken, order };
    }

    // --- 1. Falha na publicação -> rollback completo -------------------------

    it("publishCartWithClient falhando deixa Order PENDING e Cart não publicada (rollback atômico)", async () => {
      const { cart, order } = await createDraftAndOrder("rollback");

      // Corrompe deliberadamente a cartinha para que assertPublishable
      // lance no meio de finalizeOrderAsPaid — simula qualquer falha real
      // de publicação sem precisar mockar Prisma internamente.
      await prisma.cart.update({ where: { id: cart.id }, data: { title: "" } });

      await expect(
        orderService.applyMercadoPagoWebhook({
          ...validPixWebhookFields(),
          provider: "mercadopago",
          providerEventId: `evt_rollback_${RUN_ID}`,
          providerPaymentId: `mp_rollback_${RUN_ID}`,
          externalReference: order.id,
          status: "approved",
          statusDetail: "accredited",
          type: "payment",
        }),
      ).rejects.toThrow();

      const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(orderAfter.status).toBe("PENDING");
      expect(orderAfter.paidAt).toBeNull();

      const cartAfter = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(cartAfter.status).toBe("AWAITING_PAYMENT");
      expect(cartAfter.slug).toBeNull();
      expect(cartAfter.publishedAt).toBeNull();

      // O e-mail nunca deveria ter sido sequer tentado: a transação de
      // pagamento/publicação inteira foi revertida antes de chegar lá.
      const emails = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
      expect(emails).toHaveLength(0);
    });

    // --- 2. Sucesso altera Order e Cart juntos --------------------------------

    it("webhook aprovado altera Order e Cart na mesma operação (PAID + PUBLISHED consistentes)", async () => {
      const { cart, order } = await createDraftAndOrder("sucesso-conjunto");

      const outcome = await orderService.applyMercadoPagoWebhook({
        ...validPixWebhookFields(),
        provider: "mercadopago",
        providerEventId: `evt_sucesso_${RUN_ID}`,
        providerPaymentId: `mp_sucesso_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(outcome).toMatchObject({ kind: "applied", internalStatus: "PAID" });

      const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      const cartAfter = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });

      expect(orderAfter.status).toBe("PAID");
      expect(orderAfter.paidAt).not.toBeNull();

      expect(cartAfter.status).toBe("PUBLISHED");
      expect(cartAfter.slug).not.toBeNull();
      expect(cartAfter.publishedAt).not.toBeNull();
      expect(cartAfter.expiresAt).not.toBeNull();

      // Mesmo instante — evidência de que as duas escritas vieram da mesma
      // transação, não de dois passos que só coincidentemente convergiram.
      expect(cartAfter.publishedAt?.getTime()).toBe(orderAfter.paidAt?.getTime());
    });

    // --- 3. createOrder recusa nova Order quando já existe uma PAID ----------

    it("createOrder recusa nova Order quando a Cart já tem uma Order PAID, mesmo com Cart AWAITING_PAYMENT", async () => {
      const { cart, editToken, order } = await createDraftAndOrder("paid-guard");

      const outcome = await orderService.applyMercadoPagoWebhook({
        ...validPixWebhookFields(),
        provider: "mercadopago",
        providerEventId: `evt_paidguard_${RUN_ID}`,
        providerPaymentId: `mp_paidguard_${RUN_ID}`,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(outcome).toMatchObject({ kind: "applied", internalStatus: "PAID" });

      // Força deliberadamente Cart de volta a AWAITING_PAYMENT — a guarda
      // pedida precisa depender só da existência de uma Order PAID, nunca
      // de Cart.status (defesa em profundidade; hoje a publicação atômica
      // torna PAID+AWAITING_PAYMENT inatingível pelo fluxo normal).
      await prisma.cart.update({ where: { id: cart.id }, data: { status: "AWAITING_PAYMENT" } });

      await expect(
        orderService.createOrder(editToken, {
          cartId: cart.id,
          planType: "LIMITED",
          customerName: "Comprador",
          customerEmail: `atomic.retry.${RUN_ID}@example.com`,
          acceptTerms: true,
        }),
      ).rejects.toMatchObject({ code: "forbidden_state" });

      // Nenhuma segunda Order foi criada.
      const ordersForCart = await prisma.order.findMany({ where: { cartId: cart.id } });
      expect(ordersForCart).toHaveLength(1);
    });
  },
);
