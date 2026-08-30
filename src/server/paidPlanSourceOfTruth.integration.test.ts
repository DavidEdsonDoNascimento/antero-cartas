/**
 * Testes de INTEGRAÇÃO (banco real) da correção do defeito encontrado na
 * auditoria de 2026-08-30 (`claude-reports/latest.md`, seção 4): a duração e
 * o plano entregues na publicação vinham de `Cart.planType` — editável
 * enquanto a carta está em `AWAITING_PAYMENT` — em vez do `Order.planType`
 * do pedido efetivamente pago. Isso permitia, por exemplo, pagar o Pix do
 * plano Essencial depois de trocar a carta para Para Sempre e publicar sem
 * expiração pelo preço do plano mais barato (ou o inverso, lesando o
 * cliente).
 *
 *   RUN_DB_TESTS=true pnpm test
 *
 * A regra corrigida: o pedido pago é o contrato e a única fonte de verdade
 * para duração, plano publicado e conteúdo do e-mail — nunca o estado
 * editável da Cart.
 *
 * Cobre:
 * 1. Order LIMITED pago + Cart trocada para PERMANENT antes do pagamento:
 *    publica LIMITED e reconcilia Cart.planType.
 * 2. Sentido inverso: Order PERMANENT pago + Cart trocada para LIMITED:
 *    publica PERMANENT (sem expiração) e reconcilia Cart.planType.
 * 3. Plano Essencial sem divergência: expiresAt é EXATAMENTE
 *    paidAt + PLAN_LIMITED_DURATION_DAYS (não só "não nulo").
 * 4. Plano Para Sempre sem divergência: continua sem expiração.
 * 5. O e-mail de confirmação usa o plano pago e a expiração reconciliada,
 *    mesmo quando a Cart estava divergente antes da publicação.
 * 6. Idempotência: confirmar de novo, ou reprocessar a publicação
 *    diretamente com um plano diferente, nunca altera nem estende o
 *    expiresAt de uma cartinha já publicada.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;
const DB_TIMEOUT = 60_000;
const RUN_ID = randomUUID().slice(0, 8);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `mockConfirmOrder` é fail-closed (PAYMENT_MODE=mock +
 * ALLOW_MOCK_PAYMENT_CONFIRMATION=true). Mesmo padrão de
 * phase2.integration.test.ts: cada teste declara o ambiente de que precisa,
 * em vez de herdar o que estiver em `.env.local`.
 */
function useMockPaymentConfirmation(): void {
  vi.stubEnv("PAYMENT_MODE", "mock");
  vi.stubEnv("ALLOW_MOCK_PAYMENT_CONFIRMATION", "true");
}

describe.skipIf(!RUN)(
  "publishCartWithClient — plano entregue segue o pedido pago (auditoria 2026-08-30)",
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

    /** Cria um rascunho completo (publicável). */
    async function createCompleteDraft(label: string) {
      const { cart, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: `Fonte de verdade do plano pago — ${label}`,
        message: "Mensagem de teste, sem conteúdo sensível",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);
      return { cart, editToken };
    }

    // --- 1. Order LIMITED pago, Cart trocada para PERMANENT ------------------

    it("Order LIMITED pago + Cart trocada para PERMANENT: publica LIMITED e reconcilia a Cart", async () => {
      useMockPaymentConfirmation();
      const { cart, editToken } = await createCompleteDraft("limited-pago-cart-permanent");

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `plano.a.${RUN_ID}@example.com`,
        acceptTerms: true,
      });

      // Simula "voltar e trocar de plano" com a cobrança já aberta —
      // AWAITING_PAYMENT permite (EDITABLE_STATUSES em cartService.ts).
      const switched = await cartService.updateDraft(cart.id, editToken, {
        planType: "PERMANENT",
      });
      expect(switched.planType).toBe("PERMANENT");

      // Paga o pedido LIMITED original (o "Pix antigo" do cenário de auditoria).
      const result = await orderService.mockConfirmOrder(order.id, "success");

      expect(result.order.planType).toBe("LIMITED"); // o pedido pago nunca muda
      expect(result.cart?.planType).toBe("LIMITED"); // reconciliado com o pedido pago
      expect(result.cart?.expiresAt).not.toBeNull();

      const paidAtMs = new Date(result.order.paidAt!).getTime();
      const expiresAtMs = new Date(result.cart!.expiresAt!).getTime();
      expect(expiresAtMs).toBe(paidAtMs + PLAN_LIMITED_DURATION_DAYS * DAY_MS);

      const cartInDb = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(cartInDb.planType).toBe("LIMITED");
    });

    // --- 2. Sentido inverso: Order PERMANENT pago, Cart trocada para LIMITED -

    it("Order PERMANENT pago + Cart trocada para LIMITED: publica PERMANENT e reconcilia a Cart", async () => {
      useMockPaymentConfirmation();
      const { cart, editToken } = await createCompleteDraft("permanent-pago-cart-limited");

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "PERMANENT",
        customerName: "Comprador",
        customerEmail: `plano.b.${RUN_ID}@example.com`,
        acceptTerms: true,
      });

      const switched = await cartService.updateDraft(cart.id, editToken, {
        planType: "LIMITED",
      });
      expect(switched.planType).toBe("LIMITED");

      const result = await orderService.mockConfirmOrder(order.id, "success");

      expect(result.order.planType).toBe("PERMANENT");
      expect(result.cart?.planType).toBe("PERMANENT");
      expect(result.cart?.expiresAt).toBeNull();

      const cartInDb = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(cartInDb.planType).toBe("PERMANENT");
    });

    // --- 3. Essencial sem divergência: valor exato ----------------------------

    it("plano Essencial sem divergência: expiresAt é exatamente paidAt + PLAN_LIMITED_DURATION_DAYS", async () => {
      useMockPaymentConfirmation();
      const { cart, editToken } = await createCompleteDraft("limited-normal");

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `plano.limited.${RUN_ID}@example.com`,
        acceptTerms: true,
      });

      const result = await orderService.mockConfirmOrder(order.id, "success");

      const paidAtMs = new Date(result.order.paidAt!).getTime();
      const expiresAtMs = new Date(result.cart!.expiresAt!).getTime();
      expect(expiresAtMs).toBe(paidAtMs + PLAN_LIMITED_DURATION_DAYS * DAY_MS);
    });

    // --- 4. Para Sempre sem divergência: nunca expira -------------------------

    it("plano Para Sempre sem divergência: continua sem expiração", async () => {
      useMockPaymentConfirmation();
      const { cart, editToken } = await createCompleteDraft("permanent-normal");

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "PERMANENT",
        customerName: "Comprador",
        customerEmail: `plano.permanent.${RUN_ID}@example.com`,
        acceptTerms: true,
      });

      const result = await orderService.mockConfirmOrder(order.id, "success");

      expect(result.cart?.planType).toBe("PERMANENT");
      expect(result.cart?.expiresAt).toBeNull();
    });

    // --- 5. E-mail reflete o plano pago, não o divergente ---------------------

    it("e-mail de confirmação usa o plano pago e a expiração reconciliada, mesmo com Cart divergente", async () => {
      useMockPaymentConfirmation();
      const { cart, editToken } = await createCompleteDraft("email-plano-pago");

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador Email",
        customerEmail: `plano.email.${RUN_ID}@example.com`,
        acceptTerms: true,
      });

      // Troca para Para Sempre antes de pagar o Pix do Essencial.
      await cartService.updateDraft(cart.id, editToken, { planType: "PERMANENT" });

      const result = await orderService.mockConfirmOrder(order.id, "success");
      expect(result.cart?.planType).toBe("LIMITED");

      const delivery = await prisma.emailDelivery.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(delivery.status).toBe("SENT");

      const rendered = JSON.parse(delivery.payload) as { text: string };
      expect(rendered.text).toContain("plano Essencial");
      expect(rendered.text).not.toContain("plano Para Sempre");
      expect(rendered.text).toContain("ficará disponível até");
      expect(rendered.text).not.toContain("não tem data para expirar");
    });

    // --- 6. Idempotência: nunca altera nem estende expiresAt ------------------

    it("republicar uma carta já publicada (idempotente) não altera plano nem estende expiresAt", async () => {
      useMockPaymentConfirmation();
      const { cart, editToken } = await createCompleteDraft("idempotente");

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `plano.idem.${RUN_ID}@example.com`,
        acceptTerms: true,
      });

      const first = await orderService.mockConfirmOrder(order.id, "success");
      const firstExpiresAt = first.cart!.expiresAt;
      const firstPlanType = first.cart!.planType;

      // Confirmação repetida: idempotência já coberta pelo orderService.
      const second = await orderService.mockConfirmOrder(order.id, "success");
      expect(second.cart?.expiresAt).toBe(firstExpiresAt);
      expect(second.cart?.planType).toBe(firstPlanType);

      // Execução direta de publishCartWithClient com um plano DIFERENTE e um
      // "paidAt" bem mais tarde, simulando qualquer chamador futuro que
      // reprocesse a publicação: o guard idempotente (status PUBLISHED com
      // slug) precisa vencer antes de qualquer recomputação.
      const reprocessed = await cartService.publishCartWithClient(
        prisma,
        cart.id,
        new Date(new Date(first.order.paidAt!).getTime() + 999 * DAY_MS),
        "PERMANENT",
      );
      expect(reprocessed.planType).toBe(firstPlanType);
      expect(reprocessed.expiresAt?.toISOString()).toBe(firstExpiresAt);
    });
  },
);
