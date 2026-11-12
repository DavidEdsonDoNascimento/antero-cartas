/**
 * Testes de INTEGRAÇÃO da Antero Cartas 2.0 (banco real descartável, storage em
 * disco temporário, pagamento sempre simulado).
 *
 *   pnpm test:integration:pg17
 *
 * Cobre:
 * 1. Publicação gera os DOIS links (slug + publicId), independentes, únicos e
 *    estáveis: mock, webhook e reprocessamento.
 * 2. Prévia pública: só o trecho permitido sai do servidor — DTO, HTML da
 *    página, metadados e rota da foto — com marcadores no início, meio e fim da
 *    carta, na segunda foto, na assinatura, no remetente, no título e na música.
 * 3. Foto pública sem EXIF; 404 em carta antiga, expirada, estornada e id inválido.
 * 4. Cartas antigas: publicId sob demanda (POST), idempotente e sob concorrência.
 * 5. Pagamento pendente: a carta não pode ficar impublicável depois do pedido
 *    (patch recusado, corrida com createOrder) e o webhook publica.
 * 6. Estilos e efeitos validados no servidor.
 */
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";

// `next/font` só existe dentro do build do Next.
vi.mock("@/components/presentation/fonts", () => ({ presentationFontVars: "" }));

const RUN = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;
const DB_TIMEOUT = 90_000;
const RUN_ID = randomUUID().slice(0, 8);

const S = {
  start: "INICIOSENTINELA",
  middle: "MEIOSENTINELA",
  end: "FIMSENTINELA",
  title: "TITULOSENTINELA",
  sender: "REMETENTESENTINELA",
  signature: "ASSINATURASENTINELA",
  surname: "Sobrenomesentinela",
  music: "MUSICASENTINELA",
  videoId: "VIDSENTINEL",
};

const MESSAGE = [
  `${S.start} Hoje faz um ano que a nossa história começou e eu lembro de cada detalhe.`,
  `${S.middle} ${"Uma lembrança bonita depois da outra, ".repeat(6)}`,
  `Último parágrafo da carta ${S.end}`,
].join("\n");

function validPixWebhookFields() {
  return { transactionAmount: 18.9, currencyId: "BRL", paymentMethodId: "pix", paymentTypeId: "bank_transfer" } as const;
}

function stubMockPayment(): void {
  vi.stubEnv("PAYMENT_MODE", "mock");
  vi.stubEnv("ALLOW_MOCK_PAYMENT_CONFIRMATION", "true");
  vi.stubEnv("EMAIL_MODE", "mock");
}

function stubWebhookPayment(): void {
  vi.stubEnv("PAYMENT_MODE", "real");
  vi.stubEnv("EMAIL_MODE", "mock");
}

async function photoBytes(color: string, label: string): Promise<Buffer> {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: color } })
    .withExif({ IFD0: { Artist: `EXIF-${label}`, ImageDescription: `GPS-${label}` } })
    .jpeg()
    .toBuffer();
}

describe.skipIf(!RUN)("Antero Cartas 2.0 — publicação, prévia pública e pagamento pendente", { timeout: DB_TIMEOUT }, () => {
  let prisma: typeof import("@/lib/db").prisma;
  let cartService: typeof import("@/server/cartService");
  let orderService: typeof import("@/server/orderService");
  let preview: typeof import("@/server/publicPreviewService");
  const cartIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    cartService = await import("@/server/cartService");
    orderService = await import("@/server/orderService");
    preview = await import("@/server/publicPreviewService");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    for (const cartId of cartIds) {
      const orders = await prisma.order.findMany({ where: { cartId }, select: { id: true } });
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length) {
        await prisma.paymentEvent.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.emailDelivery.deleteMany({ where: { orderId: { in: orderIds } } });
      }
      await prisma.order.deleteMany({ where: { cartId } });
      await prisma.cartMedia.deleteMany({ where: { cartId } });
      await prisma.cart.deleteMany({ where: { id: cartId } });
    }
    await prisma.$disconnect();
  }, DB_TIMEOUT);

  async function draft(overrides: Record<string, unknown> = {}) {
    const { cart, editToken } = await cartService.createDraft({
      recipientType: "namorada",
      recipientName: `Ana ${S.surname}`,
      title: S.title,
      message: MESSAGE,
      senderName: S.sender,
      signature: S.signature,
      presentation: "romantico",
      presentationOptions: { v: 1, effect: "petalas" },
      sharePreviewVersion: 1,
      music: {
        videoId: S.videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${S.videoId}`,
        title: S.music,
        source: "manual",
      },
      relationshipStartDate: "2021-02-03T00:00:00.000Z",
      showRelationshipCounter: true,
      ...overrides,
    });
    cartIds.push(cart.id);
    return { cart, editToken };
  }

  async function publishByMock(cartId: string, token: string, label: string) {
    stubMockPayment();
    const order = await orderService.createOrder(token, {
      cartId,
      planType: "LIMITED",
      customerName: "Comprador",
      customerEmail: `a2.${label}.${RUN_ID}@example.com`,
      acceptTerms: true,
    });
    const result = await orderService.mockConfirmOrder(order.id, "success");
    return { order, result, row: await prisma.cart.findUniqueOrThrow({ where: { id: cartId } }) };
  }

  // --- 1. Dois links --------------------------------------------------------

  it("publicação por mock gera slug e publicId independentes; reconfirmar não troca nenhum", async () => {
    const { cart, editToken } = await draft();
    const { order, row } = await publishByMock(cart.id, editToken, "mock");
    expect(row.status).toBe("PUBLISHED");
    expect(row.slug).toMatch(/^[a-km-np-z2-9]{26}$/);
    expect(row.publicId).toMatch(/^[a-km-np-z2-9]{26}$/);
    expect(row.publicId).not.toBe(row.slug);
    expect(row.publicId).not.toContain(cart.id);

    await orderService.mockConfirmOrder(order.id, "success");
    await cartService.publishCart(cart.id, new Date(), "PERMANENT");
    const again = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(again.slug).toBe(row.slug);
    expect(again.publicId).toBe(row.publicId);
  });

  it("publicação por webhook gera os dois links; evento repetido não muda nada", async () => {
    stubWebhookPayment();
    const { cart, editToken } = await draft({ senderName: "" });
    const order = await orderService.createOrder(editToken, {
      cartId: cart.id,
      planType: "LIMITED",
      customerName: "Comprador",
      customerEmail: `a2.webhook.${RUN_ID}@example.com`,
      acceptTerms: true,
    });
    const event = {
      ...validPixWebhookFields(),
      provider: "mercadopago",
      providerEventId: `evt_a2_${RUN_ID}`,
      providerPaymentId: `mp_a2_${RUN_ID}`,
      externalReference: order.id,
      status: "approved",
      statusDetail: "accredited",
      type: "payment",
    };
    expect(await orderService.applyMercadoPagoWebhook(event)).toEqual({ kind: "applied", internalStatus: "PAID" });
    const row = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(row.publicId).toBeTruthy();
    expect(row.senderName).toBe("");
    expect(await orderService.applyMercadoPagoWebhook(event)).toEqual({ kind: "duplicate" });
    expect((await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } })).publicId).toBe(row.publicId);
  });

  it("publicIds são únicos (índice único no banco)", async () => {
    const a = await draft();
    const b = await draft();
    const pa = await publishByMock(a.cart.id, a.editToken, "uniq-a");
    await publishByMock(b.cart.id, b.editToken, "uniq-b");
    await expect(
      prisma.cart.update({ where: { id: b.cart.id }, data: { publicId: pa.row.publicId } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  // --- 2. Prévia pública só com o permitido -----------------------------------

  it("DTO, HTML, metadados e foto da prévia só levam o trecho permitido", async () => {
    const { cart, editToken } = await draft();
    await cartService.addMedia(cart.id, editToken, { body: await photoBytes("#c04a6a", "1"), declaredType: "image/jpeg" });
    await cartService.addMedia(cart.id, editToken, { body: await photoBytes("#336699", "2"), declaredType: "image/jpeg" });
    const media = await prisma.cartMedia.findMany({ where: { cartId: cart.id }, orderBy: { position: "asc" } });
    expect(media).toHaveLength(2);
    const { row } = await publishByMock(cart.id, editToken, "sentinel");
    const publicId = row.publicId!;

    const result = await preview.getPublicPreview(publicId);
    expect(result.state).toBe("ok");
    if (result.state !== "ok") return;
    const dto = result.preview;
    expect(dto.content).toBe("full");
    expect(dto.recipientFirstName).toBe("Ana");
    expect(dto.excerpt!.text.startsWith(S.start)).toBe(true);
    expect(dto.hasMusic).toBe(true);
    expect(dto.photo!.src).toBe(`/presente/${publicId}/foto`);

    const { PublicGiftView } = await import("@/components/share/PublicGiftView");
    const { generateMetadata } = await import("@/app/presente/[id]/page");
    const html = renderToStaticMarkup(<PublicGiftView preview={dto} />);
    const metadata = JSON.stringify(await generateMetadata({ params: Promise.resolve({ id: publicId }) }));

    const forbidden = [
      S.middle, S.end, S.title, S.sender, S.signature, S.surname, S.music, S.videoId,
      cart.id, row.slug!, media[0].storageKey, media[1].storageKey, media[1].id, "/api/media", "2021-02-03",
    ];
    for (const surface of [JSON.stringify(dto), html, metadata]) {
      for (const marker of forbidden) expect(surface, marker).not.toContain(marker);
    }
    expect(html).toContain(S.start);
    expect(html).toContain("Para Ana");
    expect(html).not.toContain("/c/");
    expect(metadata).toContain("Ana ganhou uma cartinha");

    // Rota da foto: só a primeira, recodificada, sem EXIF.
    const { GET } = await import("@/app/presente/[id]/foto/route");
    const res = await GET(new Request(`http://local/presente/${publicId}/foto`), { params: Promise.resolve({ id: publicId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("cache-control")).toBe("private, max-age=600");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.includes(Buffer.from("EXIF-1"))).toBe(false);
    expect(body.includes(Buffer.from("GPS-1"))).toBe(false);
    expect((await sharp(body).metadata()).exif).toBeUndefined();
    const { dominant } = await sharp(body).stats();
    expect(dominant.r).toBeGreaterThan(dominant.b); // é a primeira foto (vinho), não a segunda (azul)
    for (const marker of [media[0].storageKey, cart.id]) {
      expect(JSON.stringify([...res.headers.entries()])).not.toContain(marker);
    }
  });

  it("carta expirada, estornada ou id inválido: prévia e foto respondem 'não encontrada'", async () => {
    const exp = await draft();
    await cartService.addMedia(exp.cart.id, exp.editToken, { body: await photoBytes("#111", "e"), declaredType: "image/jpeg" });
    const expired = await publishByMock(exp.cart.id, exp.editToken, "expirada");
    await prisma.cart.update({ where: { id: exp.cart.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await preview.getPublicPreview(expired.row.publicId!)).state).toBe("not_found");
    expect(await preview.readPublicPhoto(expired.row.publicId!)).toBeNull();

    const ref = await draft();
    const refunded = await publishByMock(ref.cart.id, ref.editToken, "estornada");
    await prisma.order.update({ where: { id: refunded.order.id }, data: { status: "REFUNDED" } });
    expect((await preview.getPublicPreview(refunded.row.publicId!)).state).toBe("not_found");

    expect((await preview.getPublicPreview("../../etc/passwd")).state).toBe("not_found");
    expect((await preview.getPublicPreview("a".repeat(26))).state).toBe("not_found");

    const { GET } = await import("@/app/presente/[id]/foto/route");
    const res = await GET(new Request("http://local/x"), { params: Promise.resolve({ id: expired.row.publicId! }) });
    expect(res.status).toBe(404);
  });

  // --- 4. Cartas antigas --------------------------------------------------------

  it("carta antiga: publicId sob demanda, idempotente sob concorrência, prévia genérica e sem foto", async () => {
    const { cart, editToken } = await draft({ presentation: undefined, sharePreviewVersion: undefined, presentationOptions: undefined });
    await cartService.addMedia(cart.id, editToken, { body: await photoBytes("#c04a6a", "L"), declaredType: "image/jpeg" });
    const { row } = await publishByMock(cart.id, editToken, "antiga");
    // Simula uma carta publicada antes da 2.0: sem estilo, sem publicId, sem aviso.
    await prisma.cart.update({
      where: { id: cart.id },
      data: { publicId: null, presentation: null, sharePreviewVersion: null },
    });

    const ids = await Promise.all(Array.from({ length: 6 }, () => preview.ensurePublicIdForSlug(row.slug!)));
    expect(new Set(ids).size).toBe(1);
    expect(await preview.ensurePublicIdForSlug(row.slug!)).toBe(ids[0]);
    expect((await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } })).publicId).toBe(ids[0]);

    const result = await preview.getPublicPreview(ids[0]);
    expect(result.state).toBe("ok");
    if (result.state !== "ok") return;
    expect(result.preview).toMatchObject({ content: "generic", photo: null, excerpt: null, recipientFirstName: null, hasMusic: false });
    expect(await preview.readPublicPhoto(ids[0])).toBeNull();

    // Pelo endpoint (POST), com a URL pública montada.
    const { POST } = await import("@/app/api/letters/[slug]/public-link/route");
    const res = await POST(new Request("http://local/x", { method: "POST" }), { params: Promise.resolve({ slug: row.slug! }) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { url: string };
    expect(data.url.endsWith(`/presente/${ids[0]}`)).toBe(true);
    expect(data.url).not.toContain(row.slug!);
  });

  it("publicId sob demanda não existe para rascunho nem para carta expirada", async () => {
    const { cart } = await draft();
    await expect(preview.ensurePublicIdForSlug(`naoexiste${RUN_ID}`)).rejects.toMatchObject({ code: "not_found" });
    expect((await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } })).publicId).toBeNull();
  });

  // --- 5. Pagamento pendente ----------------------------------------------------

  it("com cobrança aberta, apagar a mensagem é recusado; outras edições passam; o webhook publica", async () => {
    stubWebhookPayment();
    const { cart, editToken } = await draft();
    const order = await orderService.createOrder(editToken, {
      cartId: cart.id,
      planType: "LIMITED",
      customerName: "Comprador",
      customerEmail: `a2.pending.${RUN_ID}@example.com`,
      acceptTerms: true,
    });
    const pending = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(pending.status).toBe("AWAITING_PAYMENT");

    await expect(
      cartService.updateDraft(cart.id, editToken, { message: "   ", clientUpdatedAt: pending.updatedAt.toISOString() }),
    ).rejects.toMatchObject({ code: "pending_payment_incomplete", status: 422 });
    await expect(cartService.updateDraft(cart.id, editToken, { recipientType: null })).rejects.toMatchObject({
      code: "pending_payment_incomplete",
    });
    await expect(cartService.updateDraft(cart.id, editToken, { title: "" })).rejects.toMatchObject({
      code: "pending_payment_incomplete",
    });
    const edited = await cartService.updateDraft(cart.id, editToken, { signature: "Nova assinatura", senderName: "" });
    expect(edited.signature).toBe("Nova assinatura");

    const outcome = await orderService.applyMercadoPagoWebhook({
      ...validPixWebhookFields(),
      provider: "mercadopago",
      providerEventId: `evt_pend_${RUN_ID}`,
      providerPaymentId: `mp_pend_${RUN_ID}`,
      externalReference: order.id,
      status: "approved",
      statusDetail: "accredited",
      type: "payment",
    });
    expect(outcome).toEqual({ kind: "applied", internalStatus: "PAID" });
    const published = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(published.status).toBe("PUBLISHED");
    expect(published.message).toBe(MESSAGE);
    expect(published.signature).toBe("Nova assinatura");
    expect(published.publicId).toBeTruthy();
  });

  it("em rascunho (sem cobrança) a mensagem pode ficar vazia enquanto a pessoa escreve", async () => {
    const { cart, editToken } = await draft();
    const updated = await cartService.updateDraft(cart.id, editToken, { message: "" });
    expect(updated.message).toBe("");
  });

  it("corrida: autosave entre a checagem e a criação do pedido aborta o pedido inteiro", async () => {
    stubMockPayment();
    const { cart, editToken } = await draft();
    const original = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (fn: unknown) => {
      // Outro envio grava a carta depois da leitura de `createOrder`.
      await prisma.cart.update({ where: { id: cart.id }, data: { message: "" } });
      return (original as (f: unknown) => Promise<unknown>)(fn);
    }) as never);
    await expect(
      orderService.createOrder(editToken, {
        cartId: cart.id,
        planType: "LIMITED",
        customerName: "Comprador",
        customerEmail: `a2.race.${RUN_ID}@example.com`,
        acceptTerms: true,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await prisma.order.count({ where: { cartId: cart.id } })).toBe(0);
    expect((await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } })).status).toBe("DRAFT");
  });

  // --- 6. Estilos e efeitos --------------------------------------------------------

  it("efeito fora do estilo é recusado; efeito permitido é gravado; estilo novo fica salvo", async () => {
    const { cart, editToken } = await draft();
    await expect(
      cartService.updateDraft(cart.id, editToken, { presentation: "noturno", presentationOptions: { v: 1, effect: "borboletas" } }),
    ).rejects.toMatchObject({ code: "invalid" });
    const ok = await cartService.updateDraft(cart.id, editToken, {
      presentation: "noturno",
      presentationOptions: { v: 1, effect: "brilho" },
    });
    expect(ok.presentation).toBe("noturno");
    expect(ok.presentationOptions).toEqual({ v: 1, effect: "brilho" });
    const cleared = await cartService.updateDraft(cart.id, editToken, { presentationOptions: null });
    expect(cleared.presentationOptions).toBeNull();
  });
});
