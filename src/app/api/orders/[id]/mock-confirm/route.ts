import { z } from "zod";
import { mockConfirmOrder } from "@/server/orderService";
import { jsonError, jsonOk, ApiError } from "@/server/errors";
import { track } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["success", "fail", "expire"]).default("success"),
});

/**
 * Confirma (ou simula falha/expiração) o pagamento mock. Idempotente.
 * Só funciona com PAYMENT_MODE=mock e ALLOW_MOCK_PAYMENT_CONFIRMATION=true.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw new ApiError("invalid", "Ação inválida.");

    const result = await mockConfirmOrder(id, parsed.data.action);
    if (result.order.status === "PAID") {
      track("mock_payment_confirmed", { plan: result.order.planType });
    }
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
