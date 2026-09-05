/**
 * PATCH da foto (ajuste de enquadramento) na borda HTTP.
 *
 * A regra de negócio é testada em `cartMediaFraming.test.ts`; aqui o que
 * importa é que nada inválido ATRAVESSE a rota, que o token de edição do
 * cabeçalho chegue ao serviço e que o corpo aceito seja exatamente o
 * contrato normalizado (nada de pixels).
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/server/cartService", () => ({
  removeMedia: vi.fn(),
  updateMediaFraming: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

async function patchFraming(body: unknown, editToken?: string): Promise<Response> {
  const { PATCH } = await import("./route");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (editToken) headers["x-cart-edit-token"] = editToken;
  return PATCH(
    new Request("https://cartas.anterosistemas.com.br/api/carts/cart_1/media/m1", {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "cart_1", mediaId: "m1" }) },
  );
}

describe("PATCH /api/carts/[id]/media/[mediaId]", () => {
  it("repassa o enquadramento e o token de edição para o serviço", async () => {
    const { updateMediaFraming } = await import("@/server/cartService");
    vi.mocked(updateMediaFraming).mockResolvedValue({ id: "cart_1" } as never);

    const res = await patchFraming({ framing: { x: 0.2, y: 0.1, zoom: 1.5 } }, "tok");

    expect(res.status).toBe(200);
    expect(updateMediaFraming).toHaveBeenCalledWith("cart_1", "tok", "m1", {
      x: 0.2,
      y: 0.1,
      zoom: 1.5,
    });
  });

  it("aceita null para restaurar o padrão", async () => {
    const { updateMediaFraming } = await import("@/server/cartService");
    vi.mocked(updateMediaFraming).mockResolvedValue({ id: "cart_1" } as never);

    await patchFraming({ framing: null }, "tok");

    expect(updateMediaFraming).toHaveBeenCalledWith("cart_1", "tok", "m1", null);
  });

  it("rejeita valores fora de faixa sem chegar ao serviço", async () => {
    const { updateMediaFraming } = await import("@/server/cartService");
    const res = await patchFraming({ framing: { x: 4, y: 0.5, zoom: 1 } }, "tok");

    expect(res.status).toBe(400);
    expect(updateMediaFraming).not.toHaveBeenCalled();
  });

  it("rejeita deslocamento em pixels", async () => {
    const { updateMediaFraming } = await import("@/server/cartService");
    const res = await patchFraming(
      { framing: { x: 0.5, y: 0.5, zoom: 1, offsetY: -120 } },
      "tok",
    );

    expect(res.status).toBe(400);
    expect(updateMediaFraming).not.toHaveBeenCalled();
  });

  it("sem cabeçalho de token, o serviço recebe null e decide (401)", async () => {
    const { updateMediaFraming } = await import("@/server/cartService");
    const { ApiError } = await import("@/server/errors");
    vi.mocked(updateMediaFraming).mockRejectedValue(
      new ApiError("unauthorized", "Token de edição ausente."),
    );

    const res = await patchFraming({ framing: null });

    expect(updateMediaFraming).toHaveBeenCalledWith("cart_1", null, "m1", null);
    expect(res.status).toBe(401);
  });
});
