import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/**
 * As cartinhas (/c/) e páginas de pedido nunca devem ser indexadas.
 *
 * `/presente/` (prévia pública) fica FORA desta lista de propósito: os robôs de
 * prévia do WhatsApp e afins precisam buscar a página para montar o cartão do
 * link, e um `Disallow` também impediria buscadores de ver o `noindex` (que vai
 * no HTML e no cabeçalho `X-Robots-Tag`, ver next.config.ts). Ela também não
 * entra no sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/c/", "/pedido/", "/checkout/"],
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
