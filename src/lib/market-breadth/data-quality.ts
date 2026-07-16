// Phase 27 · Stage 3 — Data-quality gates for breadth inputs.

import type { MarketBreadthSnapshot, SymbolTick } from "./types";

export interface DataQualityIssue {
  readonly code: string;
  readonly message: string;
}

export interface DataQualityReport {
  readonly issues: readonly DataQualityIssue[];
  readonly hardFail: boolean;
}

export function checkTicks(
  expected: readonly string[],
  ticks: readonly SymbolTick[],
  now: number = Date.now(),
  timestamp?: string,
): DataQualityReport {
  const issues: DataQualityIssue[] = [];
  const seen = new Set<string>();
  const expectedSet = new Set(expected);
  for (const t of ticks) {
    if (seen.has(t.symbol)) issues.push({ code: "DUPLICATE_SYMBOL", message: `duplicate: ${t.symbol}` });
    seen.add(t.symbol);
    if (!expectedSet.has(t.symbol)) {
      issues.push({ code: "UNKNOWN_SYMBOL", message: `unknown: ${t.symbol}` });
    }
  }
  const missing = expected.filter((s) => !seen.has(s));
  if (missing.length > 0) {
    issues.push({ code: "MISSING_CONSTITUENTS", message: `missing ${missing.length}/${expected.length}` });
  }
  if (timestamp) {
    const ts = Date.parse(timestamp);
    if (!Number.isFinite(ts)) issues.push({ code: "BAD_TIMESTAMP", message: timestamp });
    else if (ts - now > 60_000) issues.push({ code: "FUTURE_TIMESTAMP", message: timestamp });
  }
  const hardFail =
    expected.length === 0 || missing.length === expected.length;
  return { issues, hardFail };
}

export function isSnapshotActionable(s: MarketBreadthSnapshot | null): boolean {
  return !!s && s.dataQuality !== "FAILED" && (s.constituentCoverage ?? 0) > 0;
}
