"use client";

import { useEffect, useRef, useState } from "react";
import { createCardPayment, ApiClientError, type OrderSummary } from "@/lib/api";
import { track } from "@/lib/analytics";

/**
 * Cartão via Payment Brick do Mercado Pago (task 013, seção 11). O SDK é
 * carregado por tag <script>, não como dependência do projeto — só ele sabe
 * tokenizar o cartão com segurança; o número/CVV nunca chegam a este código
 * nem ao servidor, só o token que o próprio Brick gera.
 *
 * `onSubmit` manda o token para `/api/orders/[id]/payments/card`. A resposta
 * síncrona é só feedback de UX (recusado / aguardando) — a carta só é
 * publicada quando o webhook confirmar (ver PaymentProvider/orderService).
 */
const SDK_SRC = "https://sdk.mercadopago.com/js/v2";
const BRICK_CONTAINER_ID = "mp-card-payment-brick";

interface CardBrickFormData {
  token: string;
  installments: number;
  payment_method_id: string;
  issuer_id?: string;
}

interface MercadoPagoBrickController {
  unmount: () => void;
}

interface MercadoPagoInstance {
  bricks: () => {
    create: (
      brickType: string,
      containerId: string,
      settings: Record<string, unknown>,
    ) => Promise<MercadoPagoBrickController>;
  };
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MercadoPagoInstance;
  }
}

function loadMercadoPagoSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("sdk_load_failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("sdk_load_failed"));
    document.body.appendChild(script);
  });
}

type State =
  | { step: "loading" }
  | { step: "ready" }
  | { step: "submitting" }
  | { step: "rejected"; message: string }
  | { step: "error"; message: string };

export function CardPaymentPanel({
  order,
  token,
  onDone,
}: {
  order: OrderSummary;
  token: string;
  onDone: (orderId: string) => void;
}) {
  const [state, setState] = useState<State>({ step: "loading" });
  const brickRef = useRef<MercadoPagoBrickController | null>(null);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (!publicKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ step: "error", message: "Pagamento por cartão indisponível no momento." });
      return;
    }

    let cancelled = false;
    loadMercadoPagoSdk()
      .then(async () => {
        if (cancelled || !window.MercadoPago) return;
        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        const brick = await mp.bricks().create("cardPayment", BRICK_CONTAINER_ID, {
          initialization: { amount: order.amount / 100 },
          callbacks: {
            onReady: () => {
              if (!cancelled) setState({ step: "ready" });
            },
            onSubmit: (formData: CardBrickFormData) =>
              new Promise<void>((resolve) => {
                setState({ step: "submitting" });
                createCardPayment(order.id, token, {
                  token: formData.token,
                  installments: formData.installments,
                  paymentMethodId: formData.payment_method_id,
                  issuerId: formData.issuer_id,
                })
                  .then((result) => {
                    if (cancelled) {
                      resolve();
                      return;
                    }
                    if (result.status === "failed") {
                      track("payment_failed", { method: "card" });
                      setState({ step: "rejected", message: "Pagamento recusado. Tente outro cartão." });
                      resolve();
                      return;
                    }
                    track("payment_pending", { method: "card" });
                    onDone(order.id);
                    resolve();
                  })
                  .catch((err) => {
                    if (cancelled) {
                      resolve();
                      return;
                    }
                    setState({
                      step: "error",
                      message:
                        err instanceof ApiClientError
                          ? err.message
                          : "Não foi possível processar o pagamento.",
                    });
                    resolve();
                  });
              }),
            onError: () => {
              if (!cancelled) {
                setState({ step: "error", message: "Não foi possível carregar o pagamento por cartão." });
              }
            },
          },
        });
        if (cancelled) {
          brick.unmount();
          return;
        }
        brickRef.current = brick;
      })
      .catch(() => {
        if (!cancelled) {
          setState({ step: "error", message: "Não foi possível carregar o pagamento por cartão." });
        }
      });

    return () => {
      cancelled = true;
      brickRef.current?.unmount();
      brickRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.amount, token]);

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-center text-2xl font-semibold text-vinho">Pague com cartão</h1>
      {state.step === "loading" && (
        <p className="mt-4 text-center text-sm text-grafite/60">Carregando formulário de pagamento…</p>
      )}
      {state.step === "submitting" && (
        <p className="mt-4 text-center text-sm text-grafite/60">Processando pagamento…</p>
      )}
      {(state.step === "rejected" || state.step === "error") && (
        <p className="mt-4 text-center text-sm text-vinho">{state.message}</p>
      )}
      <div id={BRICK_CONTAINER_ID} className="mt-4" />
    </div>
  );
}
