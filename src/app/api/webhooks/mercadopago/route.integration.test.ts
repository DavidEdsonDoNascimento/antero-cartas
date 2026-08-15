/**
 * Teste de INTEGRAÇÃO ponta a ponta do webhook do Mercado Pago (banco real).
 *
 * Existe porque as duas metades do fluxo já eram testadas separadamente e
 * nunca se encontravam: `route.test.ts` mocka o domínio inteiro (só valida
 * assinatura/parsing/status HTTP) e `phase3.integration.test.ts` chama
 * `applyMercadoPagoWebhook` direto (pula a rota e a consulta ao provedor).
 * Um erro de contrato entre as duas — nome de campo, formato do
 * `external_reference` — passaria despercebido por ambas.
 *
 * Aqui só o `fetch` ao Mercado Pago é mockado. Rota, assinatura, domínio,
 * Prisma, publicação, slug, QR Code e EmailDelivery são todos reais:
 *
 *   POST assinado -> fetchMercadoPagoPayment (mock: approved)
 *   -> applyMercadoPagoWebhook real -> Postgres local real
 *   -> Order PAID -> carta publicada -> slug/link/QR -> e-mail registrado
 *
 * Fica desligado por padrão, como os demais testes de banco:
 *
 *   RUN_DB_TESTS=true pnpm test
 *
 * Nunca faz chamada de rede ao Mercado Pago e não depende de túnel/Cloudflare.
 */
import { createHmac, randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { getPlan } from "@/config/plans";
import { buildPublicCartUrl } from "@/lib/publicUrl";
import type { MercadoPagoPaymentSnapshot } from "@/server/payment/mercadopago";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;
const DB_TIMEOUT = 60_000;

/**
 * Sufixo por execução: `PaymentEvent` é único por (provider, providerEventId)
 * e sobrevive à remoção do pedido (`onDelete: SetNull`), então reaproveitar um
 * id fixo faria a segunda rodada do teste bater em "duplicate" logo na
 * primeira notificação.
 */
const RUN_ID = randomUUID().slice(0, 8);

/** Segredo próprio do teste — o do `.env.local` nunca é lido nem exposto. */
const WEBHOOK_SECRET = "webhook-secret-integracao";
const TS = "1700000000000";
const DAY_MS = 24 * 60 * 60 * 1000;

const PAYMENT_ID = `mp_approved_e2e_${RUN_ID}`;
const NOTIFICATION_ID = `evt_approved_e2e_${RUN_ID}`;

/** Mesmo manifest da rota: `id:<data.id minúsculo>;request-id:<...>;ts:<...>;` */
function signedHeaders(dataId: string, requestId: string): Record<string, string> {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${TS};`;
  const v1 = createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex");
  return { "x-signature": `ts=${TS},v1=${v1}`, "x-request-id": requestId };
}

describe.skipIf(!RUN)(
  "Fase 3 — webhook approved ponta a ponta (rota + domínio + banco real)",
  { timeout: DB_TIMEOUT },
  () => {
    let prisma: typeof import("@/lib/db").prisma;
    let cartService: typeof import("@/server/cartService");
    let orderService: typeof import("@/server/orderService");
    let POST: typeof import("./route").POST;

    /**
     * Resposta que o mock de `fetchMercadoPagoPayment` devolve. Fica num
     * holder mutável porque o `externalReference` só é conhecido depois de o
     * pedido existir, e o mock precisa ser registrado antes dos imports.
     */
    const mpPayment: { value: MercadoPagoPaymentSnapshot | null } = { value: null };
    /** Ids consultados pelo mock — prova que nenhuma chamada real saiu. */
    const fetchedIds: string[] = [];

    /** Só bookkeeping de limpeza — nunca estado compartilhado entre testes. */
    const cartIdsToClean: string[] = [];

    beforeAll(async () => {
      // Ambiente declarado, nunca herdado do `.env.local` (que está em
      // PAYMENT_MODE=real para o sandbox): o resultado do teste não pode
      // depender da máquina em que ele roda.
      vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", WEBHOOK_SECRET);
      // `real` é o modo em que o webhook existe de verdade. Efeito colateral
      // desejado: com provider real, `createOrder` não cria pagamento nenhum
      // (nem chama a rede), e deixa `providerPaymentId` nulo — que é o estado
      // real de um pedido esperando a primeira notificação.
      vi.stubEnv("PAYMENT_MODE", "real");
      // Provedor de e-mail mock: registra o envio sem rede e sem credencial.
      vi.stubEnv("EMAIL_MODE", "mock");

      vi.resetModules();

      // ÚNICO mock do teste. `importOriginal` preserva todo o resto do módulo
      // (`createMercadoPagoProvider` continua real e é o que
      // `@/server/payment` importa), então só a consulta HTTP é substituída.
      vi.doMock("@/server/payment/mercadopago", async (importOriginal) => {
        const actual = await importOriginal<typeof import("@/server/payment/mercadopago")>();
        return {
          ...actual,
          fetchMercadoPagoPayment: async (
            providerPaymentId: string,
          ): Promise<MercadoPagoPaymentSnapshot> => {
            fetchedIds.push(providerPaymentId);
            if (!mpPayment.value) throw new Error("Resposta do Mercado Pago não preparada.");
            return mpPayment.value;
          },
        };
      });

      ({ prisma } = await import("@/lib/db"));
      cartService = await import("@/server/cartService");
      orderService = await import("@/server/orderService");
      ({ POST } = await import("./route"));
    }, DB_TIMEOUT);

    afterAll(async () => {
      for (const cartId of cartIdsToClean) {
        const orders = await prisma.order.findMany({ where: { cartId }, select: { id: true } });
        // PaymentEvent é `onDelete: SetNull`: precisa sair antes do pedido,
        // senão fica órfão segurando a chave única de idempotência.
        await prisma.paymentEvent.deleteMany({
          where: { orderId: { in: orders.map((o) => o.id) } },
        });
        await prisma.order.deleteMany({ where: { cartId } });
        await prisma.cart.deleteMany({ where: { id: cartId } });
      }
      await prisma.$disconnect();

      vi.doUnmock("@/server/payment/mercadopago");
      vi.unstubAllEnvs();
      vi.resetModules();
    }, DB_TIMEOUT);

    /**
     * Entrega a notificação pela rota real e devolve o `outcome` que ela
     * classificou. A rota responde 200 para todos os desfechos (de propósito,
     * para o Mercado Pago parar de reenviar), então o log é o único lugar em
     * que ela externaliza a diferença entre "applied" e "duplicate".
     */
    async function deliverNotification(): Promise<{ res: Response; outcome: string | null }> {
      const outcomes: string[] = [];
      const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        const details = args[1] as { outcome?: string } | undefined;
        if (args[0] === "[webhook][mercadopago] processado" && details?.outcome) {
          outcomes.push(details.outcome);
        }
      });
      try {
        const res = await POST(
          new Request("https://cartas.anterosistemas.com.br/api/webhooks/mercadopago", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...signedHeaders(PAYMENT_ID, `req_${RUN_ID}`),
            },
            // Corpo idêntico nas duas entregas — é literalmente o mesmo
            // reenvio que o Mercado Pago faria.
            body: JSON.stringify({
              id: NOTIFICATION_ID,
              type: "payment",
              data: { id: PAYMENT_ID },
            }),
          }),
        );
        return { res, outcome: outcomes[0] ?? null };
      } finally {
        spy.mockRestore();
      }
    }

    it("aprova e publica na primeira notificação, e trata a reentrega idêntica como duplicada", async () => {
      // --- Arranjo: carta e pedido criados pelas funções reais, dentro do
      // próprio teste. Nada de INSERT/UPDATE manual, nenhum status forçado na
      // mão e nenhum estado herdado de outro teste.
      const { cart: draft, editToken } = await cartService.createDraft({
        recipientType: "amigo",
        title: "Aprovado ponta a ponta",
        message: "Mensagem de teste de integração",
        senderName: "Testador",
      });
      cartIdsToClean.push(draft.id);

      const created = await orderService.createOrder(editToken, {
        cartId: draft.id,
        planType: "LIMITED",
        customerName: "Comprador Webhook",
        customerEmail: `webhook.approved.${RUN_ID}@example.com`,
        acceptTerms: true,
      });
      const orderId = created.id;
      expect(created.status).toBe("PENDING");

      mpPayment.value = {
        status: "approved",
        statusDetail: "accredited",
        externalReference: orderId,
      };

      // --- Primeira entrega: o pagamento é aprovado ---
      const first = await deliverNotification();

      expect(first.res.status).toBe(200);
      expect(first.outcome).toBe("applied");

      // A rota consultou o provedor pelo id da notificação, e só pelo mock.
      expect(fetchedIds).toEqual([PAYMENT_ID]);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("PAID");
      expect(order.paidAt).not.toBeNull();
      const paidAt = order.paidAt!;

      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cart.status).toBe("PUBLISHED");
      expect(cart.slug).toBeTruthy();
      expect(cart.slug!.length).toBeGreaterThan(0);
      const slug = cart.slug!;
      const cartUpdatedAt = cart.updatedAt;

      // A carta é alcançável pela função pública real, pelo slug.
      const publicResult = await cartService.getPublicCart(slug);
      expect(publicResult.state).toBe("ok");
      if (publicResult.state !== "ok") throw new Error("inalcançável");
      expect(publicResult.cart.id).toBe(order.cartId);

      // Link e QR Code vêm da leitura pública do pedido, sem efeito colateral.
      const result = await orderService.getOrderResult(orderId);
      expect(result.order.status).toBe("PAID");
      expect(result.publicUrl).toBe(buildPublicCartUrl(slug));
      expect(result.publicUrl).toContain(slug);
      expect(result.qrCodeDataUrl).toBeTruthy();
      expect(result.qrCodeDataUrl!.startsWith("data:image/png;base64,")).toBe(true);

      // Outbox de e-mail: exatamente um registro, enviado.
      const deliveries = await prisma.emailDelivery.findMany({ where: { orderId } });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].type).toBe("cart_published");
      expect(deliveries[0].status).toBe("SENT");
      expect(deliveries[0].attempts).toBe(1);
      expect(deliveries[0].sentAt).not.toBeNull();
      // O conteúdo renderizado fica persistido em `payload`: o link público
      // precisa estar lá, senão o comprador recebe um e-mail sem a carta.
      expect(deliveries[0].payload).toContain(buildPublicCartUrl(slug));
      const emailDeliveryId = deliveries[0].id;

      // Plano LIMITED: expira exatamente `durationDays` depois do pagamento.
      const durationDays = getPlan("LIMITED").durationDays;
      expect(durationDays).toBeGreaterThan(0);
      expect(cart.publishedAt).not.toBeNull();
      expect(cart.publishedAt!.getTime()).toBe(paidAt.getTime());
      expect(cart.expiresAt).not.toBeNull();
      expect(cart.expiresAt!.getTime()).toBe(paidAt.getTime() + durationDays! * DAY_MS);
      expect(cart.expiresAt!.getTime()).toBeGreaterThan(Date.now());

      // O evento ficou marcado como concluído (não só reservado).
      const event = await prisma.paymentEvent.findUniqueOrThrow({
        where: {
          provider_providerEventId: {
            provider: "mercadopago",
            providerEventId: NOTIFICATION_ID,
          },
        },
      });
      expect(event.orderId).toBe(orderId);
      expect(event.rawStatus).toBe("approved");
      expect(event.processedAt).not.toBeNull();

      // --- Reentrega: exatamente a mesma notificação, byte por byte ---
      const second = await deliverNotification();

      expect(second.res.status).toBe(200);
      expect(second.outcome).toBe("duplicate");

      // A rota sempre reconsulta o provedor antes de decidir — a dedup é do
      // domínio, não do transporte.
      expect(fetchedIds).toEqual([PAYMENT_ID, PAYMENT_ID]);

      const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(orderAfter.status).toBe("PAID");
      expect(orderAfter.paidAt).not.toBeNull();
      expect(orderAfter.paidAt!.getTime()).toBe(paidAt.getTime());

      const cartAfter = await prisma.cart.findUniqueOrThrow({ where: { id: order.cartId } });
      expect(cartAfter.status).toBe("PUBLISHED");
      expect(cartAfter.slug).toBe(slug);
      // Nenhuma segunda publicação: a linha nem sequer foi tocada.
      expect(cartAfter.updatedAt.getTime()).toBe(cartUpdatedAt.getTime());

      const deliveriesAfter = await prisma.emailDelivery.findMany({ where: { orderId } });
      expect(deliveriesAfter).toHaveLength(1);
      expect(deliveriesAfter[0].id).toBe(emailDeliveryId);
      expect(deliveriesAfter[0].status).toBe("SENT");
      expect(deliveriesAfter[0].attempts).toBe(1);

      const events = await prisma.paymentEvent.findMany({
        where: { provider: "mercadopago", providerEventId: NOTIFICATION_ID },
      });
      expect(events).toHaveLength(1);

      // A carta pública continua a mesma, servida pelo mesmo slug.
      const publicAfter = await cartService.getPublicCart(slug);
      expect(publicAfter.state).toBe("ok");
    });
  },
);
