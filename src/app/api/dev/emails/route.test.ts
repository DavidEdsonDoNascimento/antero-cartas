import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function callRoute(): Promise<Response> {
  const { GET } = await import("./route");
  return GET(new Request("https://cartas.anterosistemas.com.br/api/dev/emails"));
}

describe("/api/dev/emails — bloqueio (task 011, seção 9.5)", () => {
  it("responde 404 em produção, como se a rota não existisse", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await callRoute();
    expect(res.status).toBe(404);
  });

  it("bloqueia em produção mesmo com DEV_EMAILS_ENABLED=true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_EMAILS_ENABLED", "true");
    expect((await callRoute()).status).toBe(404);
  });

  it("não confirma a existência do visualizador na mensagem de produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const body = (await (await callRoute()).json()) as { error: { message: string } };
    expect(body.error.message).not.toMatch(/e-mail|visualizador|desativad/i);
  });

  it("fora de produção, DEV_EMAILS_ENABLED=false devolve mensagem útil ao desenvolvedor", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EMAILS_ENABLED", "false");
    const res = await callRoute();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/desativado/i);
  });
});
