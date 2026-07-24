import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadPayment() {
  return import("./index");
}

describe("isMockConfirmationAllowed", () => {
  it("false em produção (ALLOW_MOCK_PAYMENT_CONFIRMATION ausente) — bloqueia o mock-confirm", async () => {
    vi.stubEnv("PAYMENT_MODE", "mock");
    vi.stubEnv("ALLOW_MOCK_PAYMENT_CONFIRMATION", "");
    const { isMockConfirmationAllowed } = await loadPayment();
    expect(isMockConfirmationAllowed()).toBe(false);
  });

  it("false mesmo com ALLOW_MOCK_PAYMENT_CONFIRMATION=true, se PAYMENT_MODE não for mock", async () => {
    vi.stubEnv("PAYMENT_MODE", "real");
    vi.stubEnv("ALLOW_MOCK_PAYMENT_CONFIRMATION", "true");
    const { isMockConfirmationAllowed } = await loadPayment();
    expect(isMockConfirmationAllowed()).toBe(false);
  });

  it("true em dev local, com as duas variáveis explicitamente habilitadas — publica via mock", async () => {
    vi.stubEnv("PAYMENT_MODE", "mock");
    vi.stubEnv("ALLOW_MOCK_PAYMENT_CONFIRMATION", "true");
    const { isMockConfirmationAllowed } = await loadPayment();
    expect(isMockConfirmationAllowed()).toBe(true);
  });

  it("false para qualquer valor diferente de 'true' (fail-closed)", async () => {
    vi.stubEnv("PAYMENT_MODE", "mock");
    vi.stubEnv("ALLOW_MOCK_PAYMENT_CONFIRMATION", "1");
    const { isMockConfirmationAllowed } = await loadPayment();
    expect(isMockConfirmationAllowed()).toBe(false);
  });
});

describe("getPaymentProvider", () => {
  it("só oferece o provider mock nesta fase", async () => {
    vi.stubEnv("PAYMENT_MODE", "mock");
    const { getPaymentProvider } = await loadPayment();
    expect(() => getPaymentProvider()).not.toThrow();
  });

  it("recusa modo 'real' — ainda não existe provedor real (Fase 3)", async () => {
    vi.stubEnv("PAYMENT_MODE", "real");
    const { getPaymentProvider } = await loadPayment();
    expect(() => getPaymentProvider()).toThrow(/mock/);
  });
});
