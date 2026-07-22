import { createOrder } from "@/server/orderService";
import { createOrderSchema } from "@/server/schemas";
import { jsonError, jsonOk, ApiError } from "@/server/errors";
import { readEditToken } from "@/server/editTokenHeader";
import { track } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
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
