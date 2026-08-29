/**
 * Conversão exata de reais (float, como o Mercado Pago devolve em
 * `transaction_amount`) para centavos inteiros — task 013, seção 9
 * (integridade do webhook: nunca confiar em valor sem validar contra o que
 * o servidor calculou na criação do pedido).
 *
 * Módulo puro — nenhuma chamada de rede, testável só com números.
 */

/**
 * Multiplica por 100 e arredonda para o inteiro mais próximo, depois
 * RECONSTRÓI o valor em reais a partir desse inteiro e compara com o valor
 * original usando uma tolerância de PONTO FLUTUANTE (não de moeda) — ordens
 * de grandeza menor que um centavo genuíno. Se a diferença for maior que
 * isso, o valor original tinha mais precisão do que centavos permitem (ex.:
 * 18.905) e é rejeitado explicitamente, nunca arredondado em silêncio.
 *
 * A comparação final contra `Order.amount` (feita pelo chamador) é sempre
 * INTEIRO contra INTEIRO — a única vez que ponto flutuante entra nesta
 * função é para validar a própria precisão do valor recebido, nunca para
 * decidir se dois valores em dinheiro são iguais.
 *
 * Rejeita (devolve `null`): não-número, `NaN`, `Infinity`, zero, negativo,
 * ou qualquer valor com casas decimais incompatíveis com centavos.
 */
export function toCentsExact(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;

  const cents = Math.round(value * 100);
  if (cents <= 0) return null;

  const reconstructed = cents / 100;
  const FLOATING_POINT_EPSILON = 1e-9;
  if (Math.abs(reconstructed - value) > FLOATING_POINT_EPSILON) return null;

  return cents;
}
