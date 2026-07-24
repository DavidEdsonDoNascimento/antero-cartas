import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadSite() {
  const mod = await import("./site");
  return mod.site;
}

describe("site.url — validação em produção (D54)", () => {
  it("não valida com APP_ENV=local, mesmo com NODE_ENV=production (ex.: npm run build local)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    await expect(loadSite()).resolves.toMatchObject({ url: "http://localhost:3000" });
  });

  it("aceita URL https real com APP_ENV=production", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cartas.anterosistemas.com.br");
    await expect(loadSite()).resolves.toMatchObject({
      url: "https://cartas.anterosistemas.com.br",
    });
  });

  it("rejeita localhost com APP_ENV=production (mesmo com https)", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://localhost:3000");
    await expect(loadSite()).rejects.toThrow(/localhost/);
  });

  it("rejeita URL vazia com APP_ENV=production", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    await expect(loadSite()).rejects.toThrow(/vazia/);
  });

  it("rejeita URL malformada com APP_ENV=production", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "não-é-uma-url");
    await expect(loadSite()).rejects.toThrow(/malformada/);
  });

  it("rejeita protocolo não-https com APP_ENV=production", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://cartas.anterosistemas.com.br");
    await expect(loadSite()).rejects.toThrow(/https/);
  });
});
