import { describe, it, expect } from "vitest";
import { getPlan, formatBRL, plans, PLAN_LIMITED_PRICE, PLAN_PERMANENT_PRICE } from "@/config/plans";

describe("getPlan", () => {
  it("retorna o plano correto para LIMITED e PERMANENT", () => {
    expect(getPlan("LIMITED").priceCents).toBe(PLAN_LIMITED_PRICE);
    expect(getPlan("PERMANENT").priceCents).toBe(PLAN_PERMANENT_PRICE);
  });

  it("os dois planos configurados têm preço em centavos > 0", () => {
    for (const plan of plans) {
      expect(plan.priceCents).toBeGreaterThan(0);
      expect(Number.isInteger(plan.priceCents)).toBe(true);
    }
  });
});

describe("formatBRL", () => {
  it("formata centavos como moeda brasileira", () => {
    expect(formatBRL(1890)).toBe(
      (1890 / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    );
    expect(formatBRL(1890)).toContain("18,90");
  });
});
