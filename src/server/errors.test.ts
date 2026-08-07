import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, jsonError, jsonOk } from "./errors";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Silencia o log real e devolve o espião para inspeção. */
function spyOnConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("jsonError — erro esperado do domínio (ApiError)", () => {
  it("preserva código, mensagem e status do ApiError", async () => {
    spyOnConsoleError();
    const res = jsonError(new ApiError("conflict", "Já existe uma criação de Pix em andamento."));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: { code: "conflict", message: "Já existe uma criação de Pix em andamento." },
    });
  });

  it("um ApiError de código server continua com a SUA mensagem, não a genérica", async () => {
    // Distinção que já custou caro em diagnóstico: os dois respondem 500, mas
    // só o ramo genérico usa "Erro interno. Tente novamente.". A mensagem é o
    // que permite saber, pela resposta, qual dos dois caminhos ocorreu.
    spyOnConsoleError();
    const res = jsonError(new ApiError("server", "O provedor não retornou os dados do Pix."));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: { code: "server", message: "O provedor não retornou os dados do Pix." },
    });
  });

  it("não polui o log do servidor com erro esperado", () => {
    const spy = spyOnConsoleError();
    jsonError(new ApiError("not_found", "Pedido não encontrado."));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("jsonError — erro não previsto", () => {
  it("devolve 500 genérico sem vazar a mensagem original", async () => {
    spyOnConsoleError();
    const res = jsonError(new Error("Mercado Pago recusou a requisição: token inválido ABC123"));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: { code: "server", message: "Erro interno. Tente novamente." } });
    // Nada do detalhe interno pode alcançar o navegador.
    expect(JSON.stringify(body)).not.toContain("Mercado Pago");
    expect(JSON.stringify(body)).not.toContain("ABC123");
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("registra a exceção original no servidor, com prefixo e o erro inteiro", () => {
    const spy = spyOnConsoleError();
    const original = new Error("Mercado Pago recusou a requisição: invalid notification_url");

    jsonError(original);

    expect(spy).toHaveBeenCalledTimes(1);
    const [prefix, logged] = spy.mock.calls[0];
    expect(prefix).toBe("[api] erro não tratado");
    // O objeto de erro inteiro (com stack) vai para o log, não uma string
    // achatada — é o que permite rastrear a origem no terminal.
    expect(logged).toBe(original);
  });

  it("registra também o que não é Error (throw de string, rejeição de valor cru)", () => {
    const spy = spyOnConsoleError();
    jsonError("falha crua");

    expect(spy).toHaveBeenCalledWith("[api] erro não tratado", "falha crua");
  });
});

describe("jsonOk", () => {
  it("responde com o corpo e sem cache", async () => {
    const res = jsonOk({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
