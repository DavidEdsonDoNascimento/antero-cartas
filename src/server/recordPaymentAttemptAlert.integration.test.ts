/**
 * Testes de INTEGRAÇÃO do alerta operacional de `recordPaymentAttempt`
 * (banco real, provedor falso — nenhuma chamada ao Mercado Pago).
 *
 *   RUN_DB_TESTS=true pnpm test
 *
 * `[pagamento] cobrança criada sem vínculo com o pedido` deve soar SÓ
 * quando a cobrança que a chamada em curso acabou de criar ficou órfã de
 * verdade (nenhum vínculo, ou vínculo com OUTRO id). Quando o webhook já
 * vinculou exatamente o MESMO `providerPaymentId` — o caminho normal do
 * cenário "webhook chega antes de `recordPaymentAttempt` rodar" — é sucesso
 * idempotente, não uma cobrança perdida, e não deve gerar alerta.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;
const DB_TIMEOUT = 60_000;
const RUN_ID = randomUUID().slice(0, 8);

const ALERTA = "[pagamento] cobrança criada sem vínculo com o pedido";

/** Retrato válido de pagamento de cartão aprovado, batendo com o plano LIMITED. */
function validCardWebhookFields() {
  return { transactionAmount: 18.9, currencyId: "BRL", paymentMethodId: "visa", paymentTypeId: "credit_card" };
}

describe.skipIf(!RUN)(
  "recordPaymentAttempt — alerta operacional (integração)",
  { timeout: DB_TIMEOUT },
  () => {
    let prisma: typeof import("@/lib/db").prisma;
    let orderService!: typeof import("@/server/orderService");
    const cartIdsToClean: string[] = [];

    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(async () => {
      vi.doUnmock("@/server/payment");
      vi.resetModules();
      if (!prisma) return;
      for (const cartId of cartIdsToClean.splice(0)) {
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
     * Monta um pedido real e instala um provedor falso cujo `createPayment`
     * roda `duringCall` (o efeito colateral que decide o cenário — webhook,
     * rotação de chave etc.) e então devolve `result`. Espelha o `setup` de
     * `cardAttempt.integration.test.ts`, mas expõe o `orderId` para o
     * `duringCall` via closure, igual às corridas de webhook já existentes.
     */
    async function setup(
      label: string,
      resultProviderPaymentId: string,
      duringCall: (orderId: string) => Promise<void>,
    ) {
      let orderIdRef = "";

      vi.doMock("@/server/payment", async (importOriginal) => {
        const actual = await importOriginal<typeof import("@/server/payment")>();
        return {
          ...actual,
          getPaymentProvider: () => ({
            name: "mercadopago",
            async createPayment() {
              await duringCall(orderIdRef);
              return { providerPaymentId: resultProviderPaymentId, status: "pending" as const };
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
        message: "Mensagem de teste do alerta de recordPaymentAttempt",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `alerta.${label}.${RUN_ID}@example.com`.replace(/\s+/g, ""),
        acceptTerms: true,
      });
      orderIdRef = order.id;

      return { order, editToken };
    }

    const cartao = (token: string) => ({ token, installments: 1, paymentMethodId: "visa" });

    it("webhook já vinculou o MESMO id: sucesso idempotente, nenhum console.error", async () => {
      const idDestaTentativa = `mp_alerta_mesmo_${RUN_ID}`;
      const { order, editToken } = await setup(
        "alerta-mesmo-id",
        idDestaTentativa,
        async (orderId) => {
          await orderService.applyMercadoPagoWebhook({
            ...validCardWebhookFields(),
            provider: "mercadopago",
            providerEventId: `evt_alerta_mesmo_${RUN_ID}`,
            providerPaymentId: idDestaTentativa,
            externalReference: orderId,
            status: "approved",
            statusDetail: "accredited",
            type: "payment",
          });
        },
      );

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-mesmo-id"));
      } finally {
        expect(spy).not.toHaveBeenCalledWith(ALERTA, expect.anything());
        spy.mockRestore();
      }

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBe(idDestaTentativa);
      expect(row.status).toBe("PAID"); // o webhook já aprovou
    });

    it("webhook vinculou um id DIFERENTE: o alerta permanece", async () => {
      const idOutraTentativa = `mp_alerta_outro_${RUN_ID}`;
      const idDestaChamada = `mp_alerta_atual_${RUN_ID}`;
      const { order, editToken } = await setup(
        "alerta-id-diferente",
        idDestaChamada,
        async (orderId) => {
          await orderService.applyMercadoPagoWebhook({
            ...validCardWebhookFields(),
            provider: "mercadopago",
            providerEventId: `evt_alerta_outro_${RUN_ID}`,
            providerPaymentId: idOutraTentativa,
            externalReference: orderId,
            status: "pending",
            statusDetail: null,
            type: "payment",
          });
        },
      );

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-id-diferente"));
      } finally {
        expect(spy).toHaveBeenCalledWith(
          ALERTA,
          expect.objectContaining({ providerPaymentId: idDestaChamada, orderId: order.id }),
        );
        spy.mockRestore();
      }

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      // O vínculo do webhook (a tentativa que realmente "venceu") não foi
      // sobrescrito pela cobrança órfã desta chamada.
      expect(row.providerPaymentId).toBe(idOutraTentativa);
    });

    it("providerPaymentId ainda nulo (chave rotacionada por outra tentativa): o alerta permanece", async () => {
      const idDestaChamada = `mp_alerta_nulo_${RUN_ID}`;
      const { order, editToken } = await setup("alerta-id-nulo", idDestaChamada, async (orderId) => {
        // Simula outra tentativa de cartão rotacionando a chave no meio da
        // chamada (o mesmo compare-and-swap que já protege contra isso) —
        // nenhum id chega a ser vinculado, e é isso que este teste garante.
        await prisma.order.updateMany({
          where: { id: orderId },
          data: { cardIdempotencyKey: "chave-de-outra-tentativa-que-venceu" },
        });
      });

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-id-nulo"));
      } finally {
        expect(spy).toHaveBeenCalledWith(
          ALERTA,
          expect.objectContaining({ providerPaymentId: idDestaChamada, orderId: order.id }),
        );
        spy.mockRestore();
      }

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.providerPaymentId).toBeNull();
    });
  },
);
