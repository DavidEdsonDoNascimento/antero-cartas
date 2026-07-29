import { describe, it, expect, vi } from "vitest";
import { createMercadoPagoProvider, fetchMercadoPagoPayment } from "./mercadopago";

const OPTS = { accessToken: "TEST-token", siteUrl: "https://cartas.anterosistemas.com.br" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return responses[Math.min(i++, responses.length - 1)];
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("createMercadoPagoProvider — configuração", () => {
  it("exige MERCADOPAGO_ACCESS_TOKEN", async () => {
    const provider = createMercadoPagoProvider({ siteUrl: OPTS.siteUrl, accessToken: "" });
    await expect(
      provider.createPayment({ orderId: "o1", amount: 1890, currency: "BRL", method: "PIX" }),
    ).rejects.toThrow(/MERCADOPAGO_ACCESS_TOKEN/);
  });

  it("exige NEXT_PUBLIC_SITE_URL", async () => {
    const provider = createMercadoPagoProvider({ accessToken: "TEST-token", siteUrl: "" });
    await expect(
      provider.createPayment({ orderId: "o1", amount: 1890, currency: "BRL", method: "PIX" }),
    ).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});

describe("createMercadoPagoProvider — Pix", () => {
  it("cria pagamento Pix e devolve QR Code + copia-e-cola", async () => {
    const { impl, calls } = stubFetch(
      jsonResponse(201, {
        id: 123456789,
        status: "pending",
        status_detail: "pending_waiting_transfer",
        point_of_interaction: {
          transaction_data: { qr_code: "00020126...", qr_code_base64: "aGVsbG8=" },
        },
        date_of_expiration: "2026-08-01T00:00:00.000-03:00",
      }),
    );
    const provider = createMercadoPagoProvider({ ...OPTS, fetchImpl: impl });

    const result = await provider.createPayment({
      orderId: "order_abc",
      amount: 1890,
      currency: "BRL",
      method: "PIX",
      payer: { name: "Ana Teste", email: "ana@example.com" },
    });

    expect(result.providerPaymentId).toBe("123456789");
    expect(result.status).toBe("pending");
    expect(result.pix?.qrCode).toBe("00020126...");
    expect(result.pix?.qrCodeBase64).toBe("aGVsbG8=");
    expect(result.pix?.expiresAt).toBe("2026-08-01T00:00:00.000-03:00");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.payment_method_id).toBe("pix");
    // Preço convertido de centavos para reais — nunca centavos crus.
    expect(body.transaction_amount).toBe(18.9);
    expect(body.external_reference).toBe("order_abc");
    expect(body.notification_url).toBe(
      "https://cartas.anterosistemas.com.br/api/webhooks/mercadopago",
    );
    expect(body.payer.email).toBe("ana@example.com");
  });

  it("mapeia approved para status paid", async () => {
    const { impl } = stubFetch(
      jsonResponse(201, {
        id: 1,
        status: "approved",
        status_detail: "accredited",
        point_of_interaction: { transaction_data: {} },
      }),
    );
    const provider = createMercadoPagoProvider({ ...OPTS, fetchImpl: impl });
    const result = await provider.createPayment({
      orderId: "o1",
      amount: 1000,
      currency: "BRL",
      method: "PIX",
    });
    expect(result.status).toBe("paid");
  });
});

describe("createMercadoPagoProvider — cartão", () => {
  it("cria pagamento de cartão a partir de um token, nunca do número do cartão", async () => {
    const { impl, calls } = stubFetch(
      jsonResponse(201, { id: 987, status: "approved", status_detail: "accredited" }),
    );
    const provider = createMercadoPagoProvider({ ...OPTS, fetchImpl: impl });

    const result = await provider.createPayment({
      orderId: "order_xyz",
      amount: 4890,
      currency: "BRL",
      method: "CARD",
      card: { token: "card-token-abc", installments: 1, paymentMethodId: "visa", issuerId: "25" },
      payer: { name: "Bruno Comprador", email: "bruno@example.com", document: "12345678909" },
    });

    expect(result.providerPaymentId).toBe("987");
    expect(result.status).toBe("paid");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.token).toBe("card-token-abc");
    expect(body.installments).toBe(1);
    expect(body.payment_method_id).toBe("visa");
    expect(body.issuer_id).toBe("25");
    expect(body.payer.identification).toEqual({ type: "CPF", number: "12345678909" });
    // Nunca deve existir campo de número de cartão/CVV no corpo enviado.
    expect(JSON.stringify(body)).not.toMatch(/card_number|security_code|cvv/i);
  });

  it("mapeia rejected para status failed", async () => {
    const { impl } = stubFetch(
      jsonResponse(201, {
        id: 2,
        status: "rejected",
        status_detail: "cc_rejected_insufficient_amount",
      }),
    );
    const provider = createMercadoPagoProvider({ ...OPTS, fetchImpl: impl });
    const result = await provider.createPayment({
      orderId: "o2",
      amount: 1000,
      currency: "BRL",
      method: "CARD",
      card: { token: "t", installments: 1, paymentMethodId: "visa" },
    });
    expect(result.status).toBe("failed");
    expect(result.statusDetail).toBe("cc_rejected_insufficient_amount");
  });

  it("lança erro claro sem dados do cartão", async () => {
    const provider = createMercadoPagoProvider({ ...OPTS, fetchImpl: stubFetch().impl });
    await expect(
      provider.createPayment({ orderId: "o3", amount: 1000, currency: "BRL", method: "CARD" }),
    ).rejects.toThrow(/Dados do cartão ausentes/);
  });
});

describe("createMercadoPagoProvider — erros do provedor", () => {
  it("propaga mensagem de erro sem vazar detalhe interno da resposta bruta", async () => {
    const { impl } = stubFetch(
      jsonResponse(400, { message: "invalid transaction_amount", cause: [] }),
    );
    const provider = createMercadoPagoProvider({ ...OPTS, fetchImpl: impl });
    await expect(
      provider.createPayment({ orderId: "o1", amount: 1000, currency: "BRL", method: "PIX" }),
    ).rejects.toThrow(/invalid transaction_amount/);
  });
});

describe("getPaymentStatus", () => {
  it("consulta o pagamento e mapeia o status", async () => {
    const { impl, calls } = stubFetch(jsonResponse(200, { id: 55, status: "refunded" }));
    const provider = createMercadoPagoProvider({ ...OPTS, fetchImpl: impl });
    const status = await provider.getPaymentStatus("55");
    expect(status).toBe("failed"); // refunded colapsa para failed no tipo simplificado
    expect(calls[0].url).toBe("https://api.mercadopago.com/v1/payments/55");
  });
});

describe("fetchMercadoPagoPayment", () => {
  it("devolve status, status_detail e external_reference crus (para o webhook mapear)", async () => {
    const { impl } = stubFetch(
      jsonResponse(200, {
        id: 55,
        status: "cancelled",
        status_detail: "expired",
        external_reference: "order_123",
      }),
    );
    const snapshot = await fetchMercadoPagoPayment("55", { ...OPTS, fetchImpl: impl });
    expect(snapshot).toEqual({
      status: "cancelled",
      statusDetail: "expired",
      externalReference: "order_123",
    });
  });
});
