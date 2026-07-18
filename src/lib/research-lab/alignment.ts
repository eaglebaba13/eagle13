// Phase 3E — Time alignment and anti-leakage detection.

import type { HistoricalRow, SignalEvent } from "./types";

export interface LeakageCheck {
  readonly ok: boolean;
  readonly violations: readonly string[];
}

/**
 * A signal is eligible only if its `signalTimestamp` is at or before
 * the session's close timestamp. Signals published after close leak
 * information into the same-session outcome and must be rejected.
 */
export function checkSignalLeakage(
  event: SignalEvent,
  row: HistoricalRow,
): LeakageCheck {
  const violations: string[] = [];
  if (event.symbol !== row.symbol) {
    violations.push("SYMBOL_MISMATCH");
  }
  if (event.sessionDate !== row.sessionDate) {
    violations.push("SESSION_DATE_MISMATCH");
  }
  const signalTs = Date.parse(event.signalTimestamp);
  const rowTs = Date.parse(row.timestamp);
  if (Number.isFinite(signalTs) && Number.isFinite(rowTs) && signalTs > rowTs) {
    violations.push("FUTURE_SIGNAL_TIMESTAMP");
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Returns the row that represents the "next eligible trading session"
 * for outcome measurement. Rows are assumed to be sorted by date.
 */
export function nextSessionRow(
  rows: readonly HistoricalRow[],
  currentIndex: number,
): HistoricalRow | null {
  const next = rows[currentIndex + 1];
  return next ?? null;
}

/**
 * Detects missing sessions when the gap between consecutive rows is
 * greater than 4 calendar days (long weekends/holidays are OK, longer
 * gaps are flagged).
 */
export function detectMissingSessions(rows: readonly HistoricalRow[]): number {
  let missing = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = Date.parse(rows[i - 1].sessionDate);
    const cur = Date.parse(rows[i].sessionDate);
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    const days = Math.round((cur - prev) / 86_400_000);
    if (days > 4) missing += days - 4;
    if (days <= 0) missing += 1; // duplicate or non-monotonic
  }
  return missing;
}

export function detectDuplicates(rows: readonly HistoricalRow[]): number {
  const seen = new Set<string>();
  let dups = 0;
  for (const r of rows) {
    const k = `${r.symbol}|${r.sessionDate}`;
    if (seen.has(k)) dups++;
    else seen.add(k);
  }
  return dups;
}

export function detectNonMonotonic(rows: readonly HistoricalRow[]): number {
  let bad = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].sessionDate <= rows[i - 1].sessionDate) bad++;
  }
  return bad;
}

export function detectInvalidOhlc(rows: readonly HistoricalRow[]): number {
  let bad = 0;
  for (const r of rows) {
    if (r.high < r.low || r.high < r.open || r.high < r.close) bad++;
    else if (r.low > r.open || r.low > r.close) bad++;
    else if (r.open <= 0 || r.close <= 0 || r.high <= 0 || r.low <= 0) bad++;
  }
  return bad;
}
