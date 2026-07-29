import { createPixPaymentAttempt } from "@/server/orderService";
import { jsonError, jsonOk, ApiError } from "@/server/errors";
import { readEditToken } from "@/server/editTokenHeader";
import { track } from "@/lib/analytics";
import { createInMemoryRateLimiter, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Limitador leve por instância (best-effort — ver lib/rateLimit.ts). */
const limiter = createInMemoryRateLimiter(10, 60_000);

/**
 * Cria uma cobrança Pix para o pedido (task 013, seção 8). O preço/plano já
 * foram definidos no servidor na criação do pedido — esta rota só escolhe o
 * método. A publicação da carta nunca acontece aqui: só o webhook confirma.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const gate = limiter.check(clientKey(req));
    if (!gate.allowed) {
      throw new ApiError("rate_limited", "Muitas tentativas em pouco tempo. Aguarde um instante.");
    }

    const { id } = await params;
    const result = await createPixPaymentAttempt(id, readEditToken(req));
    track("payment_method_selected", { method: "pix" });
    track("payment_pending", { method: "pix" });
    return jsonOk(result, 201);
  } catch (err) {
    return jsonError(err);
  }
}
