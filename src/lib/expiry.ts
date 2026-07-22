import { PLAN_LIMITED_DURATION_DAYS } from "@/config/plans";
import type { PlanType } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Expiração conforme o plano:
 * - LIMITED: paidAt + PLAN_LIMITED_DURATION_DAYS
 * - PERMANENT: null (sem expiração programada)
 */
export function computeExpiresAt(planType: PlanType, paidAt: Date): Date | null {
  if (planType === "LIMITED") {
    return new Date(paidAt.getTime() + PLAN_LIMITED_DURATION_DAYS * DAY_MS);
  }
  return null;
}

/** Uma carta publicada está expirada se passou de expiresAt. */
export function isExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  return expiresAt !== null && expiresAt.getTime() < now.getTime();
}
