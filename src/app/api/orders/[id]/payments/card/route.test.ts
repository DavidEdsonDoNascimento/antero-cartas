import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError } from "@/server/errors";

vi.mock("@/server/orderService", () => ({
  createCardPaymentAttempt: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

async function callRoute(body: unknown, editToken?: string): Promise<Response> {
  const { POST } = await import("./route");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (editToken) headers["x-cart-edit-token"] = editToken;
  return POST(
    new Request("https://cartas.anterosistemas.com.br/api/orders/order_1/payments/card", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "order_1" }) },
  );
}

describe("POST /api/orders/[id]/payments/card — validação (task 013, seção 8)", () => {
  it("rejeita corpo sem token", async () => {
    const res = await callRoute({ installments: 1, paymentMethodId: "visa" }, "tok");
    expect(res.status).toBe(400);
    const { createCardPaymentAttempt } = await import("@/server/orderService");
    expect(createCardPaymentAttempt).not.toHaveBeenCalled();
  });

  it("rejeita installments fora do intervalo permitido", async () => {
    const res = await callRoute(
      { token: "card-token", installments: 99, paymentMethodId: "visa" },
      "tok",
    );
    expect(res.status).toBe(400);
  });

  it("rejeita campo extra que pareça dado sensível de cartão (não faz parte do schema)", async () => {
    // O schema é estrutural: campos como número de cartão nunca são lidos,
    // mesmo que enviados por engano — só token/installments/paymentMethodId/issuerId chegam ao domínio.
    const { createCardPaymentAttempt } = await import("@/server/orderService");
    vi.mocked(createCardPaymentAttempt).mockResolvedValue({
      order: {
        id: "order_1",
        cartId: "cart_1",
        status: "PENDING",
        planType: "LIMITED",
        amount: 1890,
        currency: "BRL",
        paidAt: null,
        createdAt: new Date().toISOString(),
      },
      status: "pending",
    });

    await callRoute(
      {
        token: "card-token",
        installments: 1,
        paymentMethodId: "visa",
        card_number: "4111111111111111",
        cvv: "123",
      },
      "tok",
    );

    expect(createCardPaymentAttempt).toHaveBeenCalledWith(
      "order_1",
      "tok",
      { token: "card-token", installments: 1, paymentMethodId: "visa" },
    );
  });

  it("propaga o token de edição ausente para a camada de domínio decidir", async () => {
    const { createCardPaymentAttempt } = await import("@/server/orderService");
    vi.mocked(createCardPaymentAttempt).mockRejectedValue(
      new ApiError("unauthorized", "Token de edição ausente."),
    );
    const res = await callRoute({ token: "t", installments: 1, paymentMethodId: "visa" });
    expect(res.status).toBe(401);
  });
});
