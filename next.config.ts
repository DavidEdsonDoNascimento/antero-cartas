import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { buildSecurityHeaders } from "./src/config/securityHeaders";
import { assertPaymentModeConsistency } from "./src/config/paymentMode";

/**
 * Fail-closed do modo de pagamento, no ponto mais cedo que existe: o Next
 * carrega os arquivos `.env` antes deste módulo, e este módulo antes de
 * `dev`, `build` ou `start` fazerem qualquer coisa. Um modo inválido ou
 * divergente entre servidor e cliente derruba o processo aqui, em vez de
 * virar um checkout enganoso em produção.
 *
 * O valor validado alimenta a CSP logo abaixo, então a liberação de
 * `mercadopago.com` passa a vir da mesma regra que a UI e o provider usam —
 * antes era um `=== "real"` solto, uma terceira cópia da regra.
 */
const paymentMode = assertPaymentModeConsistency(
  process.env.PAYMENT_MODE,
  process.env.NEXT_PUBLIC_PAYMENT_MODE,
);

/**
 * Mesmo critério do guard de URL pública (D49/D54): a chave é APP_ENV, não
 * NODE_ENV — `npm run build` roda com NODE_ENV=production inclusive
 * localmente, e usar NODE_ENV ligaria HSTS num `next start` de verificação
 * em http://localhost.
 */
const isProduction = process.env.APP_ENV?.trim() === "production";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Miniaturas de música do YouTube exibidas no preview.
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  async headers() {
    return [
      {
        // Vale para tudo, inclusive rotas de API e a carta pública.
        source: "/:path*",
        headers: buildSecurityHeaders({
          isProduction,
          supabaseUrl: process.env.SUPABASE_URL,
          sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          paymentMode,
        }),
      },
    ];
  },
};

/**
 * O wrapper do Sentry é aplicado sempre, mesmo sem DSN: ele instrumenta o
 * build, não o runtime — quem decide se algum evento é enviado é o `init` em
 * `instrumentation.ts`, que não roda sem DSN.
 *
 * `silent`/`disableLogger` evitam poluir o log de build da Vercel, e o upload
 * de source map fica desligado porque exigiria SENTRY_AUTH_TOKEN, credencial
 * que a Fase 2.5 não tem (e que não é necessária para receber erros).
 */
export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  sourcemaps: { disable: true },
  telemetry: false,
});
