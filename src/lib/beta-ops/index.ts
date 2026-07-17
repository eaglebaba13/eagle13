// Phase 35 — Open Beta Operations. Read-only aggregators for bug triage,
// user feedback, crash reporting, provider stability, and version planning.
// No research-engine, provider, broker, or execution changes.

export type BugPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type BugStatus = "OPEN" | "IN_PROGRESS" | "FIXED" | "WONT_FIX" | "DUPLICATE";

export interface BugReport {
  readonly id: string;
  readonly title: string;
  readonly priority: BugPriority;
  readonly status: BugStatus;
  readonly owner: string | null;
  readonly resolution: string | null;
  readonly reportedAt: string;
  readonly area?: string;
}

export interface BugSummary {
  readonly total: number;
  readonly byPriority: Readonly<Record<BugPriority, number>>;
  readonly byStatus: Readonly<Record<BugStatus, number>>;
  readonly openCritical: number;
  readonly openHigh: number;
  readonly blockingRelease: boolean;
}

const P: readonly BugPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const S: readonly BugStatus[] = ["OPEN", "IN_PROGRESS", "FIXED", "WONT_FIX", "DUPLICATE"];

export function summariseBugs(bugs: readonly BugReport[]): BugSummary {
  const byPriority = Object.fromEntries(P.map((k) => [k, 0])) as Record<BugPriority, number>;
  const byStatus = Object.fromEntries(S.map((k) => [k, 0])) as Record<BugStatus, number>;
  for (const b of bugs) {
    byPriority[b.priority] += 1;
    byStatus[b.status] += 1;
  }
  const openCritical = bugs.filter((b) => b.priority === "CRITICAL" && (b.status === "OPEN" || b.status === "IN_PROGRESS")).length;
  const openHigh = bugs.filter((b) => b.priority === "HIGH" && (b.status === "OPEN" || b.status === "IN_PROGRESS")).length;
  return {
    total: bugs.length,
    byPriority,
    byStatus,
    openCritical,
    openHigh,
    blockingRelease: openCritical > 0,
  };
}

export type FeedbackCategory =
  | "UI"
  | "USABILITY"
  | "PERFORMANCE"
  | "UNDERSTANDING"
  | "FEATURE_REQUEST"
  | "PAIN_POINT";

export interface FeedbackEntry {
  readonly id: string;
  readonly category: FeedbackCategory;
  readonly rating: number; // 1..5
  readonly comment: string;
  readonly submittedAt: string;
  readonly userId?: string | null;
}

export interface FeedbackSummary {
  readonly total: number;
  readonly avgRating: number;
  readonly byCategory: Readonly<Record<FeedbackCategory, number>>;
  readonly nps: number; // -100..100 approximation
}

const FC: readonly FeedbackCategory[] = [
  "UI",
  "USABILITY",
  "PERFORMANCE",
  "UNDERSTANDING",
  "FEATURE_REQUEST",
  "PAIN_POINT",
];

export function summariseFeedback(entries: readonly FeedbackEntry[]): FeedbackSummary {
  const byCategory = Object.fromEntries(FC.map((k) => [k, 0])) as Record<FeedbackCategory, number>;
  let sum = 0;
  let promoters = 0;
  let detractors = 0;
  for (const e of entries) {
    byCategory[e.category] += 1;
    sum += e.rating;
    if (e.rating >= 5) promoters += 1;
    else if (e.rating <= 2) detractors += 1;
  }
  const total = entries.length;
  const avgRating = total === 0 ? 0 : sum / total;
  const nps = total === 0 ? 0 : Math.round(((promoters - detractors) / total) * 100);
  return { total, avgRating, byCategory, nps };
}

export type CrashKind =
  | "UNHANDLED_EXCEPTION"
  | "PROVIDER_FAILURE"
  | "RENDER_FAILURE"
  | "API_FAILURE";

export interface CrashEvent {
  readonly id: string;
  readonly kind: CrashKind;
  readonly message: string;
  readonly occurredAt: string;
  readonly route?: string;
  readonly userId?: string | null;
}

export interface CrashSummary {
  readonly total: number;
  readonly byKind: Readonly<Record<CrashKind, number>>;
  readonly last24h: number;
  readonly topRoute: string | null;
}

const CK: readonly CrashKind[] = [
  "UNHANDLED_EXCEPTION",
  "PROVIDER_FAILURE",
  "RENDER_FAILURE",
  "API_FAILURE",
];

export function summariseCrashes(events: readonly CrashEvent[], now: Date = new Date()): CrashSummary {
  const byKind = Object.fromEntries(CK.map((k) => [k, 0])) as Record<CrashKind, number>;
  const routeCount = new Map<string, number>();
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  let last24h = 0;
  for (const e of events) {
    byKind[e.kind] += 1;
    if (e.route) routeCount.set(e.route, (routeCount.get(e.route) ?? 0) + 1);
    if (Date.parse(e.occurredAt) >= cutoff) last24h += 1;
  }
  let topRoute: string | null = null;
  let topN = 0;
  for (const [r, n] of routeCount) if (n > topN) { topRoute = r; topN = n; }
  return { total: events.length, byKind, last24h, topRoute };
}

export interface ProviderStabilitySample {
  readonly providerId: string;
  readonly label: string;
  readonly successes: number;
  readonly failures: number;
  readonly p50LatencyMs: number;
}

export interface ProviderStabilityRow extends ProviderStabilitySample {
  readonly errorRate: number;
  readonly rating: "HEALTHY" | "DEGRADED" | "UNSTABLE";
}

export function rateProviderStability(samples: readonly ProviderStabilitySample[]): readonly ProviderStabilityRow[] {
  return samples.map((s) => {
    const total = s.successes + s.failures;
    const errorRate = total === 0 ? 0 : s.failures / total;
    const rating: ProviderStabilityRow["rating"] =
      errorRate >= 0.1 ? "UNSTABLE" : errorRate >= 0.02 ? "DEGRADED" : "HEALTHY";
    return { ...s, errorRate, rating };
  });
}

export interface PaymentValidationInput {
  readonly subscriptions: number;
  readonly renewals: number;
  readonly failures: number;
  readonly refunds: number;
  readonly invoicesIssued: number;
}

export interface PaymentValidationReport {
  readonly renewalRate: number;
  readonly failureRate: number;
  readonly refundRate: number;
  readonly invoiceCoverage: number;
  readonly healthy: boolean;
}

export function validatePayments(i: PaymentValidationInput): PaymentValidationReport {
  const subs = Math.max(i.subscriptions, 1);
  const renewalRate = i.renewals / subs;
  const attempts = i.renewals + i.failures;
  const failureRate = attempts === 0 ? 0 : i.failures / attempts;
  const refundRate = i.refunds / subs;
  const invoiceCoverage = i.invoicesIssued / subs;
  const healthy = failureRate < 0.1 && refundRate < 0.1 && invoiceCoverage >= 0.9;
  return { renewalRate, failureRate, refundRate, invoiceCoverage, healthy };
}

export interface RoadmapItem {
  readonly id: string;
  readonly title: string;
  readonly targetVersion: "1.0.1" | "1.1";
  readonly type: "BUG_FIX" | "SECURITY" | "PERFORMANCE" | "FEATURE";
  readonly status: "PLANNED" | "IN_PROGRESS" | "DONE";
}

export const V1_0_1_SCOPE: readonly RoadmapItem[] = [
  { id: "hydration-warnings", title: "Eliminate remaining hydration warnings", targetVersion: "1.0.1", type: "BUG_FIX", status: "PLANNED" },
  { id: "provider-retry-backoff", title: "Tighten provider retry/backoff windows", targetVersion: "1.0.1", type: "PERFORMANCE", status: "PLANNED" },
  { id: "dashboard-empty-copy", title: "Polish empty-state copy across dashboard", targetVersion: "1.0.1", type: "BUG_FIX", status: "PLANNED" },
  { id: "security-headers", title: "Verify security headers on all edge routes", targetVersion: "1.0.1", type: "SECURITY", status: "PLANNED" },
];

export const V1_1_ROADMAP: readonly RoadmapItem[] = [
  { id: "max-pain", title: "Max Pain module", targetVersion: "1.1", type: "FEATURE", status: "PLANNED" },
  { id: "oi-buildup", title: "OI Build-up module", targetVersion: "1.1", type: "FEATURE", status: "PLANNED" },
  { id: "long-buildup", title: "Long Build-up module", targetVersion: "1.1", type: "FEATURE", status: "PLANNED" },
  { id: "short-buildup", title: "Short Build-up module", targetVersion: "1.1", type: "FEATURE", status: "PLANNED" },
  { id: "gamma-exposure", title: "Gamma Exposure module", targetVersion: "1.1", type: "FEATURE", status: "PLANNED" },
  { id: "dealer-positioning", title: "Dealer Positioning module", targetVersion: "1.1", type: "FEATURE", status: "PLANNED" },
];

export interface BetaReport {
  readonly generatedAt: string;
  readonly bugs: BugSummary;
  readonly feedback: FeedbackSummary;
  readonly crashes: CrashSummary;
  readonly providers: readonly ProviderStabilityRow[];
  readonly payments: PaymentValidationReport;
  readonly v101: readonly RoadmapItem[];
  readonly v11: readonly RoadmapItem[];
  readonly recommendation: "PROMOTE" | "HOLD" | "ROLLBACK";
}

export interface BetaReportInput {
  readonly bugs: readonly BugReport[];
  readonly feedback: readonly FeedbackEntry[];
  readonly crashes: readonly CrashEvent[];
  readonly providers: readonly ProviderStabilitySample[];
  readonly payments: PaymentValidationInput;
  readonly now?: Date;
}

export function buildBetaReport(input: BetaReportInput): BetaReport {
  const now = input.now ?? new Date();
  const bugs = summariseBugs(input.bugs);
  const feedback = summariseFeedback(input.feedback);
  const crashes = summariseCrashes(input.crashes, now);
  const providers = rateProviderStability(input.providers);
  const payments = validatePayments(input.payments);
  const providerUnstable = providers.some((p) => p.rating === "UNSTABLE");
  const recommendation: BetaReport["recommendation"] =
    bugs.blockingRelease || !payments.healthy || providerUnstable
      ? "HOLD"
      : crashes.last24h > 25
        ? "ROLLBACK"
        : "PROMOTE";
  return {
    generatedAt: now.toISOString(),
    bugs,
    feedback,
    crashes,
    providers,
    payments,
    v101: V1_0_1_SCOPE,
    v11: V1_1_ROADMAP,
    recommendation,
  };
}