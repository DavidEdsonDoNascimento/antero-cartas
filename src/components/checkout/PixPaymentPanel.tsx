"use client";

import { useEffect, useRef, useState } from "react";
import {
  createPixPayment,
  ApiClientError,
  type OrderSummary,
  type PixPaymentData,
} from "@/lib/api";
import { getOrderResult } from "@/lib/api";
import { reduceOrderPoll } from "@/lib/orderPolling";
import { track } from "@/lib/analytics";
import { PrimaryButton } from "@/components/create/ui";

const POLL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // Pix costuma cair em segundos; 5 min cobre folga real.

type State =
  | { step: "creating" }
  | { step: "pending"; order: OrderSummary; pix: PixPaymentData }
  | { step: "timeout"; order: OrderSummary; pix: PixPaymentData }
  | { step: "error"; message: string; retryable: boolean };

/**
 * Pix (task 013, seção 11): QR Code, copia-e-cola, validade, polling limitado
 * — nunca infinito. A publicação da carta nunca depende deste polling; é só
 * feedback de UX. O webhook é a única fonte de verdade (ver
 * `orderService.applyMercadoPagoWebhook`).
 */
export function PixPaymentPanel({
  order,
  token,
  onDone,
}: {
  order: OrderSummary;
  token: string;
  onDone: (orderId: string) => void;
}) {
  const [state, setState] = useState<State>({ step: "creating" });
  const startRef = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);
  // Guarda contra o duplo-disparo do efeito em desenvolvimento (React
  // Strict Mode remonta o efeito uma vez de propósito: monta, desmonta,
  // monta de novo). A limpeza abaixo só impede o setState da primeira
  // chamada — não cancela a requisição HTTP em si — então sem esta guarda a
  // segunda montagem dispararia uma SEGUNDA criação de Pix real no servidor.
  // O ref sobrevive ao par desmonta/monta do Strict Mode (mesma instância do
  // componente), mas é recriado numa montagem genuinamente nova (ex.: o
  // usuário volta e escolhe Pix de novo) para permitir uma tentativa nova. A
  // proteção definitiva contra duplicidade é do servidor
  // (claimOrReusePixAttempt em orderService.ts) — esta guarda só evita
  // desperdiçar uma chamada ao provedor que o servidor teria descartado.
  const requestedForRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${order.id}:${token}`;
    if (requestedForRef.current === key) return;
    requestedForRef.current = key;

    let cancelled = false;
    createPixPayment(order.id, token)
      .then(({ order: updated, pix }) => {
        if (cancelled) return;
        startRef.current = Date.now();
        track("payment_pending", { method: "pix" });
        setState({ step: "pending", order: updated, pix });
      })
      .catch((err) => {
        if (cancelled) return;
        requestedForRef.current = null; // permite tentar de novo (ver "Tentar novamente")
        setState({
          step: "error",
          message: err instanceof ApiClientError ? err.message : "Não foi possível gerar o Pix.",
          retryable: true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [order.id, token]);

  useEffect(() => {
    if (state.step !== "pending") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (state.step !== "pending") return;
      let decision: ReturnType<typeof reduceOrderPoll>;
      try {
        const result = await getOrderResult(order.id);
        if (cancelled) return;
        const elapsed = Date.now() - (startRef.current ?? Date.now());
        decision = reduceOrderPoll({ ok: true, result }, elapsed, POLL_TIMEOUT_MS);
      } catch (err) {
        if (cancelled) return;
        const elapsed = Date.now() - (startRef.current ?? Date.now());
        decision = reduceOrderPoll({ ok: false, error: err }, elapsed, POLL_TIMEOUT_MS);
      }
      if (cancelled) return;

      if (decision.state.kind === "result" && decision.state.result.order.status !== "PENDING") {
        onDone(order.id);
        return;
      }
      if (decision.action === "keep_polling") {
        timer = setTimeout(poll, POLL_MS);
        return;
      }
      if (decision.state.kind === "pending_timeout") {
        setState({ step: "timeout", order, pix: (state as Extract<State, { step: "pending" }>).pix });
        return;
      }
      if (decision.state.kind === "error") {
        setState({ step: "error", message: decision.state.message, retryable: decision.state.retryable });
      }
    }
    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step === "pending", order.id]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }

  if (state.step === "creating") {
    return <Centered>Gerando o código Pix…</Centered>;
  }

  if (state.step === "error") {
    return (
      <Centered>
        <p className="text-vinho">{state.message}</p>
        {state.retryable && (
          <PrimaryButton onClick={() => setState({ step: "creating" })}>
            Tentar novamente
          </PrimaryButton>
        )}
      </Centered>
    );
  }

  if (state.step === "timeout") {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-grafite/70">
          Ainda não recebemos a confirmação do seu Pix. Se você já pagou, pode levar mais alguns
          instantes — verifique novamente.
        </p>
        <div className="mt-4">
          <PrimaryButton
            onClick={() => {
              startRef.current = Date.now();
              setState({ step: "pending", order: state.order, pix: state.pix });
            }}
          >
            Verificar novamente
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const { pix } = state;

  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center">
      <div className="mb-3 text-4xl">💠</div>
      <h1 className="text-2xl font-semibold text-vinho">Pague com Pix</h1>
      <p className="mt-2 text-sm text-grafite/60">
        Escaneie o QR Code com o app do seu banco ou copie o código abaixo.
      </p>

      {pix.qrCodeBase64 && (
        <div className="mt-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${pix.qrCodeBase64}`}
            alt="QR Code do Pix"
            width={220}
            height={220}
            className="rounded-lg border border-rosa/30 bg-white p-2"
          />
        </div>
      )}

      {pix.qrCode && (
        <div className="mt-4 rounded-xl border border-rosa/30 bg-white p-3">
          <p className="truncate text-xs text-grafite/60">{pix.qrCode}</p>
          <button
            onClick={() => copy(pix.qrCode)}
            className="mt-2 w-full rounded-full bg-rosa-soft py-2 text-sm font-medium text-vinho transition hover:bg-rosa/40"
          >
            {copied ? "Código copiado ✓" : "Copiar código Pix"}
          </button>
        </div>
      )}

      {pix.expiresAt && (
        <p className="mt-3 text-xs text-grafite/50">
          Válido até {new Date(pix.expiresAt).toLocaleTimeString("pt-BR")}.
        </p>
      )}

      <p className="mt-4 text-sm text-grafite/60">Aguardando confirmação do pagamento…</p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-24 text-center text-grafite/60">{children}</div>;
}
