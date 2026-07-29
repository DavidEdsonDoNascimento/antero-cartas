import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { buildSecurityHeaders } from "./src/config/securityHeaders";

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
