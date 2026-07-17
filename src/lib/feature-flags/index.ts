// Phase 30 — Server-side feature flag registry.
//
// Every premium module must resolve access through `evaluateFeatureFlag`,
// which requires an authenticated plan/entitlement snapshot. Client code
// may HIDE UI when a flag is off, but the authoritative decision runs
// server-side (via `entitlement-guard.functions.ts` callers).
//
// Pure. No I/O. No changes to research engines.

import type { Capability, PlanId } from "@/lib/plans";

export interface FeatureFlagDefinition {
  readonly id: string;
  readonly capability: Capability;
  readonly enabled: boolean;
  readonly minPlan: PlanId;
  readonly description: string;
}

// Registry is deterministic — flags are additions, never re-definitions
// of research formulas or provider paths.
export const FEATURE_FLAG_REGISTRY: readonly FeatureFlagDefinition[] = [
  { id: "dashboard.basic",       capability: "dashboard.basic",       enabled: true,  minPlan: "free",         description: "Basic market dashboard" },
  { id: "dashboard.premium",     capability: "dashboard.premium",     enabled: true,  minPlan: "pro",          description: "Full dashboard with GTI summary" },
  { id: "options.chain",         capability: "options.analytics",     enabled: true,  minPlan: "pro",          description: "Live option chain viewer" },
  { id: "combined.pcr",          capability: "options.analytics",     enabled: true,  minPlan: "pro",          description: "Combined PCR research" },
  { id: "market.breadth",        capability: "signal.accuracy",       enabled: true,  minPlan: "pro",          description: "Market breadth + GTI research" },
  { id: "backtest.basic",        capability: "backtest.basic",        enabled: true,  minPlan: "pro",          description: "Basic backtest engine" },
  { id: "backtest.advanced",     capability: "backtest.advanced",     enabled: true,  minPlan: "professional", description: "Advanced backtest engine" },
  { id: "exports.csv",           capability: "exports.csv",           enabled: true,  minPlan: "pro",          description: "CSV exports" },
  { id: "exports.pdf",           capability: "exports.pdf",           enabled: true,  minPlan: "professional", description: "PDF research bundles" },
  { id: "admin.console",         capability: "admin.console",         enabled: true,  minPlan: "enterprise",   description: "Admin console access" },
];

export const FEATURE_FLAG_VERSION = "feature-flags@1.0.0";

const PLAN_RANK: Record<PlanId, number> = {
  free: 0, pro: 1, professional: 2, enterprise: 3,
};

export type FeatureFlagDenyReason =
  | "flag_disabled"
  | "unknown_flag"
  | "plan_below_minimum"
  | "subscription_not_active";

export interface FeatureFlagDecision {
  readonly allowed: boolean;
  readonly reason: FeatureFlagDenyReason | null;
  readonly flag: FeatureFlagDefinition | null;
}

export interface FeatureFlagContext {
  readonly plan: PlanId;
  readonly subscriptionActive: boolean;
}

export function findFeatureFlag(id: string): FeatureFlagDefinition | null {
  return FEATURE_FLAG_REGISTRY.find((f) => f.id === id) ?? null;
}

export function evaluateFeatureFlag(id: string, ctx: FeatureFlagContext): FeatureFlagDecision {
  const flag = findFeatureFlag(id);
  if (!flag) return { allowed: false, reason: "unknown_flag", flag: null };
  if (!flag.enabled) return { allowed: false, reason: "flag_disabled", flag };
  if (!ctx.subscriptionActive) return { allowed: false, reason: "subscription_not_active", flag };
  if (PLAN_RANK[ctx.plan] < PLAN_RANK[flag.minPlan]) {
    return { allowed: false, reason: "plan_below_minimum", flag };
  }
  return { allowed: true, reason: null, flag };
}

export function listFlagsForPlan(plan: PlanId): readonly FeatureFlagDefinition[] {
  return FEATURE_FLAG_REGISTRY.filter((f) => f.enabled && PLAN_RANK[plan] >= PLAN_RANK[f.minPlan]);
}