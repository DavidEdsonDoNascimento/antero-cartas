// @vitest-environment jsdom
/**
 * Copy da tela de sucesso conforme o modo de pagamento.
 *
 * Existe por causa de um texto que prometia o que a tela não podia cumprir:
 * "Enviamos (modo demonstração) um e-mail de confirmação" aparecia fixo,
 * inclusive com PAYMENT_MODE=real. `OrderResult` não carrega o estado do
 * `EmailDelivery`, então o cliente não tem como saber se o e-mail saiu — em
 * modo real a frase é, ao mesmo tempo, falsa ("modo demonstração") e não
 * verificável ("enviamos").
 *
 * `flags` é lido no carregamento do módulo, então cada modo exige
 * `stubEnv` + `resetModules` + import dinâmico (mesmo padrão de flags.test.ts).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OrderResult } from "@/lib/api";

const getOrderResult = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getOrderResult: (...args: unknown[]) => getOrderResult(...args) };
});

// Analytics não é o objeto do teste e depende de env do navegador.
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const PAID_RESULT: OrderResult = {
  order: {
    id: "order_test",
    cartId: "cart_test",
    status: "PAID",
    planType: "LIMITED",
    amount: 2890,
    currency: "BRL",
    paidAt: "2026-08-15T12:00:00.000Z",
    createdAt: "2026-08-15T11:59:00.000Z",
  },
  cart: { id: "cart_test", title: "Para você", slug: "abc123" } as OrderResult["cart"],
  publicUrl: "https://exemplo.test/c/abc123",
  qrCodeDataUrl: "data:image/png;base64,iVBORw0KGgo=",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  getOrderResult.mockResolvedValue(PAID_RESULT);
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** Renderiza a tela já paga no modo pedido e devolve o texto visível. */
async function renderPaidScreen(mode: "mock" | "real"): Promise<string> {
  vi.stubEnv("NEXT_PUBLIC_PAYMENT_MODE", mode);
  vi.resetModules();
  const { OrderSuccessClient } = await import("./OrderSuccessClient");
  await act(async () => {
    root = createRoot(container);
    root.render(<OrderSuccessClient orderId="order_test" />);
  });
  return container.textContent ?? "";
}

describe("OrderSuccessClient — aviso de e-mail por modo de pagamento", () => {
  it("em modo mock, mantém o aviso explícito de demonstração", async () => {
    const text = await renderPaidScreen("mock");

    expect(text).toContain("Enviamos (modo demonstração) um e-mail de confirmação");
  });

  it("em modo real, não afirma demonstração nem envio de e-mail", async () => {
    const text = await renderPaidScreen("real");

    // A tela chegou ao estado publicado (senão as asserções abaixo passariam
    // por vacuidade, sem nunca renderizar o parágrafo em questão).
    expect(text).toContain("Sua cartinha está pronta!");

    expect(text).not.toContain("modo demonstração");
    expect(text).not.toContain("Enviamos");
    // Só o que a tela realmente pode sustentar.
    expect(text).toContain("Guarde o link e o QR Code acima");
  });
});

/**
 * Incidente de 2026-08-30: o cartão foi aprovado, mas a leitura da página de
 * sucesso caiu na janela em que Order já estava PAID e a carta ainda não
 * publicada — `cart`/`publicUrl` nulos. A tela caía em FailedView e mostrava
 * "Não foi possível concluir o pedido.", convidando a um perigoso "Tentar
 * novamente" sobre um pedido já pago. A causa raiz (duas escritas não
 * atômicas) foi corrigida em `finalizeOrderAsPaid`; esta é a rede de
 * segurança do lado do cliente para qualquer leitura que ainda assim
 * encontre esse estado transitório.
 */
describe("OrderSuccessClient — PAID sem publicUrl (incidente 2026-08-30)", () => {
  it("nunca renderiza FailedView nem link para o checkout — mostra que o pagamento foi confirmado", async () => {
    getOrderResult.mockResolvedValue({ ...PAID_RESULT, cart: null, publicUrl: null });

    const text = await renderPaidScreen("real");

    expect(text).not.toContain("Não foi possível concluir o pedido");
    expect(text).not.toContain("Tentar novamente");
    expect(text).toContain("Pagamento confirmado");
    expect(text).toMatch(/finaliz/i);
  });
});
