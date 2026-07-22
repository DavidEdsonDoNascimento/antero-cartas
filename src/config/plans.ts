/**
 * Planos e preços — configuração centralizada.
 * Nunca faça hardcode de preço nos componentes: importe daqui.
 * Valores podem vir de variáveis de ambiente para facilitar testes.
 */

import type { PlanType } from "@/lib/types";

function readCents(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readDays(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Preços em centavos. No servidor o preço é autoritativo (nunca confiar no
 * navegador): usamos as variáveis não-públicas primeiro e caímos para as
 * NEXT_PUBLIC_ (necessárias para exibição). Ambas são configuráveis.
 */
export const PLAN_LIMITED_PRICE = readCents(
  process.env.PLAN_LIMITED_PRICE ?? process.env.NEXT_PUBLIC_PLAN_LIMITED_PRICE,
  1890,
);
export const PLAN_PERMANENT_PRICE = readCents(
  process.env.PLAN_PERMANENT_PRICE ?? process.env.NEXT_PUBLIC_PLAN_PERMANENT_PRICE,
  4890,
);
export const PLAN_LIMITED_DURATION_DAYS = readDays(
  process.env.PLAN_LIMITED_DURATION_DAYS ??
    process.env.NEXT_PUBLIC_PLAN_LIMITED_DURATION_DAYS,
  365,
);

export interface PlanConfig {
  type: PlanType;
  name: string;
  priceCents: number;
  /** Preço "de" apenas visual/opcional; null quando não houver âncora. */
  anchorPriceCents: number | null;
  durationDays: number | null;
  highlight: boolean;
  badge?: string;
  features: string[];
}

export const plans: PlanConfig[] = [
  {
    type: "LIMITED",
    name: "Essencial",
    priceCents: PLAN_LIMITED_PRICE,
    anchorPriceCents: null,
    durationDays: PLAN_LIMITED_DURATION_DAYS,
    highlight: false,
    features: [
      "Link e QR Code exclusivos",
      "Fotos, música e contador de tempo",
      `Disponível por ${PLAN_LIMITED_DURATION_DAYS} dias`,
    ],
  },
  {
    type: "PERMANENT",
    name: "Para Sempre",
    priceCents: PLAN_PERMANENT_PRICE,
    anchorPriceCents: null,
    durationDays: null,
    highlight: true,
    badge: "Mais escolhido",
    features: [
      "Link e QR Code exclusivos",
      "Fotos, música e contador de tempo",
      "Sem data para expirar",
    ],
  },
];

export function getPlan(type: PlanType): PlanConfig {
  const plan = plans.find((p) => p.type === type);
  if (!plan) throw new Error(`Plano desconhecido: ${type}`);
  return plan;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
