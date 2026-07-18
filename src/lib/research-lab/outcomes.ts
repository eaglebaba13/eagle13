// Phase 3E — Deterministic outcome computation.

import type {
  GapDirection,
  HistoricalRow,
  Outcome,
  OutcomeThresholds,
} from "./types";
import { DEFAULT_OUTCOME_THRESHOLDS } from "./types";

export function classifyGap(
  prevClose: number | null,
  nextOpen: number | null,
  thresholds: OutcomeThresholds = DEFAULT_OUTCOME_THRESHOLDS,
): GapDirection | null {
  if (
    prevClose == null || nextOpen == null ||
    !Number.isFinite(prevClose) || !Number.isFinite(nextOpen) ||
    prevClose <= 0
  ) return null;
  const pct = (nextOpen - prevClose) / prevClose;
  if (Math.abs(pct) <= thresholds.flatGapTolerancePct) return "FLAT";
  return pct > 0 ? "GAP_UP" : "GAP_DOWN";
}

export function computeOutcome(
  currentIndex: number,
  rows: readonly HistoricalRow[],
  thresholds: OutcomeThresholds = DEFAULT_OUTCOME_THRESHOLDS,
): Outcome {
  const cur = rows[currentIndex];
  const next = rows[currentIndex + 1];
  if (!cur || !next) {
    return {
      available: false,
      nextGapPoints: null,
      nextGapPct: null,
      gapDirection: null,
      nextOpenToClose: null,
      nextHighExcursion: null,
      nextLowExcursion: null,
      return1Session: null,
      return3Session: null,
      return5Session: null,
      mfe: 0,
      mae: 0,
      reason: "NEXT_SESSION_MISSING",
    };
  }
  const prevClose = cur.close;
  const gapPoints = next.open - prevClose;
  const gapPct = prevClose > 0 ? gapPoints / prevClose : null;
  const gapDir = classifyGap(prevClose, next.open, thresholds);
  const openToClose = next.close - next.open;
  const highExc = next.high - next.open;
  const lowExc = next.low - next.open;
  const ret1 = prevClose > 0 ? (next.close - prevClose) / prevClose : null;
  const nextIdx = currentIndex + 1;
  const r3 = rows[nextIdx + 2];
  const r5 = rows[nextIdx + 4];
  const ret3 = r3 && prevClose > 0 ? (r3.close - prevClose) / prevClose : null;
  const ret5 = r5 && prevClose > 0 ? (r5.close - prevClose) / prevClose : null;
  // MFE/MAE across next session bar (single bar approximation, deterministic).
  const mfe = Math.max(highExc, openToClose, 0);
  const mae = Math.min(lowExc, openToClose, 0);
  return {
    available: true,
    nextGapPoints: gapPoints,
    nextGapPct: gapPct,
    gapDirection: gapDir,
    nextOpenToClose: openToClose,
    nextHighExcursion: highExc,
    nextLowExcursion: lowExc,
    return1Session: ret1,
    return3Session: ret3,
    return5Session: ret5,
    mfe,
    mae,
  };
}
