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
  it("modo mock devolve o provider mock", async () => {
    vi.stubEnv("PAYMENT_MODE", "mock");
    const { getPaymentProvider } = await loadPayment();
    expect(getPaymentProvider().name).toBe("mock");
  });

  it("modo real devolve o provider Mercado Pago (task 013)", async () => {
    vi.stubEnv("PAYMENT_MODE", "real");
    const { getPaymentProvider } = await loadPayment();
    expect(getPaymentProvider().name).toBe("mercadopago");
  });

  it("PAYMENT_MODE ausente cai para mock (padrão preservado)", async () => {
    const { getPaymentProvider } = await loadPayment();
    const original = process.env.PAYMENT_MODE;
    delete process.env.PAYMENT_MODE;
    try {
      expect(getPaymentProvider().name).toBe("mock");
    } finally {
      if (original !== undefined) process.env.PAYMENT_MODE = original;
    }
  });

  /**
   * Antes um valor inválido virava "mock" silenciosamente ("fail-safe"), o
   * que transformava um typo em PAYMENT_MODE numa loja incapaz de cobrar sem
   * nenhum sinal. Agora é erro de configuração explícito.
   */
  it("valor inválido lança em vez de cair para mock silenciosamente", async () => {
    vi.stubEnv("PAYMENT_MODE", "banana");
    const { getPaymentProvider, getPaymentMode } = await loadPayment();
    expect(() => getPaymentMode()).toThrow(/PAYMENT_MODE/);
    expect(() => getPaymentProvider()).toThrow(/valor inválido/i);
  });
});
