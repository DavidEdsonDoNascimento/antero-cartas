/**
 * Testes de INTEGRAÇÃO do acesso público após reversão de pagamento (banco
 * real, provedor Mercado Pago mockado — nenhuma chamada real).
 *
 *   RUN_DB_TESTS=true pnpm test
 *
 * Cobrem a lacuna encontrada em auditoria: `getPublicCart` verificava só
 * `Cart.status`/expiração, nunca o status atual do pagamento — uma carta
 * estornada (`REFUNDED`) ou contestada (`CHARGED_BACK`) continuava
 * publicamente acessível para sempre (task 013, seção 9).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
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
  "getPublicCart — acesso revogado após estorno/contestação (integração)",
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
    // para o webhook sintético abaixo vincular) quando o provider NÃO é o
    // mock — com `PAYMENT_MODE=mock` (ambiente combinado com o usuário para
    // a jornada manual) ele criaria um pagamento mock automático na hora e
    // qualquer webhook synthetic bateria em `stale_attempt` antes mesmo de
    // chegar à correção testada aqui. Isolado por teste, nunca toca
    // `.env.local` no disco.
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

    /** Cria um pedido real, aprova via webhook (mockado) e publica a carta. */
    async function createPaidPublishedCart(label: string) {
      // Ver comentário do afterEach acima.
      vi.stubEnv("PAYMENT_MODE", "real");

      const { cart, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: label,
        message: "Mensagem de teste de acesso público após pagamento",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `acesso.${label}.${RUN_ID}@example.com`.replace(/\s+/g, ""),
        acceptTerms: true,
      });

      const paymentId = `mp_acesso_${label}_${RUN_ID}`;
      const outcome = await orderService.applyMercadoPagoWebhook({
        ...validPixWebhookFields(),
        provider: "mercadopago",
        providerEventId: `evt_acesso_${label}_${RUN_ID}`,
        providerPaymentId: paymentId,
        externalReference: order.id,
        status: "approved",
        statusDetail: "accredited",
        type: "payment",
      });
      expect(outcome).toMatchObject({ kind: "applied", internalStatus: "PAID" });

      const cartRow = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
      expect(cartRow.status).toBe("PUBLISHED");
      return { cartRow, orderId: order.id, paymentId };
    }

    // --- 1. PUBLISHED + PAID continua pública -------------------------------

    it("PUBLISHED + PAID continua acessível publicamente", async () => {
      const { cartRow } = await createPaidPublishedCart("paid-ok");
      const result = await cartService.getPublicCart(cartRow.slug!);
      expect(result.state).toBe("ok");
    });

    // --- 2. PUBLISHED + REFUNDED deixa de ser pública ------------------------

    it("PUBLISHED + REFUNDED deixa de ser acessível — mesmo resultado de cartinha inexistente", async () => {
      const { cartRow, orderId, paymentId } = await createPaidPublishedCart("refunded");

      const refundOutcome = await orderService.applyMercadoPagoWebhook({
        ...validPixWebhookFields(),
        provider: "mercadopago",
        providerEventId: `evt_refund_acesso_${RUN_ID}`,
        providerPaymentId: paymentId,
        externalReference: orderId,
        status: "refunded",
        statusDetail: null,
        type: "payment",
      });
      expect(refundOutcome).toMatchObject({ kind: "applied", internalStatus: "REFUNDED" });

      const result = await cartService.getPublicCart(cartRow.slug!);
      // Mesmo "not_found" de uma cartinha que nunca existiu — nunca revela
      // publicamente que o motivo foi um estorno.
      expect(result.state).toBe("not_found");

      // Nada foi apagado — só o acesso público foi revogado.
      const cartAfter = await prisma.cart.findUniqueOrThrow({ where: { id: cartRow.id } });
      expect(cartAfter.status).toBe("PUBLISHED");
      expect(cartAfter.slug).toBe(cartRow.slug);
    });

    // --- 3. PUBLISHED + CHARGED_BACK deixa de ser pública --------------------

    it("PUBLISHED + CHARGED_BACK deixa de ser acessível publicamente", async () => {
      const { cartRow, orderId, paymentId } = await createPaidPublishedCart("chargedback");

      const cbOutcome = await orderService.applyMercadoPagoWebhook({
        ...validPixWebhookFields(),
        provider: "mercadopago",
        providerEventId: `evt_cb_acesso_${RUN_ID}`,
        providerPaymentId: paymentId,
        externalReference: orderId,
        status: "charged_back",
        statusDetail: null,
        type: "payment",
      });
      expect(cbOutcome).toMatchObject({ kind: "applied", internalStatus: "CHARGED_BACK" });

      const result = await cartService.getPublicCart(cartRow.slug!);
      expect(result.state).toBe("not_found");
    });

    // --- 4. Carta expirada continua não pública (regressão) ------------------

    it("carta expirada continua não pública (regressão — não afetada por esta correção)", async () => {
      const { cartRow } = await createPaidPublishedCart("expirada-regressao");
      await prisma.cart.update({
        where: { id: cartRow.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const result = await cartService.getPublicCart(cartRow.slug!);
      expect(result.state).toBe("expired");
    });

    // --- 5. Carta não publicada continua não pública -------------------------

    it("carta em DRAFT (nunca publicada) continua não pública", async () => {
      const { cart } = await cartService.createDraft({
        recipientType: "amigo",
        title: "Rascunho — não publicado",
        message: "Ainda não paga",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      // DRAFT nunca tem slug — não há link público a testar; a garantia é
      // que nenhum slug arbitrário devolve uma carta não publicada.
      const result = await cartService.getPublicCart(`nao-publicada-${RUN_ID}`);
      expect(result.state).toBe("not_found");
    });

    // --- Demonstração/seed sem Order: acesso preservado, de propósito -------

    it("carta de demonstração publicada sem nenhuma Order continua acessível (nada a revogar)", async () => {
      // Reproduz literalmente o cenário de prisma/seed.ts (`seed-demonstracao`/
      // `seed-expirada`): Cart publicado direto no banco, sem Order alguma.
      const { cart } = await cartService.createDraft({
        recipientType: "amigo",
        title: "Demonstração sem pedido",
        message: "Carta de demonstração, sem Order associada",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const slug = `demo-sem-order-${RUN_ID}`;
      await prisma.cart.update({
        where: { id: cart.id },
        data: { status: "PUBLISHED", slug, publishedAt: new Date() },
      });

      const result = await cartService.getPublicCart(slug);
      expect(result.state).toBe("ok");
    });
  },
);

// --- 6. A página pública usa getPublicCart como único ponto de leitura ------
// Não depende do banco — roda sempre, dentro ou fora de RUN_DB_TESTS.
describe("página pública /c/[slug] — sem bypass de getPublicCart", () => {
  it("o Server Component lê a carta exclusivamente via getPublicCart, nunca via prisma.cart direto", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/c/[slug]/page.tsx"),
      "utf8",
    );
    expect(source).toContain("getPublicCart(");
    expect(source).not.toMatch(/prisma\.cart\.(findUnique|findFirst)/);
  });
});
