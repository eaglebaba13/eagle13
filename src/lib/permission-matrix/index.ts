// Phase 30 — Derives a plan × capability permission matrix from the
// feature-flag registry. Pure. Used by the admin panel to render
// entitlement audits.

import { FEATURE_FLAG_REGISTRY, listFlagsForPlan } from "@/lib/feature-flags";
import { PLAN_IDS, type PlanId } from "@/lib/plans";

export interface PermissionRow {
  readonly flagId: string;
  readonly grants: Readonly<Record<PlanId, boolean>>;
}

export interface PermissionMatrix {
  readonly rows: readonly PermissionRow[];
  readonly formulaVersion: string;
}

export const PERMISSION_MATRIX_VERSION = "permission-matrix@1.0.0";

export function buildPermissionMatrix(): PermissionMatrix {
  const grantsByPlan = new Map<PlanId, Set<string>>();
  for (const plan of PLAN_IDS) {
    grantsByPlan.set(plan, new Set(listFlagsForPlan(plan).map((f) => f.id)));
  }
  const rows: PermissionRow[] = FEATURE_FLAG_REGISTRY.map((f) => {
    const grants = {} as Record<PlanId, boolean>;
    for (const plan of PLAN_IDS) grants[plan] = grantsByPlan.get(plan)!.has(f.id);
    return { flagId: f.id, grants };
  });
  return { rows, formulaVersion: PERMISSION_MATRIX_VERSION };
}