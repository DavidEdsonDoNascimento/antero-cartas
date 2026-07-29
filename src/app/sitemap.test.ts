import { describe, it, expect } from "vitest";
import { buildSitemap, PUBLIC_ROUTES } from "./sitemap";

const LAST_MODIFIED = new Date("2026-07-29T12:00:00.000Z");

describe("sitemap", () => {
  it("usa o domínio público em todas as URLs", () => {
    const entries = buildSitemap("https://cartas.anterosistemas.com.br", LAST_MODIFIED);
    for (const entry of entries) {
      expect(entry.url.startsWith("https://cartas.anterosistemas.com.br")).toBe(true);
    }
  });

  it("não expõe rota privada (carta, pedido, checkout) nem página noindex", () => {
    const urls = buildSitemap("https://cartas.anterosistemas.com.br", LAST_MODIFIED).map(
      (entry) => entry.url,
    );
    for (const forbidden of ["/c/", "/pedido/", "/checkout/", "/privacidade", "/termos"]) {
      expect(urls.some((url) => url.includes(forbidden))).toBe(false);
    }
  });

  it("não gera barra duplicada, inclusive com base terminada em barra", () => {
    const urls = buildSitemap("https://cartas.anterosistemas.com.br/", LAST_MODIFIED).map(
      (entry) => entry.url,
    );
    for (const url of urls) {
      expect(url.replace("https://", "")).not.toContain("//");
    }
    expect(urls).toContain("https://cartas.anterosistemas.com.br");
  });

  it("lista exatamente as rotas públicas declaradas, sem repetição", () => {
    const urls = buildSitemap("https://cartas.anterosistemas.com.br", LAST_MODIFIED).map(
      (entry) => entry.url,
    );
    expect(urls).toHaveLength(PUBLIC_ROUTES.length);
    expect(new Set(urls).size).toBe(PUBLIC_ROUTES.length);
    expect(urls).toEqual([
      "https://cartas.anterosistemas.com.br",
      "https://cartas.anterosistemas.com.br/criar",
      "https://cartas.anterosistemas.com.br/demonstracao",
    ]);
  });

  it("propaga lastModified e mantém prioridade decrescente a partir da home", () => {
    const entries = buildSitemap("https://cartas.anterosistemas.com.br", LAST_MODIFIED);
    expect(entries[0].priority).toBe(1);
    for (const entry of entries) {
      expect(entry.lastModified).toBe(LAST_MODIFIED);
      expect(entry.priority).toBeGreaterThan(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });
});
