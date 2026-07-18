// Phase 3E — Aggregate data-quality classifier.

import {
  detectDuplicates,
  detectInvalidOhlc,
  detectMissingSessions,
  detectNonMonotonic,
} from "./alignment";
import type { DataQualityFlag, DataQualityReport, HistoricalRow, SignalEvent } from "./types";

export function assessDataQuality(input: {
  readonly rows: readonly HistoricalRow[];
  readonly signals: readonly SignalEvent[];
  readonly nowIso: string;
}): DataQualityReport {
  const rows = input.rows;
  const dups = detectDuplicates(rows);
  const nonMono = detectNonMonotonic(rows);
  const missing = detectMissingSessions(rows);
  const invalid = detectInvalidOhlc(rows);
  let negative = 0;
  let future = 0;
  let missingPrev = 0;
  let missingNext = 0;
  let stale = 0;
  let partial = 0;
  const nowTs = Date.parse(input.nowIso);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.open < 0 || r.close < 0 || r.high < 0 || r.low < 0) negative++;
    const ts = Date.parse(r.timestamp);
    if (Number.isFinite(ts) && Number.isFinite(nowTs) && ts > nowTs) future++;
    if (r.previousClose == null) missingPrev++;
    if (i === rows.length - 1) missingNext++;
    if (r.qualityFlags.includes("PARTIAL")) partial++;
  }
  let leakage = 0;
  let formulaMismatches = 0;
  const seenVersions = new Set<string>();
  for (const s of input.signals) {
    const rowTs = Date.parse(s.signalTimestamp);
    if (Number.isFinite(rowTs) && Number.isFinite(nowTs) && rowTs > nowTs) leakage++;
    seenVersions.add(`${s.family}:${s.formulaVersion}`);
  }
  formulaMismatches = Math.max(0, seenVersions.size - new Set([...seenVersions].map((v) => v.split(":")[0])).size);
  const overall: DataQualityFlag =
    leakage > 0 ? "LEAKAGE_DETECTED"
    : invalid > 0 || negative > 0 || future > 0 ? "INVALID"
    : dups > 0 || nonMono > 0 || missing > 0 || partial > 0 ? "PARTIAL"
    : "OK";
  const warnings: string[] = [];
  if (dups > 0) warnings.push(`DUPLICATE_ROWS:${dups}`);
  if (nonMono > 0) warnings.push(`NON_MONOTONIC:${nonMono}`);
  if (invalid > 0) warnings.push(`INVALID_OHLC:${invalid}`);
  if (leakage > 0) warnings.push(`LEAKAGE:${leakage}`);
  return {
    duplicates: dups,
    missingSessions: missing,
    nonMonotonicTimestamps: nonMono,
    invalidOhlc: invalid,
    negativePrices: negative,
    futureTimestamps: future,
    missingPreviousClose: missingPrev,
    missingNextSession: missingNext,
    staleSignals: stale,
    formulaVersionMismatches: formulaMismatches,
    providerDiscontinuities: 0,
    partialCanonical: partial,
    leakageDetections: leakage,
    overall,
    warnings,
  };
}
