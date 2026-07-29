"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Cart } from "@/lib/types";
import { loadSession } from "@/lib/cartSession";
import { fetchCart, createOrder, mockConfirm, ApiClientError, type OrderSummary } from "@/lib/api";
import { getPlan, formatBRL } from "@/config/plans";
import { LIMITS } from "@/lib/limits";
import { site } from "@/config/site";
import { flags } from "@/config/flags";
import { track } from "@/lib/analytics";
import { PrimaryButton } from "@/components/create/ui";
import { PixPaymentPanel } from "@/components/checkout/PixPaymentPanel";
import { CardPaymentPanel } from "@/components/checkout/CardPaymentPanel";

type State =
  | { step: "loading" }
  | { step: "session_mismatch" }
  | { step: "form"; cart: Cart; token: string }
  | { step: "paying"; cart: Cart; token: string; order: OrderSummary }
  | { step: "confirming"; order: OrderSummary }
  | { step: "error"; message: string };

export function CheckoutClient({ cartId }: { cartId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "loading" });

  // Leitura de localStorage/fetch só existe no cliente, após a montagem.
  useEffect(() => {
    const session = loadSession();
    if (!session || session.cartId !== cartId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ step: "session_mismatch" });
      return;
    }
    fetchCart(cartId, session.editToken)
      .then(({ cart }) => setState({ step: "form", cart, token: session.editToken }))
      .catch((err) => {
        setState({
          step: "error",
          message:
            err instanceof ApiClientError
              ? err.message
              : "Não foi possível carregar sua cartinha.",
        });
      });
  }, [cartId]);

  if (state.step === "loading") {
    return <Centered>Carregando…</Centered>;
  }

  if (state.step === "session_mismatch") {
    return (
      <Centered>
        <p className="text-grafite/70">
          Não conseguimos localizar esta cartinha neste navegador. Isso acontece se você
          abriu o link em outro dispositivo — nesta versão, a edição funciona apenas no
          navegador onde a cartinha foi criada.
        </p>
        <Link href="/criar" className="mt-4 inline-block text-vinho underline">
          Criar uma nova cartinha
        </Link>
      </Centered>
    );
  }

  if (state.step === "error") {
    return (
      <Centered>
        <p className="text-vinho">{state.message}</p>
        <Link href="/criar" className="mt-4 inline-block text-vinho underline">
          Voltar para a criação
        </Link>
      </Centered>
    );
  }

  if (state.step === "form") {
    return (
      <CheckoutForm
        cart={state.cart}
        token={state.token}
        onOrderCreated={(order) =>
          setState({ step: "paying", cart: state.cart, token: state.token, order })
        }
      />
    );
  }

  if (state.step === "paying") {
    if (flags.PAYMENT_MODE === "real") {
      return (
        <RealPaymentPanel
          order={state.order}
          token={state.token}
          onBack={() => setState({ step: "form", cart: state.cart, token: state.token })}
          onDone={(orderId) => router.push(`/pedido/${orderId}/sucesso`)}
        />
      );
    }
    if (!flags.MOCK_PAYMENT_CONFIRMATION_ENABLED) {
      return (
        <PaymentUnavailablePanel
          onBack={() => setState({ step: "form", cart: state.cart, token: state.token })}
        />
      );
    }
    return (
      <MockPaymentPanel
        order={state.order}
        onConfirming={() => setState({ step: "confirming", order: state.order })}
        onDone={(orderId) => router.push(`/pedido/${orderId}/sucesso`)}
      />
    );
  }

  return <Centered>Confirmando pagamento…</Centered>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      {typeof children === "string" ? (
        <p className="text-grafite/60">{children}</p>
      ) : (
        children
      )}
    </div>
  );
}

function CheckoutForm({
  cart,
  token,
  onOrderCreated,
}: {
  cart: Cart;
  token: string;
  onOrderCreated: (order: OrderSummary) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = cart.planType ? getPlan(cart.planType) : null;
  const canSubmit =
    !!plan && name.trim().length > 0 && /\S+@\S+\.\S+/.test(email) && acceptTerms && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setSubmitting(true);
    setError(null);
    try {
      const { order } = await createOrder(token, {
        cartId: cart.id,
        planType: plan.type,
        customerName: name.trim(),
        customerEmail: email.trim(),
        customerPhone: phone.trim() || undefined,
        acceptTerms: true,
      });
      track("payment_created", { plan: plan.type });
      onOrderCreated(order);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Não foi possível criar o pedido.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!plan) {
    return (
      <Centered>
        <p className="text-grafite/70">Nenhum plano foi selecionado.</p>
        <Link href="/criar" className="mt-4 inline-block text-vinho underline">
          Voltar e escolher um plano
        </Link>
      </Centered>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Link href="/" className="text-sm font-medium text-vinho">
        ← {site.name}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-vinho sm:text-3xl">Seu pedido</h1>

      <div className="mt-4 rounded-xl border border-rosa/30 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-grafite">Cartinha: {cart.title || "Sem título"}</p>
            <p className="text-sm text-grafite/60">Plano {plan.name}</p>
          </div>
          <span className="text-lg font-bold text-vinho">{formatBRL(plan.priceCents)}</span>
        </div>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Nome completo">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.customerName}
            required
            className="w-full rounded-xl border border-rosa/40 bg-white px-4 py-3 outline-none focus:border-vinho focus:ring-2 focus:ring-vinho/15"
          />
        </Field>
        <Field label="E-mail">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={LIMITS.customerEmail}
            required
            className="w-full rounded-xl border border-rosa/40 bg-white px-4 py-3 outline-none focus:border-vinho focus:ring-2 focus:ring-vinho/15"
          />
        </Field>
        <Field label="Celular (opcional)">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={LIMITS.customerPhone}
            className="w-full rounded-xl border border-rosa/40 bg-white px-4 py-3 outline-none focus:border-vinho focus:ring-2 focus:ring-vinho/15"
          />
        </Field>

        <label className="flex items-start gap-2 text-sm text-grafite/70">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-1"
          />
          <span>
            Li e concordo com os{" "}
            <Link href="/termos" className="text-vinho underline" target="_blank">
              Termos de uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="text-vinho underline" target="_blank">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>

        <div className="rounded-xl border border-dourado/40 bg-dourado/10 p-3 text-center text-xs text-grafite/70">
          Modo demonstração: nenhuma cobrança real será feita nesta etapa.
        </div>

        {error && <p className="text-sm text-vinho">{error}</p>}

        <PrimaryButton type="submit" disabled={!canSubmit}>
          {submitting ? "Enviando…" : `Continuar — ${formatBRL(plan.priceCents)}`}
        </PrimaryButton>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-grafite">{label}</span>
      {children}
    </label>
  );
}

function PaymentUnavailablePanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center">
      <div className="mb-3 text-4xl">⏳</div>
      <h1 className="text-2xl font-semibold text-vinho">Pagamento indisponível</h1>
      <p className="mt-2 text-sm text-grafite/70">
        Os pagamentos ainda não estão disponíveis neste ambiente. Sua cartinha foi salva e
        poderá ser concluída quando o pagamento estiver habilitado.
      </p>
      <button
        onClick={onBack}
        className="mt-6 inline-block text-sm font-medium text-vinho underline"
      >
        Voltar
      </button>
    </div>
  );
}

/**
 * Escolha entre Pix e cartão (task 013, seção 11). O pedido já existe com
 * preço/plano definidos pelo servidor; esta tela só decide o método.
 */
function RealPaymentPanel({
  order,
  token,
  onBack,
  onDone,
}: {
  order: OrderSummary;
  token: string;
  onBack: () => void;
  onDone: (orderId: string) => void;
}) {
  const [method, setMethod] = useState<"choose" | "pix" | "card">("choose");

  if (method === "pix") {
    return <PixPaymentPanel order={order} token={token} onDone={onDone} />;
  }
  if (method === "card") {
    return <CardPaymentPanel order={order} token={token} onDone={onDone} />;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold text-vinho">Como você quer pagar?</h1>
      <div className="mt-6 space-y-3">
        <PrimaryButton onClick={() => setMethod("pix")}>💠 Pagar com Pix</PrimaryButton>
        <button
          onClick={() => setMethod("card")}
          className="block w-full rounded-full border border-rosa/40 px-6 py-3 text-sm font-medium text-grafite/70 transition hover:bg-rosa-soft/40"
        >
          💳 Pagar com cartão
        </button>
      </div>
      <button onClick={onBack} className="mt-6 text-sm font-medium text-vinho underline">
        Voltar
      </button>
    </div>
  );
}

function MockPaymentPanel({
  order,
  onConfirming,
  onDone,
}: {
  order: OrderSummary;
  onConfirming: () => void;
  onDone: (orderId: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm(action: "success" | "fail" | "expire") {
    setBusy(true);
    onConfirming();
    try {
      const result = await mockConfirm(order.id, action);
      if (result.order.status === "PAID") {
        track("payment_confirmed", { plan: result.order.planType });
      }
    } catch {
      // A página de sucesso consulta o status novamente e trata o erro lá.
    } finally {
      onDone(order.id);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center">
      <div className="mb-3 text-4xl">💳</div>
      <h1 className="text-2xl font-semibold text-vinho">Pagamento simulado</h1>
      <p className="mt-2 text-sm text-grafite/60">
        Modo demonstração — escolha um resultado para continuar. Nenhuma cobrança é feita.
      </p>
      <div className="mt-6 space-y-3">
        <PrimaryButton onClick={() => confirm("success")} disabled={busy}>
          ✓ Simular pagamento aprovado
        </PrimaryButton>
        <button
          onClick={() => confirm("fail")}
          disabled={busy}
          className="block w-full rounded-full border border-rosa/40 px-6 py-3 text-sm font-medium text-grafite/70 transition hover:bg-rosa-soft/40 disabled:opacity-50"
        >
          Simular falha no pagamento
        </button>
        <button
          onClick={() => confirm("expire")}
          disabled={busy}
          className="block w-full rounded-full border border-rosa/40 px-6 py-3 text-sm font-medium text-grafite/70 transition hover:bg-rosa-soft/40 disabled:opacity-50"
        >
          Simular expiração
        </button>
      </div>
    </div>
  );
}
