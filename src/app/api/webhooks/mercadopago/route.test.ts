import { createHmac } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";

const SECRET = "webhook-secret-test";

vi.mock("@/server/payment/mercadopago", () => ({
  fetchMercadoPagoPayment: vi.fn(),
}));
vi.mock("@/server/orderService", () => ({
  applyMercadoPagoWebhook: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

function signedHeaders(dataId: string, requestId: string, ts: string, secret = SECRET) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId };
}

async function callRoute(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const { POST } = await import("./route");
  return POST(
    new Request("https://cartas.anterosistemas.com.br/api/webhooks/mercadopago", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("/api/webhooks/mercadopago", () => {
  it("responde 200 sem processar quando falta data.id ou id da notificação", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRET);
    const res = await callRoute({ type: "payment", data: {} });
    expect(res.status).toBe(200);
    const { applyMercadoPagoWebhook } = await import("@/server/orderService");
    expect(applyMercadoPagoWebhook).not.toHaveBeenCalled();
  });

  it("responde 401 com assinatura inválida, sem chamar o domínio", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRET);
    const res = await callRoute(
      { id: 1, type: "payment", data: { id: "123" } },
      signedHeaders("123", "req-1", "1700000000000", "segredo-errado"),
    );
    expect(res.status).toBe(401);
    const { applyMercadoPagoWebhook } = await import("@/server/orderService");
    expect(applyMercadoPagoWebhook).not.toHaveBeenCalled();
  });

  it("responde 401 sem MERCADOPAGO_WEBHOOK_SECRET configurado (fail-closed)", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "");
    const res = await callRoute(
      { id: 1, type: "payment", data: { id: "123" } },
      signedHeaders("123", "req-1", "1700000000000"),
    );
    expect(res.status).toBe(401);
  });

  it("reconhece (200) mas não processa tópicos diferentes de 'payment'", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRET);
    const res = await callRoute(
      { id: 1, type: "merchant_order", data: { id: "123" } },
      signedHeaders("123", "req-1", "1700000000000"),
    );
    expect(res.status).toBe(200);
    const { applyMercadoPagoWebhook } = await import("@/server/orderService");
    expect(applyMercadoPagoWebhook).not.toHaveBeenCalled();
  });

  it("com assinatura válida, consulta o pagamento e aplica o webhook", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRET);
    const { fetchMercadoPagoPayment } = await import("@/server/payment/mercadopago");
    const { applyMercadoPagoWebhook } = await import("@/server/orderService");
    vi.mocked(fetchMercadoPagoPayment).mockResolvedValue({
      status: "approved",
      statusDetail: "accredited",
      externalReference: "order_abc",
    });
    vi.mocked(applyMercadoPagoWebhook).mockResolvedValue({ kind: "applied", internalStatus: "PAID" });

    const res = await callRoute(
      { id: 999, type: "payment", data: { id: "123456" } },
      signedHeaders("123456", "req-9", "1700000000000"),
    );

    expect(res.status).toBe(200);
    expect(fetchMercadoPagoPayment).toHaveBeenCalledWith("123456");
    expect(applyMercadoPagoWebhook).toHaveBeenCalledWith({
      provider: "mercadopago",
      providerEventId: "999",
      providerPaymentId: "123456",
      externalReference: "order_abc",
      status: "approved",
      statusDetail: "accredited",
      type: "payment",
    });
  });

  it("responde 500 (para permitir retry) quando a consulta ao provedor falha", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRET);
    const { fetchMercadoPagoPayment } = await import("@/server/payment/mercadopago");
    vi.mocked(fetchMercadoPagoPayment).mockRejectedValue(new Error("timeout"));

    const res = await callRoute(
      { id: 1, type: "payment", data: { id: "123" } },
      signedHeaders("123", "req-1", "1700000000000"),
    );
    expect(res.status).toBe(500);
  });

  it("lê data.id e o tipo da query string quando ausentes do corpo", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRET);
    const { fetchMercadoPagoPayment } = await import("@/server/payment/mercadopago");
    const { applyMercadoPagoWebhook } = await import("@/server/orderService");
    vi.mocked(fetchMercadoPagoPayment).mockResolvedValue({
      status: "pending",
      statusDetail: null,
      externalReference: "order_xyz",
    });
    vi.mocked(applyMercadoPagoWebhook).mockResolvedValue({ kind: "applied", internalStatus: "PENDING" });

    const { POST } = await import("./route");
    const headers = signedHeaders("777", "req-q", "1700000000000");
    const res = await POST(
      new Request(
        "https://cartas.anterosistemas.com.br/api/webhooks/mercadopago?data.id=777&type=payment",
        { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ id: 42 }) },
      ),
    );
    expect(res.status).toBe(200);
    expect(fetchMercadoPagoPayment).toHaveBeenCalledWith("777");
  });
});
