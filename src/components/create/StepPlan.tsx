"use client";

import type { Cart, PlanType } from "@/lib/types";
import { plans, formatBRL } from "@/config/plans";
import { flags } from "@/config/flags";
import { StepHeader, PrimaryButton } from "./ui";

interface Props {
  cart: Cart;
  update: (patch: Partial<Cart>) => void;
  onPublish: () => void;
}

export function StepPlan({ cart, update, onPublish }: Props) {
  return (
    <div>
      <StepHeader
        title="Sua cartinha está quase pronta!"
        subtitle="Escolha por quanto tempo ela ficará disponível."
      />

      <div className="space-y-3">
        {plans.map((plan) => {
          const active = cart.planType === plan.type;
          return (
            <button
              key={plan.type}
              type="button"
              onClick={() => update({ planType: plan.type as PlanType })}
              aria-pressed={active}
              className={`w-full rounded-2xl border-2 p-4 text-left transition ${
                active
                  ? "border-vinho bg-vinho/5 shadow-md"
                  : plan.highlight
                    ? "border-dourado/60 bg-white hover:border-vinho/50"
                    : "border-rosa/35 bg-white hover:border-vinho/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-vinho">{plan.name}</span>
                    {plan.badge && (
                      <span className="rounded-full bg-dourado/20 px-2 py-0.5 text-[11px] font-medium text-dourado">
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-grafite/70">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5">
                        <span className="text-green-600">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-right">
                  <span className="block text-lg font-bold text-vinho">
                    {formatBRL(plan.priceCents)}
                  </span>
                  <span className="text-xs text-grafite/45">pagamento único</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Fase 1: sem pagamento real — modo demonstração claramente marcado. */}
      <div className="mt-6 rounded-xl border border-dourado/40 bg-dourado/10 p-3 text-center text-xs text-grafite/70">
        {flags.PAYMENT_MODE === "mock"
          ? "Modo demonstração: nenhuma cobrança é feita. O checkout real entra nas próximas fases."
          : "Você será direcionado ao pagamento seguro."}
      </div>

      <div className="mt-5 flex justify-center">
        <PrimaryButton onClick={onPublish} disabled={!cart.planType}>
          Ver minha cartinha pronta ✦
        </PrimaryButton>
      </div>
    </div>
  );
}
