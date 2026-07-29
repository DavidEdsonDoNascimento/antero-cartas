import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadEmail() {
  return import("./index");
}

describe("getEmailProvider", () => {
  it("modo mock (padrão) devolve o provider mock", async () => {
    vi.stubEnv("EMAIL_MODE", "");
    const { getEmailProvider } = await loadEmail();
    expect(getEmailProvider().name).toBe("mock");
  });

  it("modo real devolve o provider Resend (task 013)", async () => {
    vi.stubEnv("EMAIL_MODE", "real");
    const { getEmailProvider } = await loadEmail();
    expect(getEmailProvider().name).toBe("resend");
  });

  it("qualquer valor diferente de 'real' cai para mock (fail-safe)", async () => {
    vi.stubEnv("EMAIL_MODE", "banana");
    const { getEmailProvider } = await loadEmail();
    expect(getEmailProvider().name).toBe("mock");
  });
});
