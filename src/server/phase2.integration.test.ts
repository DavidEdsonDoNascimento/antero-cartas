/**
 * Testes de INTEGRAÇÃO com banco real (Fase 2).
 *
 * Ficam desligados por padrão — só rodam com opt-in explícito, para nunca
 * atingir um banco por acidente (muito menos um de produção):
 *
 *   RUN_DB_TESTS=true npm test
 *
 * Use um banco de TESTE (ex.: um branch/projeto separado no Neon/Supabase),
 * nunca o banco de desenvolvimento ou produção. Os dados criados aqui são
 * removidos ao final de cada bloco.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;

// Banco remoto (ex.: Supabase) tem latência de rede por query; cada teste faz
// vários round-trips. Timeout generoso para não falhar por latência (não bug).
const DB_TIMEOUT = 60_000;

describe.skipIf(!RUN)("Fase 2 — integração com banco real", { timeout: DB_TIMEOUT }, () => {
  let prisma: typeof import("@/lib/db").prisma;
  let cartService: typeof import("@/server/cartService");
  let orderService: typeof import("@/server/orderService");
  let getStorage: typeof import("@/server/storage").getStorage;

  const cartIdsToClean: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    cartService = await import("@/server/cartService");
    orderService = await import("@/server/orderService");
    ({ getStorage } = await import("@/server/storage"));
  });

  afterAll(async () => {
    for (const cartId of cartIdsToClean) {
      const media = await prisma.cartMedia.findMany({ where: { cartId } });
      for (const m of media) {
        await getStorage()
          .delete(m.storageKey)
          .catch(() => {});
      }
      await prisma.order.deleteMany({ where: { cartId } });
      await prisma.cart.deleteMany({ where: { id: cartId } });
    }
    await prisma.$disconnect();
  }, DB_TIMEOUT);

  function jpegBytes(): Buffer {
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
  }

  it("cria rascunho, atualiza com token válido e rejeita token inválido", async () => {
    const { cart, editToken } = await cartService.createDraft();
    cartIdsToClean.push(cart.id);
    expect(cart.status).toBe("DRAFT");

    const updated = await cartService.updateDraft(cart.id, editToken, { title: "Para você" });
    expect(updated.title).toBe("Para você");

    await expect(
      cartService.updateDraft(cart.id, "token-invalido", { title: "Hack" }),
    ).rejects.toMatchObject({ code: "unauthorized" });

    await expect(cartService.updateDraft(cart.id, null, { title: "X" })).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("respeita o máximo de fotos e persiste a reordenação/capa", async () => {
    const { cart, editToken } = await cartService.createDraft();
    cartIdsToClean.push(cart.id);

    let current = cart;
    for (let i = 0; i < 6; i++) {
      current = await cartService.addMedia(cart.id, editToken, {
        body: jpegBytes(),
        declaredType: "image/jpeg",
      });
    }
    expect(current.media).toHaveLength(6);

    await expect(
      cartService.addMedia(cart.id, editToken, { body: jpegBytes(), declaredType: "image/jpeg" }),
    ).rejects.toMatchObject({ code: "limit_reached" });

    const ids = current.media.map((m) => m.id);
    const reordered = [ids[2], ids[0], ids[1], ids[3], ids[4], ids[5]];
    const afterReorder = await cartService.reorderMedia(cart.id, editToken, reordered);
    expect(afterReorder.media.map((m) => m.id)).toEqual(reordered);
    expect(afterReorder.media.map((m) => m.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("persiste a música selecionada e permite trocar/remover", async () => {
    const { cart, editToken } = await cartService.createDraft();
    cartIdsToClean.push(cart.id);

    const withMusic = await cartService.updateDraft(cart.id, editToken, {
      music: {
        videoId: "2Vv-BfVoq4g",
        youtubeUrl: "https://www.youtube.com/watch?v=2Vv-BfVoq4g",
        title: "Perfect",
        channelTitle: "Ed Sheeran",
        source: "search",
      },
    });
    expect(withMusic.music?.videoId).toBe("2Vv-BfVoq4g");

    const removed = await cartService.updateDraft(cart.id, editToken, { music: null });
    expect(removed.music).toBeNull();
  });

  it("calcula o preço no servidor (ignora valor adulterado pelo cliente)", async () => {
    const { cart, editToken } = await cartService.createDraft({
      recipientType: "namorada",
      title: "Título",
      message: "Mensagem",
      senderName: "Remetente",
    });
    cartIdsToClean.push(cart.id);

    const { getPlan } = await import("@/config/plans");
    const realPrice = getPlan("LIMITED").priceCents;

    const order = await orderService.createOrder(editToken, {
      cartId: cart.id,
      planType: "LIMITED",
      customerName: "Ana Teste",
      customerEmail: "ana.teste@example.com",
      acceptTerms: true,
      // @ts-expect-error simula payload malicioso tentando forçar outro valor
      amount: 1,
    });

    expect(order.amount).toBe(realPrice);
    expect(order.amount).not.toBe(1);
  });

  it("fluxo completo: pedido -> confirmação mock idempotente -> publicação -> consulta pública -> e-mail único", async () => {
    const { cart, editToken } = await cartService.createDraft({
      recipientType: "amigo",
      title: "Fluxo completo",
      message: "Mensagem de teste de integração",
      senderName: "Testador",
    });
    cartIdsToClean.push(cart.id);

    const order = await orderService.createOrder(editToken, {
      cartId: cart.id,
      planType: "PERMANENT",
      customerName: "Comprador Teste",
      customerEmail: "comprador.teste@example.com",
      acceptTerms: true,
    });
    expect(order.status).toBe("PENDING");

    const first = await orderService.mockConfirmOrder(order.id, "success");
    expect(first.order.status).toBe("PAID");
    expect(first.cart?.status).toBe("PUBLISHED");
    expect(first.cart?.slug).toBeTruthy();
    expect(first.publicUrl).toContain(first.cart!.slug);

    // Idempotência: confirmar de novo não duplica nem muda o slug.
    const second = await orderService.mockConfirmOrder(order.id, "success");
    expect(second.cart?.slug).toBe(first.cart?.slug);
    expect(second.order.paidAt).toBe(first.order.paidAt);

    // Consulta pública por slug.
    const publicResult = await cartService.getPublicCart(first.cart!.slug!);
    expect(publicResult.state).toBe("ok");

    // Plano PERMANENT não expira.
    expect(first.cart?.expiresAt).toBeNull();

    // E-mail (outbox) criado exatamente uma vez, mesmo com confirmação repetida.
    const deliveries = await prisma.emailDelivery.findMany({ where: { orderId: order.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe("SENT");
  });

  it("carta expirada não é retornada pela rota pública", async () => {
    const { cart, editToken } = await cartService.createDraft({
      recipientType: "mae",
      title: "Expira",
      message: "Vai expirar",
      senderName: "Testador",
    });
    cartIdsToClean.push(cart.id);

    const order = await orderService.createOrder(editToken, {
      cartId: cart.id,
      planType: "LIMITED",
      customerName: "Comprador",
      customerEmail: "comprador2.teste@example.com",
      acceptTerms: true,
    });
    const result = await orderService.mockConfirmOrder(order.id, "success");
    const slug = result.cart!.slug!;

    // Força a expiração diretamente no banco (simula o tempo passando).
    await prisma.cart.update({ where: { id: cart.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const publicResult = await cartService.getPublicCart(slug);
    expect(publicResult.state).toBe("expired");
  });

  it("confirmação mock de falha/expiração não publica a carta", async () => {
    const { cart, editToken } = await cartService.createDraft({
      recipientType: "pai",
      title: "Falha",
      message: "Vai falhar",
      senderName: "Testador",
    });
    cartIdsToClean.push(cart.id);

    const order = await orderService.createOrder(editToken, {
      cartId: cart.id,
      planType: "LIMITED",
      customerName: "Comprador",
      customerEmail: "comprador3.teste@example.com",
      acceptTerms: true,
    });
    const failed = await orderService.mockConfirmOrder(order.id, "fail");
    expect(failed.order.status).toBe("FAILED");
    expect(failed.cart).toBeNull();

    const stillDraft = await prisma.cart.findUnique({ where: { id: cart.id } });
    expect(stillDraft?.status).not.toBe("PUBLISHED");
  });
});
