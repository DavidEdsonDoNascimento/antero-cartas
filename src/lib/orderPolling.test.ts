import { describe, it, expect } from "vitest";
import { ApiClientError } from "@/lib/api";
import { classifyOrderError, reduceOrderPoll, PollTimeoutError } from "./orderPolling";
import type { OrderResult } from "@/lib/api";

function pendingResult(): OrderResult {
  return {
    order: {
      id: "order-1",
      cartId: "cart-1",
      status: "PENDING",
      planType: "LIMITED",
      amount: 1890,
      currency: "BRL",
      paidAt: null,
      createdAt: new Date().toISOString(),
    },
    cart: null,
    publicUrl: null,
    qrCodeDataUrl: null,
  };
}

/** PAID já totalmente resolvido: Order aprovada E carta publicada. */
function paidResult(): OrderResult {
  return {
    ...pendingResult(),
    order: { ...pendingResult().order, status: "PAID" },
    cart: { id: "cart-1", title: "Carta de teste", slug: "abc123" } as OrderResult["cart"],
    publicUrl: "https://exemplo.test/c/abc123",
  };
}

/**
 * PAID mas ainda sem `publicUrl` — a janela (hoje só teórica, ver
 * finalizeOrderAsPaid) entre a Order aprovada e a publicação da carta
 * terminar. Nunca deve ser tratado como falha nem encerrar o polling antes
 * do prazo (incidente de 2026-08-30).
 */
function paidNotFinalizedResult(): OrderResult {
  return { ...pendingResult(), order: { ...pendingResult().order, status: "PAID" } };
}

describe("classifyOrderError", () => {
  it("400/401/403/404 não são retryable (problema de estado/autorização)", () => {
    for (const status of [400, 401, 403, 404] as const) {
      const { retryable } = classifyOrderError(new ApiClientError("x", "msg", status));
      expect(retryable, `status ${status}`).toBe(false);
    }
  });

  it("409 encerra o loading e não é retryable", () => {
    const { message, retryable } = classifyOrderError(new ApiClientError("conflict", "msg", 409));
    expect(retryable).toBe(false);
    expect(message).toBeTruthy();
  });

  it("429 é retryable", () => {
    expect(classifyOrderError(new ApiClientError("rate", "msg", 429)).retryable).toBe(true);
  });

  it("500/erros de servidor são retryable", () => {
    expect(classifyOrderError(new ApiClientError("server", "msg", 500)).retryable).toBe(true);
  });

  it("timeout é retryable e tem mensagem própria", () => {
    const { message, retryable } = classifyOrderError(new PollTimeoutError());
    expect(retryable).toBe(true);
    expect(message).toMatch(/demorou/);
  });

  it("falha de rede (erro genérico, não ApiClientError) é retryable", () => {
    const { retryable } = classifyOrderError(new TypeError("Failed to fetch"));
    expect(retryable).toBe(true);
  });

  it("resposta inválida (objeto desconhecido) é retryable, sem lançar", () => {
    expect(() => classifyOrderError({ weird: true })).not.toThrow();
  });
});

describe("reduceOrderPoll", () => {
  it("status PAID (com publicUrl) para o polling e devolve o resultado (não fica preso em PENDING)", () => {
    const decision = reduceOrderPoll({ ok: true, result: paidResult() }, 1000, 20000);
    expect(decision.action).toBe("stop");
    expect(decision.state.kind).toBe("result");
  });

  it("PAID sem publicUrl continua o polling (pagamento aprovado, publicação ainda em andamento — incidente de 2026-08-30)", () => {
    const decision = reduceOrderPoll({ ok: true, result: paidNotFinalizedResult() }, 1000, 20000);
    expect(decision.action).toBe("keep_polling");
    expect(decision.state.kind).toBe("result");
  });

  it("PAID sem publicUrl encerra o polling ao chegar no prazo, mas nunca vira pending_timeout (mensagem seria falsa: o pagamento já foi confirmado)", () => {
    const decision = reduceOrderPoll({ ok: true, result: paidNotFinalizedResult() }, 20000, 20000);
    expect(decision.action).toBe("stop");
    expect(decision.state.kind).toBe("result");
    if (decision.state.kind === "result") {
      expect(decision.state.result.order.status).toBe("PAID");
      expect(decision.state.result.publicUrl).toBeNull();
    }
  });

  it("PENDING dentro do prazo continua o polling", () => {
    const decision = reduceOrderPoll({ ok: true, result: pendingResult() }, 5000, 20000);
    expect(decision.action).toBe("keep_polling");
  });

  it("PENDING após o prazo para o polling com estado pending_timeout (não erro, não loop infinito)", () => {
    const decision = reduceOrderPoll({ ok: true, result: pendingResult() }, 20000, 20000);
    expect(decision.action).toBe("stop");
    expect(decision.state.kind).toBe("pending_timeout");
  });

  it("erro de rede/timeout encerra o loading com estado de erro retryable", () => {
    const decision = reduceOrderPoll({ ok: false, error: new PollTimeoutError() }, 500, 20000);
    expect(decision.action).toBe("stop");
    expect(decision.state).toMatchObject({ kind: "error", retryable: true });
  });

  it("erro 409 (ou equivalente) encerra o loading sem reagendar novo poll", () => {
    const decision = reduceOrderPoll(
      { ok: false, error: new ApiClientError("conflict", "msg", 409) },
      500,
      20000,
    );
    expect(decision.action).toBe("stop");
    expect(decision.state).toMatchObject({ kind: "error", retryable: false });
  });

  it("nunca perde os dados do pedido/carta ao chegar num estado terminal com sucesso", () => {
    const result = paidResult();
    const decision = reduceOrderPoll({ ok: true, result }, 1000, 20000);
    expect(decision.state).toMatchObject({ kind: "result", result });
  });
});
