import { createOrder } from "@/server/orderService";
import { createOrderSchema } from "@/server/schemas";
import { jsonError, jsonOk, ApiError } from "@/server/errors";
import { readEditToken } from "@/server/editTokenHeader";
import { track } from "@/lib/analytics";
import { createInMemoryRateLimiter, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Limitador leve por instância (best-effort — ver lib/rateLimit.ts). */
const limiter = createInMemoryRateLimiter(20, 60_000);

export async function POST(req: Request): Promise<Response> {
  try {
    const gate = limiter.check(clientKey(req));
    if (!gate.allowed) {
      throw new ApiError("rate_limited", "Muitos pedidos em pouco tempo. Aguarde um instante.");
    }

    const raw = await req.json().catch(() => {
      throw new ApiError("invalid", "Corpo da requisição inválido.");
    });
    const parsed = createOrderSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError("invalid", "Dados inválidos: " + parsed.error.issues[0]?.message);
    }
    const order = await createOrder(readEditToken(req), parsed.data);
    track("order_created", { plan: order.planType });
    return jsonOk({ order }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
