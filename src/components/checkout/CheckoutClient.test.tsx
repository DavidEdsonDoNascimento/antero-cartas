// @vitest-environment jsdom
/**
 * Copy do checkout conforme o modo de pagamento.
 *
 * Existe por causa de um aviso fixo — "Modo demonstração: nenhuma cobrança
 * real será feita nesta etapa" — que era renderizado no formulário do pedido
 * independentemente de `PAYMENT_MODE`. Como o formulário vem ANTES da
 * bifurcação mock/real do painel de pagamento, com PAYMENT_MODE=real o cliente
 * lia que não seria cobrado e era cobrado de verdade logo em seguida.
 *
 * `flags` é lido no carregamento do módulo, então cada modo exige
 * `stubEnv` + `resetModules` + import dinâmico (mesmo padrão de flags.test.ts).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Cart } from "@/lib/types";

const fetchCart = vi.fn();
const loadSession = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, fetchCart: (...args: unknown[]) => fetchCart(...args) };
});

vi.mock("@/lib/cartSession", () => ({
  loadSession: () => loadSession(),
  clearSession: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

// O checkout usa o router só na navegação pós-pagamento, fora deste teste.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const CART = {
  id: "cart_test",
  title: "Para você",
  planType: "LIMITED",
} as Cart;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  loadSession.mockReturnValue({ cartId: "cart_test", editToken: "tok_test" });
  fetchCart.mockResolvedValue({ cart: CART });
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** Renderiza o formulário do checkout no modo pedido e devolve o texto visível. */
async function renderCheckoutForm(mode: "mock" | "real"): Promise<string> {
  vi.stubEnv("NEXT_PUBLIC_PAYMENT_MODE", mode);
  vi.resetModules();
  const { CheckoutClient } = await import("./CheckoutClient");
  await act(async () => {
    root = createRoot(container);
    root.render(<CheckoutClient cartId="cart_test" />);
  });
  return container.textContent ?? "";
}

describe("CheckoutClient — aviso de cobrança por modo de pagamento", () => {
  it("em modo mock, mantém o aviso de que nenhuma cobrança real será feita", async () => {
    const text = await renderCheckoutForm("mock");

    expect(text).toContain("Modo demonstração: nenhuma cobrança real será feita nesta etapa.");
  });

  it("em modo real, nunca promete ausência de cobrança nem cita demonstração", async () => {
    const text = await renderCheckoutForm("real");

    // O formulário realmente renderizou (senão as negativas abaixo passariam
    // por vacuidade, sem nunca exibir o aviso em questão).
    expect(text).toContain("Seu pedido");

    expect(text).not.toContain("modo demonstração");
    expect(text).not.toContain("Modo demonstração");
    expect(text).not.toContain("nenhuma cobrança real");
    expect(text).not.toContain("Nenhuma cobrança");
    // Diz a verdade sobre o que vai acontecer.
    expect(text).toContain("Seu pagamento será processado com segurança pelo Mercado Pago.");
  });
});
