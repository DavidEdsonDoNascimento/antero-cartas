import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadBuildPublicCartUrl() {
  const mod = await import("./publicUrl");
  return mod.buildPublicCartUrl;
}

describe("buildPublicCartUrl", () => {
  it("monta a URL local em desenvolvimento", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    const buildPublicCartUrl = await loadBuildPublicCartUrl();
    expect(buildPublicCartUrl("abc123")).toBe("http://localhost:3000/c/abc123");
  });

  it("monta a URL pública em produção, sem localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cartas.anterosistemas.com.br");
    const buildPublicCartUrl = await loadBuildPublicCartUrl();
    const url = buildPublicCartUrl("abc123");
    expect(url).toBe("https://cartas.anterosistemas.com.br/c/abc123");
    expect(url).not.toContain("localhost");
  });

  it("preserva o slug exato, sem alterar", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cartas.anterosistemas.com.br");
    const buildPublicCartUrl = await loadBuildPublicCartUrl();
    const slug = "un4kti2qr8tcugfb34zsyvjxp";
    expect(buildPublicCartUrl(slug)).toBe(`https://cartas.anterosistemas.com.br/c/${slug}`);
  });

  it("nunca duplica a barra, mesmo se NEXT_PUBLIC_SITE_URL terminar com /", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cartas.anterosistemas.com.br/");
    const buildPublicCartUrl = await loadBuildPublicCartUrl();
    expect(buildPublicCartUrl("abc123")).toBe("https://cartas.anterosistemas.com.br/c/abc123");
  });

  it("não tem parâmetro para token de edição ou dados pessoais — só aceita o slug", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cartas.anterosistemas.com.br");
    const buildPublicCartUrl = await loadBuildPublicCartUrl();
    expect(buildPublicCartUrl.length).toBe(1);
  });
});
