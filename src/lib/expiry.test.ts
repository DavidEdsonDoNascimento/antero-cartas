import { describe, it, expect } from "vitest";
import { computeExpiresAt, isExpired } from "@/lib/expiry";
import { PLAN_LIMITED_DURATION_DAYS } from "@/config/plans";

describe("computeExpiresAt", () => {
  it("plano LIMITED soma PLAN_LIMITED_DURATION_DAYS ao paidAt", () => {
    const paidAt = new Date("2026-01-01T00:00:00.000Z");
    const expires = computeExpiresAt("LIMITED", paidAt);
    expect(expires).not.toBeNull();
    const diffDays = (expires!.getTime() - paidAt.getTime()) / 86_400_000;
    expect(diffDays).toBeCloseTo(PLAN_LIMITED_DURATION_DAYS, 5);
  });

  it("plano PERMANENT nunca expira (null)", () => {
    expect(computeExpiresAt("PERMANENT", new Date())).toBeNull();
  });
});

describe("isExpired", () => {
  it("null nunca é considerado expirado (plano permanente)", () => {
    expect(isExpired(null)).toBe(false);
  });

  it("data no passado é expirada; no futuro não é", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    expect(isExpired(new Date("2026-05-01T00:00:00.000Z"), now)).toBe(true);
    expect(isExpired(new Date("2026-07-01T00:00:00.000Z"), now)).toBe(false);
  });
});
