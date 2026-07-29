import { createCardPaymentAttempt } from "@/server/orderService";
import { cardPaymentSchema } from "@/server/schemas";
import { jsonError, jsonOk, ApiError } from "@/server/errors";
import { readEditToken } from "@/server/editTokenHeader";
import { track } from "@/lib/analytics";
import { createInMemoryRateLimiter, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Limitador leve por instância (best-effort — ver lib/rateLimit.ts). */
const limiter = createInMemoryRateLimiter(10, 60_000);

/**
 * Cria um pagamento de cartão a partir do token gerado pelo Payment Brick no
 * navegador (task 013, seção 8) — nunca o número do cartão. A resposta
 * síncrona do provedor é só feedback de UX; a publicação da carta espera o
 * webhook, nunca este retorno.
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
    const raw = await req.json().catch(() => {
      throw new ApiError("invalid", "Corpo da requisição inválido.");
    });
    const parsed = cardPaymentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError("invalid", "Dados do cartão inválidos: " + parsed.error.issues[0]?.message);
    }

    const result = await createCardPaymentAttempt(id, readEditToken(req), parsed.data);
    track("payment_method_selected", { method: "card" });
    if (result.status === "failed") {
      track("payment_failed", { method: "card" });
    } else {
      track("payment_pending", { method: "card" });
    }
    return jsonOk(result, 201);
  } catch (err) {
    return jsonError(err);
  }
}
