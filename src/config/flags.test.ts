import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadFlags() {
  const mod = await import("./flags");
  return mod.flags;
}

describe("flags.MOCK_PAYMENT_CONFIRMATION_ENABLED", () => {
  it("padrão é false quando a variável está ausente (produção sem configuração)", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION", "");
    const flags = await loadFlags();
    expect(flags.MOCK_PAYMENT_CONFIRMATION_ENABLED).toBe(false);
  });

  it("true quando explicitamente habilitada (dev local)", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION", "true");
    const flags = await loadFlags();
    expect(flags.MOCK_PAYMENT_CONFIRMATION_ENABLED).toBe(true);
  });

  it("false para qualquer valor que não seja 'true'/'1' (fail-closed)", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION", "false");
    expect((await loadFlags()).MOCK_PAYMENT_CONFIRMATION_ENABLED).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_ALLOW_MOCK_PAYMENT_CONFIRMATION", "yes");
    vi.resetModules();
    expect((await loadFlags()).MOCK_PAYMENT_CONFIRMATION_ENABLED).toBe(false);
  });
});
