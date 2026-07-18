// Phase 4A — v1.0-RC1 release checklist (machine-readable).
//
// Pure, deterministic. Consumed by the launch-readiness admin route and by
// tests. Adding/removing a mandatory gate is a release event — bump
// RC1_CHECKLIST_VERSION.

export type RC1GateStatus = "PASS" | "FAIL" | "PENDING" | "N/A";

export interface RC1Gate {
  readonly id: string;
  readonly category:
    | "build"
    | "security"
    | "runtime"
    | "trading-safety"
    | "ux"
    | "legal"
    | "signoff";
  readonly title: string;
  readonly mandatory: boolean;
  readonly evidence: string;
}

export const RC1_CHECKLIST_VERSION = "rc1-checklist@1.0.0";

export const RC1_CHECKLIST: readonly RC1Gate[] = [
  { id: "build.typecheck", category: "build", title: "TypeScript typecheck clean", mandatory: true, evidence: "tsgo" },
  { id: "build.tests", category: "build", title: "Vitest suites passing", mandatory: true, evidence: "vitest" },
  { id: "build.prod", category: "build", title: "Production build succeeds", mandatory: true, evidence: "vite build" },
  { id: "build.routes", category: "build", title: "Route generation validated", mandatory: true, evidence: "routeTree.gen.ts" },

  { id: "security.no-client-secrets", category: "security", title: "No secrets reachable from client bundle", mandatory: true, evidence: "import-boundary tests" },
  { id: "security.rls", category: "security", title: "RLS enabled on every public table", mandatory: true, evidence: "supabase migrations" },
  { id: "security.admin-gate", category: "security", title: "Admin routes gated by has_role()", mandatory: true, evidence: "requireSupabaseAuth + has_role" },
  { id: "security.headers", category: "security", title: "Security headers configured at hosting", mandatory: true, evidence: "hosting config" },

  { id: "runtime.env", category: "runtime", title: "Environment validator covers required keys", mandatory: true, evidence: "src/lib/env-validation" },
  { id: "runtime.rate-limit", category: "runtime", title: "Rate limit evaluator available", mandatory: true, evidence: "src/lib/rate-limit" },
  { id: "runtime.registry", category: "runtime", title: "Runtime readiness registry lists critical modules", mandatory: true, evidence: "runtime-evidence.ts" },
  { id: "runtime.health", category: "runtime", title: "Health endpoint returns liveness/readiness", mandatory: true, evidence: "buildHealthPayload" },
  { id: "runtime.observability", category: "runtime", title: "Observability ring buffer active", mandatory: false, evidence: "src/lib/observability" },

  { id: "trading.live-order-off", category: "trading-safety", title: "LIVE_ORDER_ENABLED=false", mandatory: true, evidence: "env" },
  { id: "trading.broker-exec-off", category: "trading-safety", title: "BROKER_ORDER_EXECUTION_ENABLED=false", mandatory: true, evidence: "env" },
  { id: "trading.coindcx-off", category: "trading-safety", title: "COINDCX trading disabled", mandatory: true, evidence: "env" },
  { id: "trading.no-formula-change", category: "trading-safety", title: "No formula/threshold changes in RC1", mandatory: true, evidence: "phase 4A guard" },

  { id: "ux.responsive", category: "ux", title: "AppShell responsive on mobile/tablet/desktop", mandatory: true, evidence: "AppShell.test" },
  { id: "ux.drawer", category: "ux", title: "Sidebar collapses to accessible drawer", mandatory: true, evidence: "MobileNav" },
  { id: "ux.a11y-icon-buttons", category: "ux", title: "Icon-only buttons carry aria-label", mandatory: true, evidence: "component review" },

  { id: "legal.risk", category: "legal", title: "/risk page present", mandatory: true, evidence: "route" },
  { id: "legal.privacy", category: "legal", title: "/privacy page present", mandatory: true, evidence: "route" },
  { id: "legal.terms", category: "legal", title: "/terms page present", mandatory: true, evidence: "route" },
  { id: "legal.release-notes", category: "legal", title: "/release-notes page present", mandatory: true, evidence: "route" },
  { id: "legal.status", category: "legal", title: "/status page present", mandatory: true, evidence: "route" },

  { id: "signoff.human", category: "signoff", title: "Human sign-off recorded", mandatory: true, evidence: "admin launch readiness" },
];

export type RC1Verdict = "READY" | "AWAITING_SIGNOFF" | "BLOCKED";

export function evaluateRC1(
  statuses: ReadonlyMap<string, RC1GateStatus>,
): { verdict: RC1Verdict; failing: readonly string[]; pending: readonly string[] } {
  const failing: string[] = [];
  const pending: string[] = [];
  for (const g of RC1_CHECKLIST) {
    const s = statuses.get(g.id) ?? "PENDING";
    if (s === "FAIL" && g.mandatory) failing.push(g.id);
    else if (s === "PENDING" && g.mandatory) pending.push(g.id);
  }
  if (failing.length > 0) return { verdict: "BLOCKED", failing, pending };
  if (pending.length > 0) return { verdict: "AWAITING_SIGNOFF", failing, pending };
  return { verdict: "READY", failing, pending };
}