// Phase 27 · Stage 3 — Pure, deterministic breadth calculators.
//
// Consumes symbol ticks and a versioned weight map. Never fabricates
// missing constituents; symbols without a tick count as UNAVAILABLE.

import type {
  BreadthUniverse,
  MarketBreadthSnapshot,
  BreadthQuality,
  SymbolTick,
} from "./types";
import { MARKET_BREADTH_FORMULA_VERSION } from "./types";

export interface BuildBreadthOptions {
  readonly universe: BreadthUniverse;
  readonly provider: string;
  readonly timestamp: string;
  readonly expectedSymbols: readonly string[];
  readonly weights?: ReadonlyMap<string, number>;
  readonly ticks: readonly SymbolTick[];
  readonly registryVersion?: string | null;
  readonly freshnessMs?: number;      // measured freshness of source data
  readonly staleThresholdMs?: number; // over this → STALE
  readonly snapshotId: string;
}

function classifyFreshness(freshnessMs: number | undefined, staleAfter: number): "FRESH" | "STALE" | "UNKNOWN" {
  if (freshnessMs == null) return "UNKNOWN";
  if (!Number.isFinite(freshnessMs)) return "UNKNOWN";
  return freshnessMs <= staleAfter ? "FRESH" : "STALE";
}

export function computeBreadth(opts: BuildBreadthOptions): MarketBreadthSnapshot {
  const warnings: string[] = [];
  const stale = opts.staleThresholdMs ?? 5 * 60 * 1000;
  const freshness = classifyFreshness(opts.freshnessMs, stale);

  const byName = new Map<string, SymbolTick>();
  for (const t of opts.ticks) byName.set(t.symbol, t);

  const total = opts.expectedSymbols.length;
  let advances = 0;
  let declines = 0;
  let unchanged = 0;
  let unavailable = 0;

  let weightedAdvance = 0;
  let weightedDecline = 0;
  let weightedUnchanged = 0;
  let totalWeight = 0;

  for (const sym of opts.expectedSymbols) {
    const t = byName.get(sym);
    const w = opts.weights?.get(sym) ?? null;
    if (w != null) totalWeight += w;
    if (!t || t.direction === "UNAVAILABLE") {
      unavailable++;
      continue;
    }
    if (t.direction === "ADVANCE") {
      advances++;
      if (w != null) weightedAdvance += w;
    } else if (t.direction === "DECLINE") {
      declines++;
      if (w != null) weightedDecline += w;
    } else {
      unchanged++;
      if (w != null) weightedUnchanged += w;
    }
  }

  const covered = total - unavailable;
  const coverage = total > 0 ? covered / total : 0;
  const netBreadth = advances - declines;
  const denominator = advances + declines;
  const advanceDeclineRatio = declines > 0 ? advances / declines : advances > 0 ? Number.POSITIVE_INFINITY : null;
  const advancePercentage = total > 0 ? (advances / total) * 100 : null;
  const declinePercentage = total > 0 ? (declines / total) * 100 : null;
  const weightedNet = opts.weights ? weightedAdvance - weightedDecline : null;

  let dataQuality: BreadthQuality;
  if (total === 0 || covered === 0) dataQuality = "FAILED";
  else if (freshness === "STALE") dataQuality = "STALE";
  else if (coverage < 1) dataQuality = "PARTIAL";
  else dataQuality = "OK";

  if (coverage < 1) {
    warnings.push(`Partial coverage: ${covered}/${total}`);
  }
  if (freshness === "STALE") warnings.push("Source data is STALE");
  if (opts.weights && Math.abs(totalWeight - 1) > 0.05 && opts.universe !== "NIFTY_TOP_WEIGHTED") {
    warnings.push(`Weight registry sum ${totalWeight.toFixed(3)} deviates from 1.0`);
  }

  // Guard: A/D ratio Infinity → represent as null for JSON safety.
  const adRatioSafe =
    advanceDeclineRatio == null ? null : Number.isFinite(advanceDeclineRatio) ? advanceDeclineRatio : null;

  return {
    timestamp: opts.timestamp,
    provider: opts.provider,
    universe: opts.universe,
    totalSymbols: total,
    advances,
    declines,
    unchanged,
    unavailable,
    advanceDeclineRatio: adRatioSafe,
    advancePercentage,
    declinePercentage,
    netBreadth,
    weightedBreadth: weightedNet,
    weightedAdvance: opts.weights ? weightedAdvance : null,
    weightedDecline: opts.weights ? weightedDecline : null,
    weightedUnchanged: opts.weights ? weightedUnchanged : null,
    totalWeight: opts.weights ? totalWeight : null,
    freshness,
    dataQuality,
    constituentCoverage: coverage,
    snapshotId: opts.snapshotId,
    registryVersion: opts.registryVersion ?? null,
    warnings,
  };
}

export function _formulaVersion(): string {
  return MARKET_BREADTH_FORMULA_VERSION;
}
