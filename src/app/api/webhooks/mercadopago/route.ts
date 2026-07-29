import { verifyMercadoPagoSignature } from "@/server/payment/mercadoPagoWebhookSignature";
import { fetchMercadoPagoPayment } from "@/server/payment/mercadopago";
import { applyMercadoPagoWebhook } from "@/server/orderService";

export const dynamic = "force-dynamic";

interface MercadoPagoNotification {
  id?: number | string;
  type?: string;
  data?: { id?: number | string };
}

/**
 * Webhook do Mercado Pago (task 013, seção 9) — única fonte de verdade para
 * aprovar um pagamento. Nunca confia no corpo da notificação além do id: o
 * estado real vem de uma consulta à API (`fetchMercadoPagoPayment`).
 *
 * Responde 200 rápido para tudo que não precisa (nem deve) ser reprocessado
 * — duplicado, pedido desconhecido, tentativa superada, fora de ordem — para
 * o Mercado Pago parar de reenviar. Só falha (500) em erro genuíno de
 * processamento, o que faz o provedor reenviar mais tarde (idempotente por
 * construção, então reenviar é seguro).
 */
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const raw = (await req.json().catch(() => null)) as MercadoPagoNotification | null;

  const dataId = raw?.data?.id != null ? String(raw.data.id) : url.searchParams.get("data.id");
  const type = raw?.type ?? url.searchParams.get("type") ?? "";
  const notificationId = raw?.id != null ? String(raw.id) : null;

  // Sem os dois ids não há o que processar (ex.: ping de teste do painel).
  if (!dataId || !notificationId) {
    return Response.json({ ok: true }, { status: 200 });
  }

  const validSignature = verifyMercadoPagoSignature({
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    dataId,
    secret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
  });
  if (!validSignature) {
    console.error("[webhook][mercadopago] assinatura inválida", { notificationId, type });
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (type !== "payment") {
    // Outros tópicos (ex.: merchant_order) não fazem parte do fluxo — só
    // reconhece para o Mercado Pago não insistir.
    return Response.json({ ok: true }, { status: 200 });
  }

  try {
    const payment = await fetchMercadoPagoPayment(dataId);
    const outcome = await applyMercadoPagoWebhook({
      provider: "mercadopago",
      providerEventId: notificationId,
      providerPaymentId: dataId,
      externalReference: payment.externalReference,
      status: payment.status,
      statusDetail: payment.statusDetail,
      type,
    });
    console.log("[webhook][mercadopago] processado", {
      notificationId,
      dataId,
      outcome: outcome.kind,
    });
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[webhook][mercadopago] falha ao processar", { notificationId, dataId }, err);
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }
}
