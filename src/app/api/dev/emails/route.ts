import { prisma } from "@/lib/db";
import { jsonError, jsonOk, ApiError } from "@/server/errors";

export const dynamic = "force-dynamic";

/**
 * Visualizador de e-mails mockados — SOMENTE desenvolvimento.
 * Nunca disponível em produção, independentemente da flag.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError("forbidden_state", "Indisponível em produção.");
    }
    if ((process.env.DEV_EMAILS_ENABLED ?? "true") === "false") {
      throw new ApiError("forbidden_state", "Visualizador de e-mails desativado.");
    }

    const orderId = new URL(req.url).searchParams.get("orderId");
    const deliveries = await prisma.emailDelivery.findMany({
      where: orderId ? { orderId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const items = deliveries.map((d) => ({
      id: d.id,
      orderId: d.orderId,
      type: d.type,
      recipient: d.recipient,
      status: d.status,
      attempts: d.attempts,
      sentAt: d.sentAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      email: safeParsePayload(d.payload),
    }));

    return jsonOk({ items });
  } catch (err) {
    return jsonError(err);
  }
}

function safeParsePayload(payload: string): unknown {
  try {
    return payload ? JSON.parse(payload) : null;
  } catch {
    return null;
  }
}
