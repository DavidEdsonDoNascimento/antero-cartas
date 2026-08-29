/**
 * Regra única de leitura e validação do modo de e-mail.
 *
 * Diferente de `PAYMENT_MODE` (`paymentMode.ts`), aqui a ausência da
 * variável NÃO tem padrão implícito: enviar e-mail de verdade ou só simular
 * é uma decisão que precisa ser declarada — nunca herdada de `APP_ENV`, de
 * outro modo, ou de qualquer convenção. Um ambiente que "esqueceu" de
 * configurar `EMAIL_MODE` precisa falhar alto e óbvio, não virar mock
 * silenciosamente (o que esconderia o esquecimento) nem, pior, arriscar
 * cair em `real` sem ninguém ter decidido isso.
 *
 * Módulo puro: não lê `process.env`. Quem chama decide qual string passar.
 */
export type EmailMode = "mock" | "real";

const VALID: readonly EmailMode[] = ["mock", "real"];

function isEmailMode(value: string): value is EmailMode {
  return (VALID as readonly string[]).includes(value);
}

/**
 * Converte o valor bruto de `EMAIL_MODE` em `EmailMode`.
 *
 * Aceita **exatamente** `"mock"` ou `"real"` — sem `trim`, sem normalizar
 * maiúsculas. Ausente, vazio, ou qualquer outro valor (erro de digitação
 * incluído) é erro de configuração, sempre lançado — nenhum desses casos
 * cai em `"mock"` por padrão.
 *
 * A mensagem nunca ecoa o valor recebido: um erro de configuração é
 * justamente o caso em que a variável pode conter algo que não deveria, e
 * mensagens de erro vão parar em log.
 */
export function parseEmailMode(raw: string | undefined): EmailMode {
  if (raw === undefined) {
    throw new Error(
      'EMAIL_MODE não está definida. Defina exatamente "mock" ou "real" (minúsculas, sem ' +
        "espaços) — não há padrão implícito: o ambiente precisa declarar sua intenção " +
        "explicitamente. Ver .env.example.",
    );
  }
  if (isEmailMode(raw)) return raw;
  throw new Error(
    'EMAIL_MODE tem um valor inválido. Use exatamente "mock" ou "real" (minúsculas, sem ' +
      "espaços). Ver .env.example.",
  );
}
