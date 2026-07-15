// Phase 21.2 · Stage 5.1 — data-quality report for a parsed 5-minute
// candle stream. Pure. Validates alignment, coverage, gaps, session window.

import type { ParsedCandle } from "./candle-csv-parser";

export type SessionGap = {
  tradingDate: string;
  missingCount: number;
  firstMissingIst: string;
  lastMissingIst: string;
};

export type DataQualityReport = {
  totalRows: number;
  validRows: number;
  duplicateCount: number;
  outOfOrderCount: number;
  outOfWindowCount: number;
  expectedCandlesPerSession: number;
  sessionsDetected: number;
  gaps: SessionGap[];
  coveragePct: number; // 0..100
  causalityFailures: number; // future-dated rows
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SESSION_START_MIN = 9 * 60 + 15;
const SESSION_END_MIN = 15 * 60 + 30;
const EXPECTED_PER_SESSION = 75; // (15:30 - 09:15) / 5m = 75

function istDateAndMinute(epochMs: number): { date: string; minute: number } {
  const d = new Date(epochMs + IST_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    minute: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

export function computeDataQuality(rows: ParsedCandle[]): DataQualityReport {
  const totalRows = rows.length;
  let outOfOrder = 0;
  let outOfWindow = 0;
  let causality = 0;
  const bySession = new Map<string, ParsedCandle[]>();
  const now = Date.now();
  let prevTs = -Infinity;
  for (const r of rows) {
    if (r.openTimeMs < prevTs) outOfOrder++;
    prevTs = r.openTimeMs;
    if (r.openTimeMs > now + 60_000) causality++;
    const { date, minute } = istDateAndMinute(r.openTimeMs);
    if (minute < SESSION_START_MIN || minute >= SESSION_END_MIN) {
      outOfWindow++;
      continue;
    }
    if (!bySession.has(date)) bySession.set(date, []);
    bySession.get(date)!.push(r);
  }

  const gaps: SessionGap[] = [];
  let totalPresent = 0;
  let totalExpected = 0;
  for (const [date, arr] of bySession) {
    const seenMinutes = new Set(
      arr.map((r) => istDateAndMinute(r.openTimeMs).minute),
    );
    let missingCount = 0;
    let firstMissing = -1;
    let lastMissing = -1;
    for (let m = SESSION_START_MIN; m < SESSION_END_MIN; m += 5) {
      if (!seenMinutes.has(m)) {
        missingCount++;
        if (firstMissing < 0) firstMissing = m;
        lastMissing = m;
      }
    }
    totalPresent += EXPECTED_PER_SESSION - missingCount;
    totalExpected += EXPECTED_PER_SESSION;
    if (missingCount > 0) {
      const fmt = (m: number) =>
        `${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00+05:30`;
      gaps.push({
        tradingDate: date,
        missingCount,
        firstMissingIst: fmt(firstMissing),
        lastMissingIst: fmt(lastMissing),
      });
    }
  }

  const validRows = totalRows - outOfWindow - causality;
  const duplicateCount = 0; // parser already rejected duplicates
  const coveragePct =
    totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 10000) / 100 : 0;

  return {
    totalRows,
    validRows,
    duplicateCount,
    outOfOrderCount: outOfOrder,
    outOfWindowCount: outOfWindow,
    expectedCandlesPerSession: EXPECTED_PER_SESSION,
    sessionsDetected: bySession.size,
    gaps,
    coveragePct,
    causalityFailures: causality,
  };
}

export function groupBySessionDate(
  rows: ParsedCandle[],
): Map<string, ParsedCandle[]> {
  const out = new Map<string, ParsedCandle[]>();
  for (const r of rows) {
    const { date, minute } = istDateAndMinute(r.openTimeMs);
    if (minute < SESSION_START_MIN || minute >= SESSION_END_MIN) continue;
    if (!out.has(date)) out.set(date, []);
    out.get(date)!.push(r);
  }
  for (const arr of out.values()) arr.sort((a, b) => a.openTimeMs - b.openTimeMs);
  return out;
}