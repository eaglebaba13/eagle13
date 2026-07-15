// Phase 21.4 · Stage 4C — Data-quality state classifier.
// Pure. Maps a DataQualityReport + freshness into a coarse status label.

import type { DataQualityReport } from "../candle-data-quality";

export type DataQualityState =
  | "LIVE"
  | "DELAYED"
  | "STALE"
  | "PARTIAL"
  | "UNAVAILABLE";

export type DataQualityInput = {
  report: DataQualityReport;
  candleCount: number;
  /** Provider timestamp (ms) of the newest bar; null when unknown. */
  latestCandleMs: number | null;
  /** Wall-clock reference (ms). Defaults to Date.now(). */
  nowMs?: number;
  /** Historical vs live evaluation. Historical mode ignores freshness. */
  mode: "historical" | "live";
};

const LIVE_MAX_LAG_MS = 5 * 60_000; // ≤ 5m
const DELAYED_MAX_LAG_MS = 30 * 60_000; // ≤ 30m

export function classifyDataQuality(input: DataQualityInput): DataQualityState {
  const { report, candleCount, latestCandleMs, mode } = input;
  if (candleCount === 0) return "UNAVAILABLE";
  if (report.outOfOrderCount > 0 || report.causalityFailures > 0) {
    return "UNAVAILABLE";
  }
  if (report.coveragePct < 60) return "UNAVAILABLE";
  if (report.coveragePct < 90 || report.gaps.length > 0) return "PARTIAL";
  if (mode === "historical") return "LIVE";
  if (latestCandleMs === null) return "STALE";
  const now = input.nowMs ?? Date.now();
  const lag = now - latestCandleMs;
  if (lag < 0) return "STALE"; // future timestamps are not trustworthy
  if (lag <= LIVE_MAX_LAG_MS) return "LIVE";
  if (lag <= DELAYED_MAX_LAG_MS) return "DELAYED";
  return "STALE";
}

export function isTradableStatus(s: DataQualityState): boolean {
  return s === "LIVE" || s === "DELAYED";
}