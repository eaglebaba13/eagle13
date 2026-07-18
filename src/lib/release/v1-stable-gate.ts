// Phase 4B — v1.0.0 stable release gate (deterministic evaluator).
//
// Pure. Never mutates state. Consumed by tests and admin surfaces.

export type V1GateStatus = "PASS" | "FAIL" | "PENDING" | "N/A";

export type V1Verdict =
  | "READY_FOR_DEPLOYMENT"
  | "AWAITING_HUMAN_SIGNOFF"
  | "BLOCKED";

export interface V1StableGate {
  readonly id: string;
  readonly title: string;
  readonly mandatory: boolean;
  readonly category:
    | "build"
    | "security"
    | "runtime"
    | "responsive"
    | "a11y"
    | "database"
    | "backup"
    | "rollback"
    | "legal"
    | "billing"
    | "trading-safety"
    | "signoff";
}

export const V1_STABLE_GATES: readonly V1StableGate[] = [
  { id: "build.tests", title: "Full test suite PASS", mandatory: true, category: "build" },
  { id: "build.typecheck", title: "TypeScript typecheck PASS", mandatory: true, category: "build" },
  { id: "build.production", title: "Production build PASS", mandatory: true, category: "build" },
  { id: "security.secret-scan", title: "Secret scan PASS", mandatory: true, category: "security" },
  { id: "security.import-boundary", title: "Import-boundary audit PASS", mandatory: true, category: "security" },
  { id: "security.audit", title: "Security audit PASS", mandatory: true, category: "security" },
  { id: "runtime.env", title: "Environment validation PASS", mandatory: true, category: "runtime" },
  { id: "runtime.readiness", title: "Runtime readiness PASS", mandatory: true, category: "runtime" },
  { id: "ux.responsive", title: "Responsive critical checks PASS", mandatory: true, category: "responsive" },
  { id: "ux.a11y", title: "Accessibility critical checks PASS", mandatory: true, category: "a11y" },
  { id: "database.rls", title: "Database and RLS validation PASS", mandatory: true, category: "database" },
  { id: "backup.verified", title: "Backup verified", mandatory: true, category: "backup" },
  { id: "rollback.documented", title: "Rollback documented", mandatory: true, category: "rollback" },
  { id: "legal.routes", title: "Legal routes present", mandatory: true, category: "legal" },
  { id: "billing.state", title: "Billing/license state documented", mandatory: true, category: "billing" },
  { id: "trading.flags-off", title: "All trading flags false", mandatory: true, category: "trading-safety" },
  { id: "signoff.human", title: "Human sign-off recorded", mandatory: true, category: "signoff" },
];

export interface V1StableEvaluationInput {
  readonly statuses: ReadonlyMap<string, V1GateStatus>;
  readonly tradingFlagsAllFalse: boolean;
}

export interface V1StableEvaluation {
  readonly verdict: V1Verdict;
  readonly failing: readonly string[];
  readonly pending: readonly string[];
  readonly blockers: readonly string[];
}

export function evaluateV1StableReadiness(
  input: V1StableEvaluationInput,
): V1StableEvaluation {
  const failing: string[] = [];
  const pending: string[] = [];
  const blockers: string[] = [];

  // Hard override: any trading flag true → BLOCKED regardless of other gates.
  if (!input.tradingFlagsAllFalse) {
    blockers.push("trading.flags-off");
  }

  for (const g of V1_STABLE_GATES) {
    const s = input.statuses.get(g.id) ?? "PENDING";
    if (s === "FAIL" && g.mandatory) failing.push(g.id);
    else if (s === "PENDING" && g.mandatory) pending.push(g.id);
  }

  if (blockers.length > 0 || failing.length > 0) {
    return {
      verdict: "BLOCKED",
      failing,
      pending,
      blockers: [...blockers, ...failing],
    };
  }
  if (pending.length > 0) {
    return { verdict: "AWAITING_HUMAN_SIGNOFF", failing, pending, blockers: [] };
  }
  return { verdict: "READY_FOR_DEPLOYMENT", failing, pending, blockers: [] };
}