"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getOrderResult, ApiClientError, type OrderResult } from "@/lib/api";
import { getPlan } from "@/config/plans";
import { whatsappShareUrl } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { site } from "@/config/site";
import { PrimaryButton } from "@/components/create/ui";

type State =
  | { kind: "loading" }
  | { kind: "result"; result: OrderResult }
  | { kind: "error"; message: string };

const POLL_MS = 2500;
const POLL_TIMEOUT_MS = 20000;

export function OrderSuccessClient({ orderId }: { orderId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const result = await getOrderResult(orderId);
        if (cancelled) return;
        setState({ kind: "result", result });
        const elapsed = Date.now() - (startRef.current ?? Date.now());
        if (result.order.status === "PENDING" && elapsed < POLL_TIMEOUT_MS) {
          timer = setTimeout(poll, POLL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            err instanceof ApiClientError ? err.message : "Não foi possível consultar o pedido.",
        });
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderId]);

  if (state.kind === "loading") {
    return <Centered>Carregando…</Centered>;
  }
  if (state.kind === "error") {
    return (
      <Centered>
        <p className="text-vinho">{state.message}</p>
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
