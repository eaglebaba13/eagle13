/**
 * Phase 20.3A — Subscription state-machine (client mirror of the DB validator).
 * Client uses this ONLY for UI hints. Authoritative validation runs
 * in the SECURITY DEFINER SQL function `validate_subscription_transition`.
 */
import type { SubscriptionStatus } from "./plans";

export const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  incomplete: ["trialing", "active", "canceled"],
  trialing: ["active", "expired", "canceled"],
  active: ["past_due", "canceled"],
  past_due: ["active", "suspended", "canceled"],
  canceled: ["active", "expired"],
  suspended: ["active", "canceled"],
  expired: ["active"],
};

export function isValidTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  if (from === to) return true;
  return SUBSCRIPTION_TRANSITIONS[from]?.includes(to) ?? false;
}