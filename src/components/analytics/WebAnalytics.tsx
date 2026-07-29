"use client";

import { Analytics } from "@vercel/analytics/react";
import { ANALYTICS_ENABLED } from "@/lib/analytics";
import { sanitizeAnalyticsUrl } from "@/lib/analyticsPrivacy";

/**
 * Pageviews do Vercel Web Analytics (task 011, seção 9.2): gratuito no plano
 * Hobby, sem cookie — o visitante é identificado por um hash da requisição,
 * descartado em 24h — e servido pela própria origem (`/_vercel/insights/…`),
 * o que evita abrir um domínio novo na CSP.
 *
 * `beforeSend` é obrigatório aqui, não opcional: o produto tem rotas com
 * identificador privado no caminho (`/c/<slug>` é o link exclusivo da carta),
 * e o Web Analytics registra a URL completa de cada pageview. Sem esta
 * limpeza, o link privado sairia do navegador.
 */
export function WebAnalytics() {
  if (!ANALYTICS_ENABLED) return null;

  return (
    <Analytics
      beforeSend={(event) => ({ ...event, url: sanitizeAnalyticsUrl(event.url) })}
    />
  );
}
