/**
 * Phase 20.2 — Entitlement resolution.
 *
 * Given a user's role + subscription snapshot, decides which capabilities
 * they can access RIGHT NOW. This is the single function every feature-gate,
 * route guard and UI lock consults.
 */
import {
  PLANS,
  planForRole,
  planRank,
  type Capability,
  type PlanDefinition,
  type PlanId,
  type SubscriptionStatus,
  type UsageLimits,
} from "./plans";
import type { AppRole } from "./roles";

export interface SubscriptionSnapshot {
  plan: PlanId;
  status: SubscriptionStatus;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  provider: string | null;
}

export interface UserEntitlementContext {
  role: AppRole;
  subscription: SubscriptionSnapshot | null;
  /** Admin override — bypasses plan checks. */
  adminOverride?: boolean;
  /** Optional per-user capability grant (e.g. temporary trial extension). */
  grantedCapabilities?: readonly Capability[];
  /** Current time — injected for deterministic tests. */
  now?: Date;
}

export interface EffectivePlan {
  plan: PlanDefinition;
  planId: PlanId;
  status: SubscriptionStatus;
  isTrial: boolean;
  trialDaysLeft: number | null;
  isActivePaidPlan: boolean;
  canAccessPremium: boolean;
  cancelAtPeriodEnd: boolean;
  renewsAt: Date | null;
  provider: string | null;
}

function daysUntil(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 86_400_000));
}

/** Resolve the plan actually usable right now. */
export function resolveEffectivePlan(ctx: UserEntitlementContext): EffectivePlan {
  const now = ctx.now ?? new Date();
  const rolePlan = planForRole(ctx.role);

  // Admin / enterprise role always gets top-tier access.
  if (ctx.adminOverride || ctx.role === "admin" || ctx.role === "enterprise") {
    return {
      plan: PLANS.enterprise,
      planId: "enterprise",
      status: "active",
      isTrial: false,
      trialDaysLeft: null,
      isActivePaidPlan: true,
      canAccessPremium: true,
      cancelAtPeriodEnd: false,
      renewsAt: null,
      provider: null,
    };
  }

  const sub = ctx.subscription;
  if (!sub) {
    return {
      plan: PLANS[rolePlan],
      planId: rolePlan,
      status: "active",
      isTrial: false,
      trialDaysLeft: null,
      isActivePaidPlan: rolePlan !== "free",
      canAccessPremium: rolePlan !== "free",
      cancelAtPeriodEnd: false,
      renewsAt: null,
      provider: null,
    };
  }

  const isTrial = sub.status === "trialing" && !!sub.trialEnd && sub.trialEnd.getTime() > now.getTime();
  const trialExpired = sub.status === "trialing" && !isTrial;
  const periodExpired =
    !!sub.currentPeriodEnd &&
    sub.currentPeriodEnd.getTime() < now.getTime() &&
    sub.status !== "trialing";

  // "Access blocked" states: fall back to Free.
  const blocked =
    sub.status === "expired" ||
    sub.status === "canceled" ||
    sub.status === "suspended" ||
    trialExpired ||
    periodExpired;

  const effectiveId: PlanId = blocked ? "free" : sub.plan;
  const status: SubscriptionStatus = blocked
    ? sub.status === "canceled"
      ? "canceled"
      : "expired"
    : sub.status;

  const canAccessPremium =
    !blocked &&
    (sub.status === "active" ||
      sub.status === "trialing" ||
      sub.status === "past_due");

  return {
    plan: PLANS[effectiveId],
    planId: effectiveId,
    status,
    isTrial,
    trialDaysLeft: isTrial ? daysUntil(sub.trialEnd, now) : null,
    isActivePaidPlan: !blocked && effectiveId !== "free",
    canAccessPremium,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    renewsAt: sub.currentPeriodEnd,
    provider: sub.provider,
  };
}

/**
 * The one entitlement check every feature MUST use.
 */
export function hasEntitlement(
  ctx: UserEntitlementContext,
  capability: Capability,
): boolean {
  if (ctx.grantedCapabilities?.includes(capability)) return true;
  const effective = resolveEffectivePlan(ctx);
  return effective.plan.capabilities.includes(capability);
}

export function limitsFor(ctx: UserEntitlementContext): UsageLimits {
  return resolveEffectivePlan(ctx).plan.limits;
}

export function isPlanAtLeast(a: PlanId, b: PlanId): boolean {
  return planRank(a) >= planRank(b);
}

/** Minimum plan that grants the given capability. */
export function minPlanFor(capability: Capability): PlanId | null {
  for (const id of ["free", "pro", "professional", "enterprise"] as PlanId[]) {
    if (PLANS[id].capabilities.includes(capability)) return id;
  }
  return null;
}