"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getOrderResult, type OrderResult } from "@/lib/api";
import { reduceOrderPoll, type PollUiState } from "@/lib/orderPolling";
import { clearSession } from "@/lib/cartSession";
import { clearDraft } from "@/lib/storage";
import { getPlan } from "@/config/plans";
import { whatsappShareUrl } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { site } from "@/config/site";
import { PrimaryButton } from "@/components/create/ui";

type State = { kind: "loading" } | PollUiState;

const POLL_MS = 2500;
const POLL_TIMEOUT_MS = 20000;

export function OrderSuccessClient({ orderId }: { orderId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      let decision: ReturnType<typeof reduceOrderPoll>;
      try {
        const result = await getOrderResult(orderId);
        if (cancelled) return;
        const elapsed = Date.now() - (startRef.current ?? Date.now());
        decision = reduceOrderPoll({ ok: true, result }, elapsed, POLL_TIMEOUT_MS);
      } catch (err) {
        if (cancelled) return;
        const elapsed = Date.now() - (startRef.current ?? Date.now());
        decision = reduceOrderPoll({ ok: false, error: err }, elapsed, POLL_TIMEOUT_MS);
      }
      if (cancelled) return;
      setState(decision.state);
      // "keep_polling" só existe enquanto status === PENDING dentro do prazo —
      // nunca reagenda em erro/timeout/estado terminal (ver reduceOrderPoll).
      if (decision.action === "keep_polling") {
        timer = setTimeout(poll, POLL_MS);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderId, attempt]);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  if (state.kind === "loading") {
    return <Centered>Carregando…</Centered>;
  }

  if (state.kind === "error") {
    return (
      <Centered>
        <p className="text-vinho">{state.message}</p>
        <div className="mt-4 flex flex-col items-center gap-2">
          {state.retryable && <PrimaryButton onClick={retry}>Tentar novamente</PrimaryButton>}
          <Link href="/criar" className="text-sm text-vinho underline">
            Voltar
          </Link>
        </div>
      </Centered>
    );
  }

  if (state.kind === "pending_timeout") {
    const { cartId } = state.result.order;
    return (
      <Centered>
        <p className="text-grafite/70">
          Ainda não conseguimos confirmar seu pagamento. Sua cartinha e seu pedido foram salvos —
          você pode verificar novamente ou voltar mais tarde.
        </p>
        <div className="mt-4 flex flex-col items-center gap-2">
          <PrimaryButton onClick={retry}>Verificar novamente</PrimaryButton>
          <Link href={`/checkout/${cartId}`} className="text-sm text-vinho underline">
            Voltar
          </Link>
        </div>
      </Centered>
    );
  }

  const { order, cart, publicUrl, qrCodeDataUrl } = state.result;

  if (order.status === "PENDING") {
    return <Centered>Confirmando seu pagamento…</Centered>;
  }

  if (order.status === "PAID" && cart && publicUrl) {
    return <PaidView cart={cart} publicUrl={publicUrl} qrCodeDataUrl={qrCodeDataUrl} planType={order.planType} />;
  }

  return <FailedView status={order.status} cartId={order.cartId} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center text-grafite/60">{children}</div>
  );
}

function PaidView({
  cart,
  publicUrl,
  qrCodeDataUrl,
  planType,
}: {
  cart: NonNullable<OrderResult["cart"]>;
  publicUrl: string;
  qrCodeDataUrl: string | null;
  planType: "LIMITED" | "PERMANENT";
}) {
  const [copied, setCopied] = useState(false);
  const plan = getPlan(planType);
  const shareText = `Preparei uma cartinha especial para você 💌 ${publicUrl}`;

  useEffect(() => {
    if (qrCodeDataUrl) track("qr_code_viewed", {});
    // Compra concluída: encerra a sessão E o cache local de recuperação
    // (antero:draft é atualizado a cada autosave, inclusive desta carta já
    // publicada) para que "criar outra cartinha" comece realmente do zero,
    // sem herdar campos desta.
    clearSession();
    clearDraft();
  }, [qrCodeDataUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <div className="mb-4 text-5xl">🎉</div>
      <h1 className="text-2xl font-semibold text-vinho sm:text-3xl">
        Sua cartinha está pronta!
      </h1>
      <p className="mt-2 text-sm text-grafite/60">
        {cart.title ? `"${cart.title}" foi publicada.` : "Sua cartinha foi publicada."} Este é
        o link exclusivo — compartilhe com quem você quer surpreender.
      </p>

      {qrCodeDataUrl && (
        <div className="mt-6 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrCodeDataUrl}
            alt={`QR Code para abrir a cartinha em ${publicUrl}`}
            width={180}
            height={180}
            className="rounded-lg border border-rosa/30 bg-white p-2"
          />
          <a href={qrCodeDataUrl} download="cartinha-qrcode.png" className="text-xs text-vinho underline">
            Baixar QR Code
          </a>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-rosa/30 bg-white p-3">
        <p className="truncate text-sm text-grafite/70">{publicUrl}</p>
        <button
          onClick={copy}
          className="mt-2 w-full rounded-full bg-rosa-soft py-2 text-sm font-medium text-vinho transition hover:bg-rosa/40"
        >
          {copied ? "Link copiado ✓" : "Copiar link"}
        </button>
      </div>

      <p className="mt-3 text-xs text-grafite/50">
        {plan.durationDays
          ? `Disponível por ${plan.durationDays} dias.`
          : "Sem data para expirar."}{" "}
        Enviamos (modo demonstração) um e-mail de confirmação com o link e o QR Code.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <Link href={publicUrl.replace(site.url, "")} className="w-full">
          <PrimaryButton>Abrir a cartinha</PrimaryButton>
        </Link>
        <a
          href={whatsappShareUrl(shareText)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("whatsapp_share_clicked", { from: "success" })}
          className="rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-white shadow transition hover:brightness-105"
        >
          Compartilhar no WhatsApp
        </a>
      </div>
    </div>
  );
}

function FailedView({
  status,
  cartId,
}: {
  status: string;
  cartId: string;
}) {
  const label =
    status === "FAILED"
      ? "O pagamento não foi aprovado."
      : status === "EXPIRED"
        ? "O tempo para pagamento expirou."
        : "Não foi possível concluir o pedido.";

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="mb-3 text-4xl">😕</div>
      <p className="text-grafite/70">{label}</p>
      <Link href={`/checkout/${cartId}`} className="mt-4 inline-block text-vinho underline">
        Tentar novamente
      </Link>
    </div>
  );
}
