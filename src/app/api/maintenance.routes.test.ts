import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";

/**
 * Modo de manutenção nas rotas reais (src/server/maintenance.ts).
 *
 * Os serviços de domínio e o cliente do Mercado Pago são substituídos por
 * mocks: o que se prova aqui é que, com MAINTENANCE_MODE=true, NENHUMA rota de
 * escrita chega a chamá-los — nada é gravado, nenhuma cobrança é criada, e o
 * webhook não confirma um processamento que não aconteceu.
 */

vi.mock("@/server/cartService", () => ({
  createDraft: vi.fn(),
  getCartForEdit: vi.fn(async () => ({ id: "c1" })),
  updateDraft: vi.fn(),
  addMedia: vi.fn(),
  removeMedia: vi.fn(),
  updateMediaFraming: vi.fn(),
  reorderMedia: vi.fn(),
}));
vi.mock("@/server/orderService", () => ({
  createOrder: vi.fn(),
  mockConfirmOrder: vi.fn(),
  createPixPaymentAttempt: vi.fn(),
  createCardPaymentAttempt: vi.fn(),
  applyMercadoPagoWebhook: vi.fn(async () => ({ kind: "applied", internalStatus: "PAID" })),
  getOrderResult: vi.fn(async () => ({ order: { id: "o1", status: "PENDING" }, cart: null, publicUrl: null, qrCodeDataUrl: null })),
}));
vi.mock("@/server/payment/mercadopago", () => ({
  fetchMercadoPagoPayment: vi.fn(async () => ({
    status: "approved",
    statusDetail: "accredited",
    externalReference: "o1",
    transactionAmount: 18.9,
    currencyId: "BRL",
    paymentMethodId: "pix",
    paymentTypeId: "bank_transfer",
  })),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const BASE = "https://cartas.anterosistemas.com.br";
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

function jsonReq(path: string, method: string, body: unknown = {}): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-cart-edit-token": "tok" },
    body: JSON.stringify(body),
  });
}

function uploadReq(): Request {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "a.jpg", { type: "image/jpeg" }));
  return new Request(`${BASE}/api/carts/c1/media`, {
    method: "POST",
    headers: { "x-cart-edit-token": "tok" },
    body: form,
  });
}

type Call = { name: string; run: () => Promise<Response> };

const writeCalls: Call[] = [
  { name: "POST /api/carts", run: async () => (await import("./carts/route")).POST(jsonReq("/api/carts", "POST")) },
  {
    name: "PATCH /api/carts/[id]",
    run: async () => (await import("./carts/[id]/route")).PATCH(jsonReq("/api/carts/c1", "PATCH", { title: "x" }), ctx({ id: "c1" })),
  },
  {
    name: "POST /api/carts/[id]/media (upload)",
    run: async () => (await import("./carts/[id]/media/route")).POST(uploadReq(), ctx({ id: "c1" })),
  },
  {
    name: "PATCH /api/carts/[id]/media/[mediaId] (enquadramento)",
    run: async () =>
      (await import("./carts/[id]/media/[mediaId]/route")).PATCH(
        jsonReq("/api/carts/c1/media/m1", "PATCH", { framing: null }),
        ctx({ id: "c1", mediaId: "m1" }),
      ),
  },
  {
    name: "DELETE /api/carts/[id]/media/[mediaId]",
    run: async () =>
      (await import("./carts/[id]/media/[mediaId]/route")).DELETE(
        jsonReq("/api/carts/c1/media/m1", "DELETE"),
        ctx({ id: "c1", mediaId: "m1" }),
      ),
  },
  {
    name: "POST /api/carts/[id]/media/reorder",
    run: async () =>
      (await import("./carts/[id]/media/reorder/route")).POST(
        jsonReq("/api/carts/c1/media/reorder", "POST", { order: ["m1"] }),
        ctx({ id: "c1" }),
      ),
  },
  {
    name: "POST /api/orders",
    run: async () =>
      (await import("./orders/route")).POST(
        jsonReq("/api/orders", "POST", { cartId: "c1", planType: "LIMITED", customerName: "A", customerEmail: "a@b.co" }),
      ),
  },
  {
    name: "POST /api/orders/[id]/mock-confirm",
    run: async () =>
      (await import("./orders/[id]/mock-confirm/route")).POST(jsonReq("/api/orders/o1/mock-confirm", "POST"), ctx({ id: "o1" })),
  },
  {
    name: "POST /api/orders/[id]/payments/pix",
    run: async () =>
      (await import("./orders/[id]/payments/pix/route")).POST(jsonReq("/api/orders/o1/payments/pix", "POST"), ctx({ id: "o1" })),
  },
  {
    name: "POST /api/orders/[id]/payments/card",
    run: async () =>
      (await import("./orders/[id]/payments/card/route")).POST(
        jsonReq("/api/orders/o1/payments/card", "POST", { token: "t", paymentMethodId: "visa", installments: 1 }),
        ctx({ id: "o1" }),
      ),
  },
];

async function domainMocks() {
  const cart = await import("@/server/cartService");
  const order = await import("@/server/orderService");
  const mp = await import("@/server/payment/mercadopago");
  return [
    cart.createDraft,
    cart.updateDraft,
    cart.addMedia,
    cart.removeMedia,
    cart.updateMediaFraming,
    cart.reorderMedia,
    order.createOrder,
    order.mockConfirmOrder,
    order.createPixPaymentAttempt,
    order.createCardPaymentAttempt,
    order.applyMercadoPagoWebhook,
    mp.fetchMercadoPagoPayment,
  ] as unknown as ReturnType<typeof vi.fn>[];
}

describe("MAINTENANCE_MODE=true — rotas de escrita", () => {
  it.each(writeCalls)("$name responde 503 + Retry-After sem chamar o domínio", async ({ run }) => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    const res = await run();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect((await res.json()).error.code).toBe("maintenance");
    for (const fn of await domainMocks()) expect(fn).not.toHaveBeenCalled();
  });
});

describe("MAINTENANCE_MODE=true — webhook do Mercado Pago", () => {
  function signed(dataId: string, requestId: string, ts: string, secret: string) {
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
    return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId };
  }

  it("notificação válida e assinada recebe 503 (nunca 200) e nada é consultado nem aplicado", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "segredo-teste");
    const { POST } = await import("./webhooks/mercadopago/route");
    const res = await POST(
      new Request(`${BASE}/api/webhooks/mercadopago`, {
        method: "POST",
        headers: { "content-type": "application/json", ...signed("123", "req-1", "1700000000000", "segredo-teste") },
        body: JSON.stringify({ id: 99, type: "payment", data: { id: "123" } }),
      }),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeTruthy();
    for (const fn of await domainMocks()) expect(fn).not.toHaveBeenCalled();
  });

  it("com o modo desligado, a mesma notificação segue o fluxo normal (controle)", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "false");
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "segredo-teste");
    const { POST } = await import("./webhooks/mercadopago/route");
    const res = await POST(
      new Request(`${BASE}/api/webhooks/mercadopago`, {
        method: "POST",
        headers: { "content-type": "application/json", ...signed("123", "req-1", "1700000000000", "segredo-teste") },
        body: JSON.stringify({ id: 99, type: "payment", data: { id: "123" } }),
      }),
    );
    expect(res.status).toBe(200);
    const { applyMercadoPagoWebhook } = await import("@/server/orderService");
    expect(applyMercadoPagoWebhook).toHaveBeenCalledTimes(1);
  });
});

describe("MAINTENANCE_MODE=true — leituras continuam disponíveis", () => {
  it("GET /api/orders/[id] (status do pedido) responde 200", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    const { GET } = await import("./orders/[id]/route");
    const res = await GET(new Request(`${BASE}/api/orders/o1`), ctx({ id: "o1" }));
    expect(res.status).toBe(200);
  });

  it("GET /api/carts/[id] (rascunho) responde 200", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    const { GET } = await import("./carts/[id]/route");
    const res = await GET(
      new Request(`${BASE}/api/carts/c1`, { headers: { "x-cart-edit-token": "tok" } }),
      ctx({ id: "c1" }),
    );
    expect(res.status).toBe(200);
  });
});
