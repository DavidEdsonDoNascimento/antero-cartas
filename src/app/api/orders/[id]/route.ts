import { getOrderResult } from "@/server/orderService";
import { jsonError, jsonOk } from "@/server/errors";

export const dynamic = "force-dynamic";

/**
 * Consulta de status do pedido (somente leitura, sem efeitos colaterais).
 * O id é um cuid não sequencial/não adivinhável; a resposta expõe apenas
 * dados não sensíveis (sem nome/e-mail/telefone/CPF). Quando PAID, inclui
 * a carta publicada, o link público e o QR Code para a página de sucesso.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const result = await getOrderResult(id);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
