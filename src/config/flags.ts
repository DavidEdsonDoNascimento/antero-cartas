/**
 * Feature flags do produto.
 * Interfaces preparadas para evolução sem acoplar o MVP a fornecedores.
 */

function readBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

export const flags = {
  /**
   * Assistente de escrita com LLM. Desligado no MVP — "Preciso de inspiração"
   * funciona com modelos locais. A integração real vem em fase futura.
   */
  AI_WRITING_ASSISTANT: readBool(process.env.NEXT_PUBLIC_AI_WRITING_ASSISTANT, false),

  /**
   * Modo de pagamento. "mock" para desenvolvimento/demonstração,
   * "real" quando um PaymentProvider de produção estiver plugado (Fase 3).
   */
  PAYMENT_MODE: (process.env.NEXT_PUBLIC_PAYMENT_MODE ?? "mock") as "mock" | "real",

  /**
   * Espelho público de ALLOW_MOCK_PAYMENT_CONFIRMATION (server-only). Decide
   * se a UI de checkout mostra os botões "simular pagamento" — PAYMENT_MODE
   * sozinho não basta porque produção também roda em modo mock (Fase 3 ainda
   * não existe). Padrão false (fail-closed): sem a variável, o painel de
   * simulação fica oculto e o checkout mostra a mensagem de indisponibilidade.
   */
  MOCK_PAYMENT_CONFIRMATION_ENABLED: readBool(
    process.env.NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION,
    false,
  ),
} as const;
