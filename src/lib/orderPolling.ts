/**
 * Lógica pura por trás do polling de `/pedido/[orderId]/sucesso`.
 * Extraída de OrderSuccessClient para ser testável sem DOM: o componente só
 * chama a API e aplica a decisão que esta função devolve.
 */
import { ApiClientError } from "@/lib/api";
import type { OrderResult } from "@/lib/api";

export class PollTimeoutError extends Error {
  constructor() {
    super("A consulta ao pedido demorou demais para responder.");
    this.name = "PollTimeoutError";
  }
}

export type OrderPollOutcome =
  | { ok: true; result: OrderResult }
  | { ok: false; error: unknown };

export type PollUiState =
  | { kind: "result"; result: OrderResult }
  /** Parou de tentar: status ainda PENDING depois do prazo. Não é erro de rede. */
  | { kind: "pending_timeout"; result: OrderResult }
  | { kind: "error"; message: string; retryable: boolean };

export type OrderPollDecision =
  | { action: "keep_polling"; state: PollUiState }
  | { action: "stop"; state: PollUiState };

/**
 * Classifica um erro de consulta em mensagem + "faz sentido tentar de novo?".
 * 4xx (exceto 429) são problemas de estado/autorização — tentar de novo com a
 * mesma requisição não muda o resultado. 5xx, 429, timeout e falha de rede são
 * transitórios — retry pode ajudar.
 */
export function classifyOrderError(err: unknown): { message: string; retryable: boolean } {
  if (err instanceof ApiClientError) {
    switch (err.status) {
      case 429:
        return { message: "Muitas tentativas em pouco tempo. Aguarde um instante.", retryable: true };
      case 400:
      case 401:
      case 403:
      case 404:
        return { message: err.message, retryable: false };
      case 409:
        return { message: "Não foi possível confirmar o pagamento agora.", retryable: false };
      default:
        return { message: "Não foi possível consultar o pedido agora. Tente novamente.", retryable: true };
    }
  }
  if (err instanceof PollTimeoutError) {
    return { message: "A consulta demorou demais para responder.", retryable: true };
  }
  return {
    message: "Não foi possível consultar o pedido. Verifique sua conexão.",
    retryable: true,
  };
}

/**
 * Decide o próximo estado da UI a partir do resultado de uma tentativa de
 * polling. Nunca deixa a chamada em aberto: toda saída é "continue" (com um
 * novo poll agendado por quem chama) ou "pare" (estado terminal definido).
 *
 * PAID sem `publicUrl` (incidente de 2026-08-30): a Order já foi aprovada,
 * mas a publicação da carta (Cart -> PUBLISHED, slug) ainda não chegou
 * nesta leitura. Desde a correção do incidente as duas escritas são
 * atômicas na mesma transação, então essa janela só existe entre o commit
 * e a resposta deste poll chegar ao navegador — nunca um estado
 * permanentemente inconsistente. Tratado como "ainda não resolvido" para
 * fins de polling, exatamente como PENDING (continua consultando até o
 * mesmo prazo, sem loop infinito); NUNCA gera `pending_timeout` (que diria
 * "ainda não conseguimos confirmar seu pagamento" — falso aqui, o
 * pagamento já está confirmado) nem cai em erro/falha.
 */
export function reduceOrderPoll(
  outcome: OrderPollOutcome,
  elapsedMs: number,
  timeoutMs: number,
): OrderPollDecision {
  if (!outcome.ok) {
    const { message, retryable } = classifyOrderError(outcome.error);
    return { action: "stop", state: { kind: "error", message, retryable } };
  }

  const { result } = outcome;
  const stillFinalizing = result.order.status === "PAID" && !result.publicUrl;
  const unresolved = result.order.status === "PENDING" || stillFinalizing;

  if (!unresolved) {
    return { action: "stop", state: { kind: "result", result } };
  }
  if (elapsedMs >= timeoutMs) {
    // PAID ainda finalizando: devolve o resultado normal (nunca
    // pending_timeout) — quem renderiza decide o texto certo a partir de
    // order.status/publicUrl, sem afirmar que o pagamento não foi confirmado.
    return {
      action: "stop",
      state: stillFinalizing ? { kind: "result", result } : { kind: "pending_timeout", result },
    };
  }
  return { action: "keep_polling", state: { kind: "result", result } };
}
