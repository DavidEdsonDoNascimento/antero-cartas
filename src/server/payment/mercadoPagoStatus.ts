/**
 * Mapeamento dos estados do Mercado Pago para o estado interno do pedido.
 * Módulo puro — nenhuma chamada de rede, testável só com strings.
 *
 * Nunca espalhar a string do fornecedor pelo domínio (task 013, seção 10):
 * este é o único lugar que conhece o vocabulário do Mercado Pago.
 *
 * Desconhecido/futuro (qualquer status que o Mercado Pago venha a introduzir
 * e que não reconheçamos) cai em PENDING por padrão — nunca em PAID. Um
 * status novo não reconhecido jamais deve publicar uma carta sem pagamento
 * confirmado; na pior hipótese, fica pendente até investigação manual.
 */
import type { InternalOrderStatus } from "./PaymentProvider";

/**
 * Pix expirado chega como `status: "cancelled"` com
 * `status_detail: "expired"` — não como um status próprio. Distinguir aqui
 * é o que permite ao internal status EXPIRED existir sem inventar um valor
 * que o Mercado Pago não usa.
 */
export function mapMercadoPagoStatus(
  status: string,
  statusDetail?: string | null,
): InternalOrderStatus {
  switch (status) {
    case "approved":
      return "PAID";
    case "cancelled":
      return statusDetail === "expired" ? "EXPIRED" : "CANCELLED";
    case "rejected":
      return "FAILED";
    case "refunded":
      return "REFUNDED";
    case "charged_back":
      return "CHARGED_BACK";
    // pending, in_process, authorized, in_mediation e qualquer status futuro
    // não reconhecido: tratados como ainda não resolvidos.
    default:
      return "PENDING";
  }
}

/**
 * Decide se a transição `current -> next` deve ser aplicada (task 013,
 * seção 9 — "tratamento de evento fora de ordem").
 * Regras:
 * - nunca regride de um estado terminal para PENDING (evento atrasado/fora
 *   de ordem depois de outro já ter resolvido o pedido);
 * - de PAID só se avança para REFUNDED/CHARGED_BACK (reversão pós-pagamento);
 * - qualquer outra combinação com o mesmo rank ou já resolvida é ignorada
 *   (idempotente: reaplicar o mesmo estado final não é erro, só não faz nada).
 */
export function shouldApplyTransition(
  current: InternalOrderStatus,
  next: InternalOrderStatus,
): boolean {
  if (current === next) return false;
  if (current === "PENDING") return true;
  if (current === "PAID") return next === "REFUNDED" || next === "CHARGED_BACK";
  return false;
}
