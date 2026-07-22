import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/**
 * As cartinhas (/c/) e páginas de pedido nunca devem ser indexadas.
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
