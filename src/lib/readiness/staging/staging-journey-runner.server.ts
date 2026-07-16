/**
 * Phase 25 — Stage 2 — Deterministic journey runner.
 * The runner is pure: it takes a `JourneyPlan` and a `StepResolver` and
 * returns a `StagingJourney`. Real staging execution wires the resolver
 * to fetch/browser calls; tests wire it to deterministic maps.
 */
import type {
  StagingCheck,
  StagingFailure,
  StagingJourney,
  StagingStatus,
  StagingStep,
} from "./staging-validation-types";

export interface JourneyStepPlan {
  id: string;
  title: string;
  route?: string;
  expectedHttpStatus?: number;
  assertion?: string;
}

export interface JourneyPlan {
  id: string;
  title: string;
  role: "anon" | "free" | "pro" | "professional" | "admin";
  steps: readonly JourneyStepPlan[];
}

export interface StepResolution {
  status: StagingStatus;
  httpStatus?: number;
  durationMs: number;
  error?: string;
  evidenceRef?: string;
  failureCategory?: StagingFailure["category"];
}

export type StepResolver = (plan: JourneyStepPlan, journey: JourneyPlan) => StepResolution;

export interface RunOptions {
  now: () => number;
  toIso: (ms: number) => string;
}

function overallStatus(steps: readonly StagingStep[]): StagingStatus {
  if (steps.length === 0) return "SKIPPED";
  if (steps.some((s) => s.status === "FAIL")) return "FAIL";
  if (steps.some((s) => s.status === "BLOCKED")) return "BLOCKED";
  if (steps.every((s) => s.status === "SKIPPED")) return "SKIPPED";
  if (steps.some((s) => s.status === "WARNING")) return "WARNING";
  if (steps.every((s) => s.status === "PASS")) return "PASS";
  return "UNKNOWN";
}

export function runJourney(
  plan: JourneyPlan,
  resolve: StepResolver,
  opts: RunOptions,
): StagingJourney {
  const start = opts.now();
  const steps: StagingStep[] = [];
  let failure: StagingFailure | undefined;
  for (const stepPlan of plan.steps) {
    const stepStart = opts.now();
    const res = resolve(stepPlan, plan);
    const stepEnd = stepStart + Math.max(0, res.durationMs);
    const step: StagingStep = {
      id: stepPlan.id,
      title: stepPlan.title,
      status: res.status,
      startedAt: opts.toIso(stepStart),
      endedAt: opts.toIso(stepEnd),
      durationMs: res.durationMs,
      httpStatus: res.httpStatus,
      route: stepPlan.route,
      role: plan.role,
      error: res.error,
      evidenceRef: res.evidenceRef,
    };
    steps.push(step);
    if (res.status === "FAIL" && !failure) {
      failure = {
        stepId: stepPlan.id,
        message: res.error ?? "step failed",
        category: res.failureCategory ?? "assertion",
      };
      // Journey isolation: stop on first failure to avoid cascading noise.
      break;
    }
  }
  const end = opts.now();
  return {
    id: plan.id,
    title: plan.title,
    role: plan.role,
    status: overallStatus(steps),
    steps,
    startedAt: opts.toIso(start),
    endedAt: opts.toIso(end),
    durationMs: Math.max(0, end - start),
    failure,
  };
}

export function journeyToCheck(journey: StagingJourney): StagingCheck {
  const isBlocker = journey.role === "admin" || journey.role === "anon";
  return {
    id: `journey.${journey.id}`,
    category: "JOURNEY",
    title: journey.title,
    status: journey.status,
    severity: journey.status === "FAIL" ? (isBlocker ? "blocker" : "critical") : "info",
    detail:
      journey.failure
        ? `step=${journey.failure.stepId} category=${journey.failure.category} ${journey.failure.message}`
        : `${journey.steps.length} steps · ${journey.durationMs}ms`,
    hardBlocker: journey.status === "FAIL" && journey.role === "admin",
    groupId: journey.id,
  };
}

/** Deterministic journey plans required by the spec. */
export const STAGING_JOURNEY_PLANS: readonly JourneyPlan[] = [
  {
    id: "public",
    title: "Public visitor",
    role: "anon",
    steps: [
      { id: "landing", title: "Load landing", route: "/", expectedHttpStatus: 200 },
      { id: "public_widgets", title: "Public widgets render", route: "/" },
      { id: "gold_silver", title: "Gold-Silver Ratio widget state" },
      { id: "pricing", title: "Pricing route", route: "/pricing", expectedHttpStatus: 200 },
      { id: "protected_redirect", title: "Protected route redirects to /auth", route: "/_authenticated/profile", expectedHttpStatus: 302 },
    ],
  },
  {
    id: "free",
    title: "Authenticated free user",
    role: "free",
    steps: [
      { id: "login", title: "Login" },
      { id: "dashboard", title: "Dashboard renders", route: "/" },
      { id: "nav_parity", title: "Navigation parity (desktop+mobile)" },
      { id: "locked_widgets", title: "Pro/Professional widgets locked" },
      { id: "logout", title: "Logout" },
      { id: "post_logout", title: "Protected state cleared" },
    ],
  },
  {
    id: "pro",
    title: "Pro user",
    role: "pro",
    steps: [
      { id: "login", title: "Login" },
      { id: "dashboard", title: "Dashboard" },
      { id: "backtest", title: "Backtest run", route: "/backtest" },
      { id: "export", title: "Export CSV" },
      { id: "decision", title: "Decision Center visible", route: "/decision" },
      { id: "entitlement", title: "Entitlement enforced server-side" },
    ],
  },
  {
    id: "professional",
    title: "Professional user",
    role: "professional",
    steps: [
      { id: "research", title: "Research Lab" },
      { id: "optimizer", title: "Optimizer" },
      { id: "portfolio", title: "Portfolio" },
      { id: "shadow", title: "Shadow Validation" },
      { id: "decision", title: "GO / NO-GO" },
      { id: "export_bundle", title: "Export bundles" },
    ],
  },
  {
    id: "admin",
    title: "Admin user",
    role: "admin",
    steps: [
      { id: "admin_payments", title: "Admin payment review", route: "/_authenticated/admin/payments" },
      { id: "diagnostics", title: "Diagnostics", route: "/dev/diagnostics" },
      { id: "readiness", title: "Production Readiness", route: "/_authenticated/admin/readiness" },
      { id: "staging_validation", title: "Staging Validation" },
      { id: "role_guard", title: "Role-protected access confirmed" },
    ],
  },
];

/** Default no-op resolver — marks every step SKIPPED with reason. */
export const skipResolver: StepResolver = () => ({
  status: "SKIPPED",
  durationMs: 0,
  error: "no resolver bound (staging harness not configured)",
});