// Phase 32 · Historical Accuracy adapter.
//
// Provider-neutral. Consumes ALREADY-computed validated results from:
//   1. Validated Shadow results
//   2. Approved walk-forward result
//   3. Approved backtest result
//   4. Research history
//
// It NEVER recomputes backtests or reruns strategies inside a Decision
// request. If no compatible run is found, the adapter returns an
// `UNAVAILABLE` capability with an explicit reason — it never fabricates
// sample sizes or merges incompatible runs.

export type HistoricalSource =
  | "SHADOW_VALIDATED"
  | "WALK_FORWARD_APPROVED"
  | "BACKTEST_APPROVED"
  | "RESEARCH_HISTORY"
  | "UNAVAILABLE";

export type HistoricalCapability =
  | "SUPPORTED"
  | "NO_COMPATIBLE_RUN"
  | "STALE"
  | "INSUFFICIENT_SAMPLE"
  | "NO_DATA";

export type HistoricalDirection = "BULL" | "BEAR" | "NEUTRAL";

export interface HistoricalRunCandidate {
  readonly id: string;
  readonly source: Exclude<HistoricalSource, "UNAVAILABLE">;
  readonly approved: boolean;
  readonly instrument: string;
  readonly strategyVersion: string;
  readonly formulaVersion: string;
  readonly timeframe?: string | null;
  readonly expiryContext?: string | null;
  readonly wins: number;
  readonly losses: number;
  readonly neutral: number;
  readonly evaluatedAt: string; // ISO
  readonly direction?: HistoricalDirection;
}

export interface HistoricalSelectionContext {
  readonly instrument: string;
  readonly strategyVersion: string;
  readonly formulaVersion: string;
  readonly timeframe?: string | null;
  readonly expiryContext?: string | null;
  readonly now: string; // ISO
  readonly minSample?: number; // default 20
  readonly maxAgeMs?: number;  // default 30 days
}

export interface HistoricalAccuracyResult {
  readonly source: HistoricalSource;
  readonly capability: HistoricalCapability;
  readonly reason: string;
  readonly runId: string | null;
  readonly sampleSize: number | null;
  readonly wins: number | null;
  readonly losses: number | null;
  readonly neutral: number | null;
  readonly winRatePct: number | null;
  readonly direction: HistoricalDirection;
  readonly confidenceIntervalPct: readonly [number, number] | null;
  readonly evaluatedAt: string | null;
  readonly formulaVersion: string | null;
  readonly strategyVersion: string | null;
  readonly freshness: "FRESH" | "STALE" | "UNKNOWN";
  readonly candidateCount: number;
  readonly rejectedReasons: readonly string[];
}

const PRIORITY: Record<HistoricalRunCandidate["source"], number> = {
  SHADOW_VALIDATED: 1,
  WALK_FORWARD_APPROVED: 2,
  BACKTEST_APPROVED: 3,
  RESEARCH_HISTORY: 4,
};

function isCompatible(
  c: HistoricalRunCandidate,
  ctx: HistoricalSelectionContext,
): { ok: true } | { ok: false; reason: string } {
  if (!c.approved && c.source !== "RESEARCH_HISTORY")
    return { ok: false, reason: `${c.id}: not approved` };
  if (c.instrument !== ctx.instrument)
    return { ok: false, reason: `${c.id}: instrument mismatch` };
  if (c.strategyVersion !== ctx.strategyVersion)
    return { ok: false, reason: `${c.id}: strategy version mismatch` };
  if (c.formulaVersion !== ctx.formulaVersion)
    return { ok: false, reason: `${c.id}: formula version mismatch` };
  if (ctx.timeframe != null && (c.timeframe ?? null) !== ctx.timeframe)
    return { ok: false, reason: `${c.id}: timeframe mismatch` };
  if (ctx.expiryContext != null && (c.expiryContext ?? null) !== ctx.expiryContext)
    return { ok: false, reason: `${c.id}: expiry context mismatch` };
  const total = c.wins + c.losses + c.neutral;
  const minSample = ctx.minSample ?? 20;
  if (total < minSample)
    return { ok: false, reason: `${c.id}: insufficient sample (${total} < ${minSample})` };
  const ageMs = Date.parse(ctx.now) - Date.parse(c.evaluatedAt);
  const maxAge = ctx.maxAgeMs ?? 30 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(ageMs) || ageMs > maxAge)
    return { ok: false, reason: `${c.id}: stale (>${Math.round(maxAge / 86400000)}d)` };
  return { ok: true };
}

function wilsonInterval(wins: number, total: number): [number, number] {
  if (total <= 0) return [0, 0];
  const z = 1.96;
  const p = wins / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return [
    Math.max(0, (center - margin) * 100),
    Math.min(100, (center + margin) * 100),
  ];
}

function unavailable(
  reason: string,
  candidateCount: number,
  rejected: readonly string[] = [],
  capability: HistoricalCapability = "NO_COMPATIBLE_RUN",
): HistoricalAccuracyResult {
  return {
    source: "UNAVAILABLE",
    capability,
    reason,
    runId: null,
    sampleSize: null,
    wins: null,
    losses: null,
    neutral: null,
    winRatePct: null,
    direction: "NEUTRAL",
    confidenceIntervalPct: null,
    evaluatedAt: null,
    formulaVersion: null,
    strategyVersion: null,
    freshness: "UNKNOWN",
    candidateCount,
    rejectedReasons: rejected,
  };
}

export function selectHistoricalAccuracy(
  candidates: readonly HistoricalRunCandidate[],
  ctx: HistoricalSelectionContext,
): HistoricalAccuracyResult {
  if (candidates.length === 0) {
    return unavailable("No historical runs available", 0, [], "NO_DATA");
  }
  const rejected: string[] = [];
  const compatible: HistoricalRunCandidate[] = [];
  for (const c of candidates) {
    const chk = isCompatible(c, ctx);
    if (chk.ok) compatible.push(c);
    else rejected.push(chk.reason);
  }
  if (compatible.length === 0) {
    return unavailable(
      "No compatible historical run for current strategy/formula/instrument",
      candidates.length,
      rejected,
    );
  }
  compatible.sort((a, b) => {
    const p = PRIORITY[a.source] - PRIORITY[b.source];
    if (p !== 0) return p;
    return Date.parse(b.evaluatedAt) - Date.parse(a.evaluatedAt);
  });
  const winner = compatible[0];
  const total = winner.wins + winner.losses + winner.neutral;
  const decidable = winner.wins + winner.losses;
  const winRatePct = decidable > 0 ? (winner.wins / decidable) * 100 : 50;
  const ageMs = Date.parse(ctx.now) - Date.parse(winner.evaluatedAt);
  const freshness: "FRESH" | "STALE" =
    ageMs <= 7 * 86400000 ? "FRESH" : "STALE";
  return {
    source: winner.source,
    capability: "SUPPORTED",
    reason: `Selected ${winner.source} run ${winner.id}`,
    runId: winner.id,
    sampleSize: total,
    wins: winner.wins,
    losses: winner.losses,
    neutral: winner.neutral,
    winRatePct,
    direction: winner.direction ?? "NEUTRAL",
    confidenceIntervalPct: wilsonInterval(winner.wins, Math.max(1, decidable)),
    evaluatedAt: winner.evaluatedAt,
    formulaVersion: winner.formulaVersion,
    strategyVersion: winner.strategyVersion,
    freshness,
    candidateCount: candidates.length,
    rejectedReasons: rejected,
  };
}