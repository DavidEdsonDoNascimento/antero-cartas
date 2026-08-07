// @vitest-environment jsdom
/**
 * Testes de comportamento do painel de Pix, com render real em DOM.
 *
 * Cobrem os dois lados de um mesmo par de bugs que já apareceram no teste
 * manual em sandbox e que se contradizem se tratados isoladamente:
 *
 * 1. o efeito não pode disparar DOIS `createPixPayment` (duas cobranças reais
 *    no Mercado Pago — incidente de 2026-08-07, pedido cmsixlhc...);
 * 2. o efeito não pode PERDER a resposta da chamada em andamento (tela presa
 *    em "Gerando o código Pix…" para sempre).
 *
 * O ciclo setup → cleanup → setup do React Strict Mode é o que expõe os dois:
 * uma guarda ingênua contra (1) causa (2), e vice-versa. Por isso quase todo
 * teste aqui roda dentro de `<StrictMode>`.
 */
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OrderSummary, PixPaymentData } from "@/lib/api";

const createPixPayment = vi.fn();
const getOrderResult = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    createPixPayment: (...args: unknown[]) => createPixPayment(...args),
    getOrderResult: (...args: unknown[]) => getOrderResult(...args),
  };
});

// Analytics não é o objeto do teste e depende de env do navegador.
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const { PixPaymentPanel } = await import("./PixPaymentPanel");
const { ApiClientError } = await import("@/lib/api");

const ORDER: OrderSummary = {
  id: "order_test",
  cartId: "cart_test",
  status: "PENDING",
  planType: "PERMANENT",
  amount: 4890,
  currency: "BRL",
  paidAt: null,
  createdAt: "2026-08-07T17:39:05.794Z",
};

const PIX: PixPaymentData = {
  qrCode: "00020126-copia-e-cola",
  qrCodeBase64: "iVBORw0KGgoAAAANSUhEUg==",
  expiresAt: "2026-08-08T13:39:12.152-04:00",
};

/** Promise que o teste resolve/rejeita quando quiser, para controlar a corrida. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  // Sem isto o polling do painel dispararia timers reais durante os testes.
  vi.useFakeTimers();
  getOrderResult.mockResolvedValue({ order: ORDER, cart: null, publicUrl: null, qrCodeDataUrl: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function renderPanel(onDone = vi.fn(), strict = true) {
  const element = (
    <PixPaymentPanel order={ORDER} token="edit-token" onDone={onDone} />
  );
  act(() => {
    root.render(strict ? <StrictMode>{element}</StrictMode> : element);
  });
  return onDone;
}

/** Deixa as microtasks pendentes (handlers de Promise) rodarem. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function text() {
  return container.textContent ?? "";
}

describe("PixPaymentPanel — Strict Mode não pode duplicar nem perder o Pix", () => {
  it("mostra o QR Code quando a criação do Pix resolve, mesmo com o ciclo do Strict Mode", async () => {
    // O bug: no ciclo setup → cleanup → setup, o setup sobrevivente saía cedo
    // por causa da guarda de deduplicação e ninguém consumia a resposta — a
    // tela ficava em "Gerando o código Pix…" indefinidamente, apesar do 201.
    const pending = deferred<{ order: OrderSummary; pix: PixPaymentData }>();
    createPixPayment.mockReturnValue(pending.promise);

    renderPanel();
    expect(text()).toContain("Gerando o código Pix");

    pending.resolve({ order: ORDER, pix: PIX });
    await flush();

    expect(text()).not.toContain("Gerando o código Pix");
    expect(text()).toContain("Pague com Pix");
    expect(text()).toContain(PIX.qrCode);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(`data:image/png;base64,${PIX.qrCodeBase64}`);
  });

  it("dispara uma única chamada a createPixPayment no ciclo do Strict Mode", async () => {
    // O outro lado da moeda: é esta asserção que o incidente das duas
    // cobranças reais no Mercado Pago quebrava.
    const pending = deferred<{ order: OrderSummary; pix: PixPaymentData }>();
    createPixPayment.mockReturnValue(pending.promise);

    renderPanel();
    pending.resolve({ order: ORDER, pix: PIX });
    await flush();

    expect(createPixPayment).toHaveBeenCalledTimes(1);
    expect(createPixPayment).toHaveBeenCalledWith(ORDER.id, "edit-token");
  });

  it("mostra o erro da API sem ficar preso em 'Gerando o código Pix…'", async () => {
    const failing = deferred<{ order: OrderSummary; pix: PixPaymentData }>();
    createPixPayment.mockReturnValue(failing.promise);

    renderPanel();
    failing.reject(new ApiClientError("conflict", "Já existe uma criação de Pix em andamento.", 409));
    await flush();

    expect(text()).not.toContain("Gerando o código Pix");
    expect(text()).toContain("Já existe uma criação de Pix em andamento.");
    expect(text()).toContain("Tentar novamente");
    expect(createPixPayment).toHaveBeenCalledTimes(1);
  });

  it("'Tentar novamente' inicia de fato uma nova tentativa", async () => {
    // Bug pré-existente: o botão só trocava o estado para "creating", mas as
    // dependências do efeito não mudavam, então nada era disparado e a tela
    // ficava presa em "Gerando o código Pix…" para sempre.
    const failing = deferred<{ order: OrderSummary; pix: PixPaymentData }>();
    createPixPayment.mockReturnValueOnce(failing.promise);

    renderPanel();
    failing.reject(new ApiClientError("server", "Falha ao gerar o Pix.", 500));
    await flush();
    expect(text()).toContain("Tentar novamente");

    const retryOk = deferred<{ order: OrderSummary; pix: PixPaymentData }>();
    createPixPayment.mockReturnValueOnce(retryOk.promise);

    const button = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Tentar novamente"),
    );
    expect(button).toBeTruthy();
    act(() => button!.click());

    expect(createPixPayment).toHaveBeenCalledTimes(2);

    retryOk.resolve({ order: ORDER, pix: PIX });
    await flush();

    expect(text()).not.toContain("Gerando o código Pix");
    expect(text()).toContain(PIX.qrCode);
  });

  it("resposta que chega depois da desmontagem não atualiza mais nada", async () => {
    const late = deferred<{ order: OrderSummary; pix: PixPaymentData }>();
    createPixPayment.mockReturnValue(late.promise);

    renderPanel();
    act(() => root.unmount());

    // Não pode explodir com "update on unmounted component" nem tocar no DOM
    // já removido; a resposta simplesmente não tem mais destino.
    late.resolve({ order: ORDER, pix: PIX });
    await flush();

    expect(text()).toBe("");
    // Recria o root para o afterEach poder desmontar sem erro.
    root = createRoot(container);
  });

  it("uma tentativa que falhou não vaza sua Promise para a tentativa seguinte", async () => {
    // A Promise guardada para deduplicar precisa pertencer à tentativa que a
    // criou: reaproveitar uma Promise já rejeitada faria o retry falhar
    // instantaneamente, sem nem chamar o servidor.
    const failing = deferred<{ order: OrderSummary; pix: PixPaymentData }>();
    createPixPayment.mockReturnValueOnce(failing.promise);

    renderPanel();
    failing.reject(new ApiClientError("server", "Erro transitório.", 500));
    await flush();

    const second = deferred<{ order: OrderSummary; pix: PixPaymentData }>();
    createPixPayment.mockReturnValueOnce(second.promise);
    const button = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Tentar novamente"),
    );
    act(() => button!.click());

    // A segunda tentativa recebe uma Promise nova, não a rejeitada.
    second.resolve({ order: ORDER, pix: PIX });
    await flush();
    expect(text()).toContain(PIX.qrCode);
  });
});
