/**
 * Regra única de leitura e validação do modo de pagamento.
 *
 * Existem duas variáveis para o mesmo conceito, por necessidade do Next:
 * `PAYMENT_MODE` decide o provider e a CSP no servidor, e
 * `NEXT_PUBLIC_PAYMENT_MODE` é o espelho que chega ao navegador e decide o
 * que o checkout mostra. Nada garantia que as duas casassem, e divergir não
 * derrubava nada — só produzia um checkout mentiroso ou inutilizável:
 *
 * - servidor `real` + cliente `mock`: a UI promete "nenhuma cobrança real",
 *   oferece o painel de simulação, e o servidor recusa com 403 `mock_disabled`
 *   (ninguém consegue comprar);
 * - servidor `mock` + cliente `real`: a UI promete Mercado Pago, o provider
 *   mock devolve um Pix que nunca será pago, e a CSP nem carrega o Brick.
 *
 * Este módulo é **puro**: não lê `process.env` no carregamento. Isso é o que
 * permite o mesmo código valer para cliente, servidor e `next.config.ts` sem
 * arrastar uma variável privada do servidor para o bundle do navegador — quem
 * chama decide qual string passar.
 */
export type PaymentMode = "mock" | "real";

/** Ausência de configuração significa demonstração, nunca cobrança real. */
export const DEFAULT_PAYMENT_MODE: PaymentMode = "mock";

const VALID: readonly PaymentMode[] = ["mock", "real"];

function isPaymentMode(value: string): value is PaymentMode {
  return (VALID as readonly string[]).includes(value);
}

/**
 * Converte o valor bruto de uma variável de ambiente em `PaymentMode`.
 *
 * Aceita **exatamente** `"mock"` ou `"real"` — sem `trim`, sem normalizar
 * maiúsculas. `"REAL"`, `"prod"`, `" real"` e `""` são erro de configuração,
 * não sinônimos: aceitar variações significaria adivinhar a intenção de quem
 * configurou o caminho do dinheiro. Só `undefined` (variável não definida) cai
 * no padrão, porque essa é a configuração de quem ainda não decidiu nada.
 *
 * A mensagem nunca ecoa o valor recebido. A variável deveria conter apenas um
 * nome de modo, mas um erro de configuração é justamente o caso em que ela
 * pode conter outra coisa — e mensagens de erro vazam para logs.
 */
export function parsePaymentMode(raw: string | undefined, varName: string): PaymentMode {
  if (raw === undefined) return DEFAULT_PAYMENT_MODE;
  if (isPaymentMode(raw)) return raw;
  throw new Error(
    `${varName} tem um valor inválido. Use exatamente "mock" ou "real" ` +
      `(minúsculas, sem espaços) ou remova a variável para usar o padrão ` +
      `"${DEFAULT_PAYMENT_MODE}". Ver .env.example.`,
  );
}

/**
 * Valida as duas variáveis e exige que descrevam o mesmo modo, devolvendo-o.
 *
 * Os padrões são aplicados **antes** da comparação, então definir só uma delas
 * como `"real"` é divergência (a outra vale `"mock"`) e falha — que é o
 * comportamento desejado: meio caminho para cobrança real é o estado mais
 * perigoso possível. Definir só uma como `"mock"` continua consistente.
 *
 * Aqui os valores podem ser citados na mensagem porque já passaram pelo
 * parser: são comprovadamente `"mock"` ou `"real"`, nunca conteúdo arbitrário.
 */
export function assertPaymentModeConsistency(
  serverRaw: string | undefined,
  publicRaw: string | undefined,
): PaymentMode {
  const server = parsePaymentMode(serverRaw, "PAYMENT_MODE");
  const client = parsePaymentMode(publicRaw, "NEXT_PUBLIC_PAYMENT_MODE");

  if (server !== client) {
    throw new Error(
      `PAYMENT_MODE ("${server}") e NEXT_PUBLIC_PAYMENT_MODE ("${client}") divergem. ` +
        "As duas descrevem o mesmo modo de pagamento e precisam ser iguais: a primeira " +
        "decide o provider e a CSP no servidor, a segunda decide o que o checkout mostra " +
        "ao comprador. Divergir gera um checkout enganoso ou inutilizável, então a " +
        "aplicação para aqui em vez de subir. Ajuste as duas para o mesmo valor " +
        "(ambas ausentes também é válido e equivale a " +
        `"${DEFAULT_PAYMENT_MODE}").`,
    );
  }

  return server;
}
