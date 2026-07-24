import { describe, it, expect, vi, afterEach } from "vitest";
import { getAppEnv, assertNotAccidentalProduction, assertPrismaCliAllowed } from "./appEnv";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAppEnv", () => {
  it("padrão é local quando ausente", () => {
    vi.stubEnv("APP_ENV", "");
    expect(getAppEnv()).toBe("local");
  });

  it("aceita production e test explicitamente", () => {
    vi.stubEnv("APP_ENV", "production");
    expect(getAppEnv()).toBe("production");
    vi.stubEnv("APP_ENV", "test");
    expect(getAppEnv()).toBe("test");
  });

  it("cai para local em valor desconhecido", () => {
    vi.stubEnv("APP_ENV", "staging");
    expect(getAppEnv()).toBe("local");
  });
});

describe("assertNotAccidentalProduction", () => {
  it("não bloqueia quando APP_ENV=local, independente de NODE_ENV", () => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertNotAccidentalProduction("teste")).not.toThrow();
  });

  it("bloqueia APP_ENV=production com NODE_ENV!=production (dev server)", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertNotAccidentalProduction("teste")).toThrow(/APP_ENV=production/);
  });

  it("não bloqueia APP_ENV=production com NODE_ENV=production (produção legítima)", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertNotAccidentalProduction("teste")).not.toThrow();
  });
});

describe("assertPrismaCliAllowed", () => {
  it("permite quando APP_ENV=local", () => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("ALLOW_PRISMA_CLI_PRODUCTION", "");
    expect(() => assertPrismaCliAllowed()).not.toThrow();
  });

  it("bloqueia APP_ENV=production sem confirmação explícita", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("ALLOW_PRISMA_CLI_PRODUCTION", "");
    expect(() => assertPrismaCliAllowed()).toThrow(/ALLOW_PRISMA_CLI_PRODUCTION/);
  });

  it("permite APP_ENV=production com confirmação explícita", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("ALLOW_PRISMA_CLI_PRODUCTION", "true");
    expect(() => assertPrismaCliAllowed()).not.toThrow();
  });
});
