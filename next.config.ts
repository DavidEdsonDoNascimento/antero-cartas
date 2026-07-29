import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Miniaturas de música do YouTube exibidas no preview.
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
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
