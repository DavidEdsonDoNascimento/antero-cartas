/**
 * Headers de segurança (task 011, seção 9.4).
 *
 * Módulo puro: recebe o ambiente por parâmetro e devolve os headers, para
 * poder ser testado sem subir servidor. `next.config.ts` só lê as variáveis e
 * chama `buildSecurityHeaders`.
 *
 * Domínios levantados a partir do código, não por suposição:
 *
 * | recurso                     | origem                              |
 * |-----------------------------|-------------------------------------|
 * | fotos da carta              | Supabase Storage (SUPABASE_URL)     |
 * | miniatura da música         | https://i.ytimg.com                 |
 * | player de música            | https://www.youtube.com (iframe)    |
 * | fontes                      | própria origem (next/font embute)   |
 * | analytics                   | própria origem (/_vercel/insights)  |
 * | Sentry                      | host do DSN, quando configurado     |
 * | QR Code                     | data: (PNG gerado no servidor)      |
 * | preview de foto antes do envio | blob: (URL.createObjectURL)      |
 * | Payment Brick (cartão)      | *.mercadopago.com/*.mlstatic.com, só com PAYMENT_MODE=real |
 */

export interface SecurityHeaderOptions {
  /** `true` em produção: liga HSTS e desliga as folgas de desenvolvimento. */
  isProduction: boolean;
  /** URL do projeto Supabase (`SUPABASE_URL`), se disponível no build. */
  supabaseUrl?: string;
  /** DSN do Sentry, se configurado — só o host é usado. */
  sentryDsn?: string;
  /**
   * `"real"` libera os domínios do Payment Brick do Mercado Pago (task 013)
   * — SDK, estilos e campos seguros de cartão. Fica de fora em modo mock:
   * nada é carregado, então nada precisa ser permitido.
   */
  paymentMode?: "mock" | "real";
}

export interface HeaderEntry {
  key: string;
  value: string;
}

/** Extrai a origem (`https://host`) de uma URL, ignorando o que for inválido. */
function toOrigin(rawUrl: string | undefined): string | null {
  if (!rawUrl?.trim()) return null;
  try {
    return new URL(rawUrl.trim()).origin;
  } catch {
    return null;
  }
}

/**
 * Sem `SUPABASE_URL` no build não dá para saber a origem exata do bucket.
 * Cair para o curinga do próprio fornecedor é bem mais estreito que `*` e
 * evita que a carta publicada apareça sem foto por causa de uma variável
 * ausente — que é uma falha silenciosa e difícil de diagnosticar.
 */
const SUPABASE_FALLBACK = "https://*.supabase.co";

const YOUTUBE_THUMBNAILS = "https://i.ytimg.com";
const YOUTUBE_PLAYER = ["https://www.youtube.com", "https://www.youtube-nocookie.com"];
/** Script do Vercel Web Analytics em desenvolvimento; em produção é same-origin. */
const VERCEL_ANALYTICS_DEV = "https://va.vercel-scripts.com";
/**
 * Domínios do Payment Brick (SDK, estilos e campos seguros de cartão) —
 * confirmados contra o próprio time do Mercado Pago, não supostos.
 */
const MERCADOPAGO_DOMAINS = ["https://*.mercadopago.com", "https://*.mlstatic.com"];

export function buildContentSecurityPolicy(options: SecurityHeaderOptions): string {
  const { isProduction } = options;
  const supabaseOrigin = toOrigin(options.supabaseUrl) ?? SUPABASE_FALLBACK;
  const sentryOrigin = toOrigin(options.sentryDsn);
  const mercadoPagoEnabled = options.paymentMode === "real";

  const scriptSrc = ["'self'"];
  const connectSrc = ["'self'", supabaseOrigin];
  const styleSrc = ["'self'", "'unsafe-inline'"];
  const fontSrc = ["'self'", "data:"];
  const frameSrc = [...YOUTUBE_PLAYER];

  if (mercadoPagoEnabled) {
    scriptSrc.push(...MERCADOPAGO_DOMAINS);
    styleSrc.push(...MERCADOPAGO_DOMAINS);
    fontSrc.push(...MERCADOPAGO_DOMAINS);
    connectSrc.push(...MERCADOPAGO_DOMAINS);
    frameSrc.push(...MERCADOPAGO_DOMAINS);
  }

  if (!isProduction) {
    // Turbopack/HMR avaliam código em desenvolvimento e o pacote de analytics
    // busca o script de debug num domínio externo. Nenhum dos dois vale em
    // produção, onde o script é servido pela própria origem.
    scriptSrc.push("'unsafe-eval'", VERCEL_ANALYTICS_DEV);
    connectSrc.push(VERCEL_ANALYTICS_DEV, "ws:", "wss:");
  }

  /**
   * `'unsafe-inline'` em script-src é uma concessão consciente, não descuido.
   * O App Router injeta scripts inline com os dados de hidratação em toda
   * página; a alternativa suportada é nonce por requisição, que exige
   * middleware e tornaria dinâmica cada rota — inclusive a landing e a
   * `/demonstracao`, hoje estáticas. Trocar a performance da porta de entrada
   * do produto por essa diretiva não se justifica com o risco atual: não há
   * login, sessão privilegiada nem conteúdo de terceiros renderizado como
   * HTML. Ver docs/0004_Decisions.md.
   */
  scriptSrc.push("'unsafe-inline'");

  if (sentryOrigin) connectSrc.push(sentryOrigin);

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    // Tailwind e next/font emitem estilo inline; sem isto a página fica sem CSS.
    "style-src": styleSrc,
    "img-src": ["'self'", "data:", "blob:", supabaseOrigin, YOUTUBE_THUMBNAILS],
    "font-src": fontSrc,
    "connect-src": connectSrc,
    "frame-src": frameSrc,
    "media-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // O produto nunca é legitimamente enquadrado; nega clickjacking na raiz.
    "frame-ancestors": ["'none'"],
  };

  const policy = Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");

  return isProduction ? `${policy}; upgrade-insecure-requests` : policy;
}

export function buildSecurityHeaders(options: SecurityHeaderOptions): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Redundante com frame-ancestors, mantido para navegador antigo.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      // O upload usa <input type="file">, que não depende de permissão de
      // câmera — negar tudo aqui não afeta enviar foto pelo celular.
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "magnetometer=()",
        "gyroscope=()",
        "accelerometer=()",
        "interest-cohort=()",
      ].join(", "),
    },
  ];

  if (options.isProduction) {
    // Só em produção: em desenvolvimento o servidor é http e o navegador
    // guardaria a política, quebrando `next dev` até o cache expirar.
    // Sem `preload` de propósito — é praticamente irreversível e exigiria
    // decisão sobre o domínio inteiro, não só este subdomínio.
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}
