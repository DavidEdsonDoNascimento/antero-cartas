/**
 * Sanitização de tudo que sai para o Sentry (task 011, seção 9.1).
 *
 * O produto trafega dado sensível por natureza: o texto da carta, o título, o
 * nome de quem envia e recebe, e-mail e telefone do comprador, o token de
 * edição do rascunho e o slug do link privado. Nada disso pode virar evento
 * de monitoramento — um relatório de erro é lido por terceiros, fica
 * armazenado fora do nosso controle e sobrevive ao pedido.
 *
 * A estratégia é remover por padrão em vez de tentar adivinhar o que é
 * seguro:
 * - corpo de requisição: descartado inteiro (é onde a carta viaja);
 * - cabeçalhos: só uma lista curta de permitidos sobrevive;
 * - cookies: descartados;
 * - URLs: identificador privado mascarado, query e fragmento descartados;
 * - texto livre (mensagem, exceção, breadcrumb): e-mail, CPF, telefone,
 *   token e URL substituídos por rótulo.
 *
 * Módulo puro de propósito — nenhum import do SDK — para poder ser testado
 * sem rede, sem DSN e sem DOM.
 */

/** Cabeçalhos sem valor sensível que ajudam a diagnosticar. */
const ALLOWED_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "content-length",
  "content-type",
  "user-agent",
  "referer",
]);

const PRIVATE_PATH_RULES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\/c\/[^/?#]+/g, replacement: "/c/[slug]" },
  { pattern: /\/pedido\/[^/?#]+/g, replacement: "/pedido/[orderId]" },
  { pattern: /\/checkout\/[^/?#]+/g, replacement: "/checkout/[cartId]" },
  { pattern: /\/api\/carts\/[^/?#]+/g, replacement: "/api/carts/[id]" },
  { pattern: /\/api\/orders\/[^/?#]+/g, replacement: "/api/orders/[id]" },
];

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
/** Telefone BR com ou sem máscara, com ou sem DDI. */
const PHONE_RE = /\b(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;
const BEARER_RE = /\b[Bb]earer\s+[\w.~+/-]+=*/g;
/** Token de edição/serviço: cadeia longa de base64url, como o editToken. */
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{32,}\b/g;

export const REDACTED = "[redacted]";

/**
 * Mascara identificador privado e descarta query/fragmento. Mantém o caminho
 * porque saber *qual rota* falhou é o mínimo para diagnosticar.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;

  // Trata tanto URL absoluta quanto caminho relativo.
  const [withoutFragment] = rawUrl.split("#");
  const [pathAndOrigin] = withoutFragment.split("?");

  let result = pathAndOrigin;
  for (const { pattern, replacement } of PRIVATE_PATH_RULES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Substitui dado pessoal e credencial em texto livre. A ordem importa:
 * e-mail antes de telefone, senão a parte numérica de um e-mail poderia ser
 * mascarada primeiro e quebrar o casamento do endereço inteiro.
 */
export function scrubText(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, REDACTED)
    .replace(BEARER_RE, REDACTED)
    .replace(CPF_RE, REDACTED)
    .replace(PHONE_RE, REDACTED)
    .replace(LONG_TOKEN_RE, REDACTED)
    .replace(/https?:\/\/[^\s"']+/g, (url) => sanitizeUrl(url));
}

/**
 * Forma mínima de um evento do Sentry — evita acoplar os testes ao SDK.
 *
 * Sem index signature de propósito: com ela, os tipos `ErrorEvent` e
 * `TransactionEvent` do SDK deixam de ser atribuíveis a esta interface e o
 * `beforeSend` não compila.
 */
export interface SanitizableEvent {
  message?: string;
  request?: {
    url?: string;
    headers?: Record<string, string>;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
  };
  exception?: {
    values?: Array<{ value?: string; type?: string }>;
  };
  breadcrumbs?: Array<{
    message?: string;
    data?: Record<string, unknown>;
  }>;
  user?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!ALLOWED_HEADERS.has(name.toLowerCase())) continue;
    safe[name] = typeof value === "string" ? scrubText(value) : value;
  }
  return safe;
}

/**
 * Ponto único chamado pelo `beforeSend` das três configurações (cliente,
 * servidor e edge). Nunca lança: uma falha aqui não pode impedir o envio nem
 * derrubar a requisição — mas, se algo der errado, o evento é descartado por
 * segurança, e não enviado sem limpeza.
 */
export function sanitizeEvent<T extends SanitizableEvent>(event: T): T | null {
  try {
    if (event.message) {
      event.message = scrubText(event.message);
    }

    if (event.request) {
      const request = event.request;
      if (request.url) request.url = sanitizeUrl(request.url);
      // O corpo carrega a carta inteira (título, mensagem, assinatura) e os
      // dados do comprador. Não existe recorte seguro — vai fora.
      delete request.data;
      delete request.cookies;
      delete request.query_string;
      if (request.headers) request.headers = sanitizeHeaders(request.headers);
    }

    if (event.exception?.values) {
      for (const value of event.exception.values) {
        if (value.value) value.value = scrubText(value.value);
      }
    }

    if (event.breadcrumbs) {
      for (const crumb of event.breadcrumbs) {
        if (crumb.message) crumb.message = scrubText(crumb.message);
        if (crumb.data) {
          for (const [key, value] of Object.entries(crumb.data)) {
            if (typeof value === "string") {
              crumb.data[key] = key.toLowerCase().includes("url")
                ? sanitizeUrl(value)
                : scrubText(value);
            }
          }
        }
      }
    }

    // Nunca identificamos o usuário: não há login, e o produto não precisa
    // saber quem errou para corrigir o erro.
    delete event.user;
    // `extra` é caixa livre: qualquer código pode anexar qualquer objeto ali,
    // sem forma conhecida para inspecionar. Vai fora. `contexts` fica — é
    // preenchido pelo próprio SDK com navegador, SO e runtime, que é
    // justamente o que ajuda a diagnosticar e não identifica ninguém.
    delete event.extra;

    return event;
  } catch {
    return null;
  }
}
