/**
 * Testes de INTEGRAÇÃO da exclusão mútua entre Pix e cartão, e do tratamento
 * correto de Pix vencido (banco real, provedor falso — nenhuma chamada ao
 * Mercado Pago).
 *
 *   RUN_DB_TESTS=true pnpm test
 *
 * Cobrem a correção de fechamento (task 013, seção 8) descoberta em
 * auditoria: as reservas de Pix (`pix*`) e cartão (`card*`) vivem em colunas
 * próprias e por isso nunca se enxergavam — nada impedia que as duas fossem
 * reivindicadas ao mesmo tempo para o mesmo pedido, cada uma cega ao estado
 * da outra, e um Pix vencido era reapresentado como se ainda fosse pagável
 * para sempre. Ver `isCardBusy`/`isPixBusy` e seus espelhos `cardBusyWhere`/
 * `pixBusyWhere` em `orderService.ts`.
 *
 * O retry do MESMO método (cartão após recusa, cartão concorrente consigo
 * mesmo, Pix concorrente consigo mesmo) já é coberto por
 * `cardAttempt.integration.test.ts` e pelas suítes de Pix em
 * `phase3.integration.test.ts` — reexecutadas sem nenhuma alteração junto
 * com esta correção (seguem 10/10 e verdes) para confirmar que nada dessa
 * proteção pré-existente regrediu.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;
const DB_TIMEOUT = 60_000;
const RUN_ID = randomUUID().slice(0, 8);

interface ProviderCall {
  method: "PIX" | "CARD";
  idempotencyKey?: string;
  cardToken?: string;
}

interface PixResult {
  providerPaymentId: string;
  status: "pending" | "paid" | "failed";
  pix: { qrCode: string; qrCodeBase64: string; expiresAt: string | null };
}

interface CardResult {
  providerPaymentId: string;
  status: "pending" | "paid" | "failed";
  statusDetail?: string;
}

type PixBehaviour = (call: ProviderCall, n: number) => Promise<PixResult>;
type CardBehaviour = (call: ProviderCall, n: number) => Promise<CardResult>;

describe.skipIf(!RUN)(
  "Fase 3 — exclusão mútua entre Pix e cartão (correção de fechamento, integração)",
  { timeout: DB_TIMEOUT },
  () => {
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
     * Monta um pedido real com um provedor falso que responde Pix e cartão de
     * forma independente — é o que permite testar as duas pontas da exclusão
     * mútua sem tocar no Mercado Pago.
     */
    async function setup(label: string, pixBehaviour: PixBehaviour, cardBehaviour: CardBehaviour) {
      const calls: ProviderCall[] = [];
      let pixN = 0;
      let cardN = 0;

      vi.doMock("@/server/payment", async (importOriginal) => {
        const actual = await importOriginal<typeof import("@/server/payment")>();
        return {
          ...actual,
          getPaymentProvider: () => ({
            name: "mercadopago",
            async createPayment(input: {
              method: "PIX" | "CARD" | "MOCK";
              idempotencyKey?: string;
              card?: { token: string };
            }) {
              if (input.method === "PIX") {
                pixN += 1;
                const call: ProviderCall = { method: "PIX", idempotencyKey: input.idempotencyKey };
                calls.push(call);
                return pixBehaviour(call, pixN);
              }
              cardN += 1;
              const call: ProviderCall = {
                method: "CARD",
                idempotencyKey: input.idempotencyKey,
                cardToken: input.card?.token,
              };
              calls.push(call);
              return cardBehaviour(call, cardN);
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
        message: "Mensagem de teste de exclusão mútua",
        senderName: "Testador",
      });
      cartIdsToClean.push(cart.id);

      const order = await orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `exclusividade.${label}.${RUN_ID}@example.com`.replace(/\s+/g, ""),
        acceptTerms: true,
      });

      return { order, editToken, calls };
    }

    const cartao = (token: string) => ({ token, installments: 1, paymentMethodId: "visa" });

    const pixSucesso =
      (prefix: string): PixBehaviour =>
      async (_c, n) => ({
        providerPaymentId: `mp_${prefix}_${n}_${RUN_ID}`,
        status: "pending" as const,
        pix: {
          qrCode: `qr-${prefix}-${n}-${RUN_ID}`,
          qrCodeBase64: `qrb64-${prefix}-${n}-${RUN_ID}`,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });

    const cartaoSucesso =
      (prefix: string): CardBehaviour =>
      async (_c, n) => ({
        providerPaymentId: `mp_${prefix}_${n}_${RUN_ID}`,
        status: "pending" as const,
      });

    // --- 1. Pix vencido não é reutilizado -----------------------------------

    it("Pix vencido não é reutilizado: retorna QR novo, chave nova, nunca o QR antigo", async () => {
      const { order, editToken, calls } = await setup(
        "pix-vencido",
        pixSucesso("pix_vencido"),
        cartaoSucesso("nao-usado"),
      );

      const primeiro = await orderService.createPixPaymentAttempt(order.id, editToken);
      const chavePrimeira = calls[0]!.idempotencyKey;
      expect(primeiro.pix.qrCode).toBe(`qr-pix_vencido-1-${RUN_ID}`);

      // Simula o tempo passando: o Pix da primeira tentativa venceu.
      await prisma.order.updateMany({
        where: { id: order.id },
        data: { pixExpiresAt: new Date(Date.now() - 60_000) },
      });

      const segundo = await orderService.createPixPaymentAttempt(order.id, editToken);

      // Gerou um Pix NOVO — não reaproveitou o vencido.
      expect(calls.filter((c) => c.method === "PIX")).toHaveLength(2);
      expect(segundo.pix.qrCode).toBe(`qr-pix_vencido-2-${RUN_ID}`);
      expect(segundo.pix.qrCode).not.toBe(primeiro.pix.qrCode);
      expect(calls[1]!.idempotencyKey).not.toBe(chavePrimeira);

      const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(final.pixQrCode).toBe(`qr-pix_vencido-2-${RUN_ID}`);
      // Resolvido de novo com sucesso: a chave da tentativa nova já foi
      // descartada, como qualquer criação de Pix bem-sucedida.
      expect(final.pixIdempotencyKey).toBeNull();
    });

    // --- 2. Pix vivo bloqueia cartão -----------------------------------------

    it("Pix vivo e ainda pagável bloqueia a criação de cartão, sem chamar o provedor", async () => {
      const { order, editToken, calls } = await setup(
        "pix-vivo-bloqueia-cartao",
        pixSucesso("pix_vivo"),
        cartaoSucesso("bloqueado"),
      );

      await orderService.createPixPaymentAttempt(order.id, editToken);
      expect(calls.filter((c) => c.method === "PIX")).toHaveLength(1);

      await expect(
        orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-tentativa")),
      ).rejects.toMatchObject({ code: "conflict" });

      expect(calls.filter((c) => c.method === "CARD")).toHaveLength(0);
    });

    // --- 3. Cartão vivo ou ambíguo bloqueia Pix ------------------------------

    it("cartão confirmado aguardando webhook bloqueia a criação de Pix, sem chamar o provedor", async () => {
      const { order, editToken, calls } = await setup(
        "cartao-vivo-bloqueia-pix",
        pixSucesso("pix-bloqueado"),
        cartaoSucesso("cartao_vivo"),
      );

      await orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-1"));
      expect(calls.filter((c) => c.method === "CARD")).toHaveLength(1);

      await expect(orderService.createPixPaymentAttempt(order.id, editToken)).rejects.toMatchObject({
        code: "conflict",
      });

      expect(calls.filter((c) => c.method === "PIX")).toHaveLength(0);
    });

    it("reserva de cartão em andamento (ambígua) bloqueia a criação de Pix, sem chamar o provedor", async () => {
      const { order, editToken, calls } = await setup(
        "cartao-ambiguo-bloqueia-pix",
        pixSucesso("pix-bloqueado-amb"),
        cartaoSucesso("nao-chamado"),
      );

      // Simula uma tentativa de cartão em voo: reservada agora, provedor
      // ainda não respondeu — o mesmo estado que uma falha ambígua preserva
      // deliberadamente (ver `createCardPaymentAttempt`, catch de erro não-4xx).
      await prisma.order.updateMany({
        where: { id: order.id },
        data: {
          cardClaimedAt: new Date(),
          cardIdempotencyKey: "chave-em-voo",
          cardTokenFingerprint: "fingerprint-em-voo",
        },
      });

      await expect(orderService.createPixPaymentAttempt(order.id, editToken)).rejects.toMatchObject({
        code: "conflict",
      });

      expect(calls.filter((c) => c.method === "PIX")).toHaveLength(0);
      expect(calls.filter((c) => c.method === "CARD")).toHaveLength(0);
    });

    it("cartão ambíguo ENVELHECIDO (além do TTL) continua bloqueando a criação de Pix", async () => {
      // Correção de uma janela residual de cobrança dupla: o TTL de
      // CARD_CLAIM_STALE_MS nunca significou que a cobrança deixou de
      // existir no provedor — só que a MESMA tentativa pode ser
      // reapresentada com a MESMA chave. Uma ambiguidade genuína (falha de
      // rede real, não simulação de campos) precisa continuar bloqueando o
      // Pix mesmo depois de 90s.
      let falhou = false;
      const { order, editToken, calls } = await setup(
        "cartao-ambiguo-envelhecido-bloqueia-pix",
        pixSucesso("pix-nao-deveria-ser-criado"),
        async (_c, n) => {
          if (!falhou) {
            falhou = true;
            throw new Error("socket hang up"); // ambíguo: pode ter criado a cobrança
          }
          return { providerPaymentId: `mp_nao_deveria_${n}_${RUN_ID}`, status: "pending" as const };
        },
      );

      await expect(
        orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-ambiguo")),
      ).rejects.toThrow(/socket hang up/);

      const apos = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(apos.cardClaimedAt).not.toBeNull();
      expect(apos.cardIdempotencyKey).not.toBeNull();
      expect(apos.cardTokenFingerprint).not.toBeNull();
      expect(apos.providerPaymentId).toBeNull();

      const chaveOriginal = apos.cardIdempotencyKey;
      const fingerprintOriginal = apos.cardTokenFingerprint;

      // Envelhece a reserva para além do TTL — a ambiguidade não desaparece
      // com o tempo (é isso que esta correção fixa).
      await prisma.order.updateMany({
        where: { id: order.id },
        data: { cardClaimedAt: new Date(Date.now() - 120_000) },
      });

      await expect(orderService.createPixPaymentAttempt(order.id, editToken)).rejects.toMatchObject({
        code: "conflict",
      });

      // Nenhuma chamada Pix ao provedor; a única chamada continua sendo a
      // original de cartão.
      expect(calls.filter((c) => c.method === "PIX")).toHaveLength(0);
      expect(calls.filter((c) => c.method === "CARD")).toHaveLength(1);

      const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(final.cardIdempotencyKey).toBe(chaveOriginal);
      expect(final.cardTokenFingerprint).toBe(fingerprintOriginal);
      expect(final.providerPaymentId).toBeNull();
      expect(final.status).toBe("PENDING");
    });

    // --- 4. Corrida limpa: exatamente uma chamada total (+ 5: nada sobrescrito) --

    it(
      "Pix e cartão concorrentes num pedido limpo resultam em exatamente uma chamada ao " +
        "provedor, e a perdedora nunca sobrescreve providerPaymentId/paymentMethod/chave da vencedora",
      async () => {
        const { order, editToken, calls } = await setup(
          "corrida-limpa",
          pixSucesso("corrida_pix"),
          cartaoSucesso("corrida_card"),
        );

        const settled = await Promise.allSettled([
          orderService.createPixPaymentAttempt(order.id, editToken),
          orderService.createCardPaymentAttempt(order.id, editToken, cartao("tok-corrida")),
        ]);

        // O invariante central: uma ação do comprador nunca vira duas
        // cobranças, e nunca uma chamada para CADA método.
        expect(calls.length).toBe(1);

        const fulfilled = settled.filter((r) => r.status === "fulfilled");
        const rejected = settled.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
        expect(fulfilled.length).toBe(1);
        for (const reason of rejected) {
          expect(reason).toMatchObject({ code: "conflict" });
        }

        const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
        const vencedor = calls[0]!.method;
        if (vencedor === "PIX") {
          expect(final.paymentMethod).toBe("PIX");
          expect(final.providerPaymentId).toBe(`mp_corrida_pix_1_${RUN_ID}`);
          expect(final.pixQrCode).not.toBeNull();
          // A perdedora (cartão) nunca chegou a escrever nada no pedido.
          expect(final.cardClaimedAt).toBeNull();
          expect(final.cardIdempotencyKey).toBeNull();
          expect(final.cardTokenFingerprint).toBeNull();
        } else {
          expect(final.paymentMethod).toBe("CARD");
          expect(final.providerPaymentId).toBe(`mp_corrida_card_1_${RUN_ID}`);
          // A perdedora (Pix) nunca chegou a escrever nada no pedido.
          expect(final.pixQrCode).toBeNull();
          expect(final.pixIdempotencyKey).toBeNull();
          expect(final.pixClaimedAt).toBeNull();
        }
      },
    );

    // --- 6. Pix vencido permite cartão (regra segura) ------------------------

    it("Pix vencido permite cartão, por não poder mais ser pago", async () => {
      const { order, editToken, calls } = await setup(
        "pix-vencido-permite-cartao",
        pixSucesso("pix_venc_libera"),
        cartaoSucesso("cartao_apos_pix_vencido"),
      );

      await orderService.createPixPaymentAttempt(order.id, editToken);
      await prisma.order.updateMany({
        where: { id: order.id },
        data: { pixExpiresAt: new Date(Date.now() - 60_000) },
      });

      const resultadoCartao = await orderService.createCardPaymentAttempt(
        order.id,
        editToken,
        cartao("tok-pos-vencimento"),
      );
      expect(resultadoCartao.status).toBe("pending");
      expect(calls.filter((c) => c.method === "CARD")).toHaveLength(1);
    });

    // --- 7. Depois de cartão recusado, novo Pix pode ser criado --------------

    it("depois de cartão recusado, um novo Pix pode ser criado quando não há outro Pix vivo", async () => {
      const { order, editToken, calls } = await setup(
        "cartao-recusado-libera-pix",
        pixSucesso("pix_apos_recusa"),
        async (_c, n) => ({
          providerPaymentId: `mp_recusa_libera_${n}_${RUN_ID}`,
          status: "failed" as const,
          statusDetail: "cc_rejected_insufficient_amount",
        }),
      );

      const resultadoCartao = await orderService.createCardPaymentAttempt(
        order.id,
        editToken,
        cartao("tok-recusado"),
      );
      expect(resultadoCartao.status).toBe("failed");

      const aposRecusa = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(aposRecusa.status).toBe("FAILED");

      const resultadoPix = await orderService.createPixPaymentAttempt(order.id, editToken);
      expect(resultadoPix.pix.qrCode).toBe(`qr-pix_apos_recusa-1-${RUN_ID}`);
      expect(calls.filter((c) => c.method === "PIX")).toHaveLength(1);

      const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(final.paymentMethod).toBe("PIX");
      expect(final.status).toBe("PENDING");
    });
  },
);
