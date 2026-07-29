import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/**
 * Rotas públicas e indexáveis (task 011, seção 9.3).
 *
 * Fora do sitemap de propósito, para não vazar link privado nem gerar
 * indexação indevida:
 * - `/c/[slug]`, `/pedido/*`, `/checkout/*` — bloqueadas em `robots.ts`;
 *   `/c/` em especial é o link exclusivo da carta e nunca pode ser listado.
 * - `/privacidade` e `/termos` — declaram `robots: { index: false }` nas
 *   próprias páginas; listá-las aqui contradiria essa marcação.
 *
 * `lastModified` usa a data do build de propósito: as três rotas são
 * estáticas e mudam junto com um deploy, então não existe outra fonte de
 * verdade sem inventar metadado.
 */
export const PUBLIC_ROUTES = [
  { path: "/", changeFrequency: "monthly", priority: 1 },
  { path: "/criar", changeFrequency: "monthly", priority: 0.9 },
  { path: "/demonstracao", changeFrequency: "monthly", priority: 0.7 },
] as const satisfies ReadonlyArray<{
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
}>;

export function buildSitemap(baseUrl: string, lastModified: Date): MetadataRoute.Sitemap {
  const root = baseUrl.replace(/\/+$/, "");
  return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: path === "/" ? root : `${root}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(site.url, new Date());
}
