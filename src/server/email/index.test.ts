import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadEmail() {
  return import("./index");
}

describe("getEmailProvider", () => {
  it("mock válido devolve o provider mock", async () => {
    vi.stubEnv("EMAIL_MODE", "mock");
    const { getEmailProvider } = await loadEmail();
    expect(getEmailProvider().name).toBe("mock");
  });

  it("real válido devolve o provider Resend (task 013)", async () => {
    vi.stubEnv("EMAIL_MODE", "real");
    const { getEmailProvider } = await loadEmail();
    expect(getEmailProvider().name).toBe("resend");
  });

  it("variável ausente lança erro de configuração, sem padrão implícito", async () => {
    vi.stubEnv("EMAIL_MODE", undefined);
    const { getEmailProvider } = await loadEmail();
    expect(() => getEmailProvider()).toThrow(/não está definida/i);
  });

  it("string vazia lança erro de configuração", async () => {
    vi.stubEnv("EMAIL_MODE", "");
    const { getEmailProvider } = await loadEmail();
    expect(() => getEmailProvider()).toThrow(/valor inválido/i);
  });

  it("erro de digitação lança — nunca vira mock silenciosamente", async () => {
    vi.stubEnv("EMAIL_MODE", "reall");
    const { getEmailProvider } = await loadEmail();
    expect(() => getEmailProvider()).toThrow(/valor inválido/i);
  });

  it("valor desconhecido lança", async () => {
    vi.stubEnv("EMAIL_MODE", "banana");
    const { getEmailProvider } = await loadEmail();
    expect(() => getEmailProvider()).toThrow(/valor inválido/i);
  });
});
