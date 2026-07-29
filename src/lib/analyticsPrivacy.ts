/**
 * Regras de privacidade do analytics (task 011, seção 9.2).
 *
 * Duas superfícies precisam ser limpas antes de qualquer coisa sair do
 * navegador:
 *
 * 1. A URL da página. O Vercel Web Analytics registra a URL completa de cada
 *    pageview, e as nossas rotas privadas carregam identificador no caminho —
 *    `/c/<slug>` é o link exclusivo da carta, `/pedido/<id>` e
 *    `/checkout/<cartId>` identificam uma compra. Mandar isso para um terceiro
 *    equivaleria a vazar o link privado.
 * 2. As propriedades de evento. Hoje todos os `track()` do produto passam só
 *    valores agregados (plano, tema, contagem), mas isto aqui é a rede de
 *    segurança para o dia em que alguém acrescentar um campo sem perceber.
 *
 * Este módulo é puro de propósito: nada de import do fornecedor, para poder
 * ser testado sem DOM e sem rede.
 */

/** Caminhos com identificador privado no lugar do segmento dinâmico. */
const PRIVATE_PATH_RULES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^\/c\/[^/]+/, replacement: "/c/[slug]" },
  { pattern: /^\/pedido\/[^/]+/, replacement: "/pedido/[orderId]" },
  { pattern: /^\/checkout\/[^/]+/, replacement: "/checkout/[cartId]" },
];

/**
 * Substitui identificadores privados por rótulos e descarta query string e
 * fragmento por completo. Descartar tudo em vez de manter uma lista de
 * parâmetros aceitos é intencional: hoje nenhuma rota depende de query para
 * ser entendida no relatório, e a lista de bloqueio envelheceria mal.
 */
export function sanitizeAnalyticsUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    // Sem URL utilizável não há o que reportar com segurança.
    return "/";
  }

  let path = parsed.pathname;
  for (const { pattern, replacement } of PRIVATE_PATH_RULES) {
    if (pattern.test(path)) {
      path = path.replace(pattern, replacement);
      break;
    }
  }

  return `${parsed.origin}${path}`;
}

/**
 * Chaves que nunca podem ser enviadas, mesmo que alguém as adicione a um
 * `track()` no futuro. Comparadas em minúsculas e por substring, para pegar
 * variações como `recipientName` ou `buyer_email`.
 */
const FORBIDDEN_KEY_FRAGMENTS = [
  "name",
  "nome",
  "email",
  "mail",
  "phone",
  "fone",
  "telefone",
  "whatsapp",
  "cpf",
  "document",
  "documento",
  "title",
  "titulo",
  "message",
  "mensagem",
  "content",
  "conteudo",
  "text",
  "texto",
  "signature",
  "assinatura",
  "token",
  "secret",
  "password",
  "senha",
  "auth",
  "cookie",
  "slug",
  "url",
  "link",
  "address",
  "endereco",
];

/** Valor textual que parece dado pessoal, independentemente do nome da chave. */
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const LONG_DIGITS_RE = /\b\d{8,}\b/; // telefone, CPF sem máscara, identificador
const URL_RE = /https?:\/\//i;

/**
 * Texto livre acima disso é conteúdo, não rótulo. Nenhum valor legítimo do
 * produto (plano, tema, código de erro) chega perto deste tamanho.
 */
const MAX_STRING_LENGTH = 40;

export type SafeAnalyticsValue = string | number | boolean | null;

export function isSafeAnalyticsKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return !FORBIDDEN_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function isSafeAnalyticsValue(value: SafeAnalyticsValue): boolean {
  if (typeof value !== "string") return true;
  if (value.length > MAX_STRING_LENGTH) return false;
  return !EMAIL_RE.test(value) && !CPF_RE.test(value) && !URL_RE.test(value) && !LONG_DIGITS_RE.test(value);
}

/**
 * Remove silenciosamente (sem lançar) o que não pode sair. Falhar aqui
 * quebraria o fluxo do usuário por causa de telemetria — o evento vai
 * incompleto, e é isso mesmo.
 */
export function sanitizeAnalyticsProps(
  props: Record<string, SafeAnalyticsValue>,
): Record<string, SafeAnalyticsValue> {
  const safe: Record<string, SafeAnalyticsValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!isSafeAnalyticsKey(key)) continue;
    if (!isSafeAnalyticsValue(value)) continue;
    safe[key] = value;
  }
  return safe;
}
