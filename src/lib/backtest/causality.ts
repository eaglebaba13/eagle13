// Phase 21.3 · Unified causality guards. Wraps existing helpers so daily and
// intraday adapters share one import surface. No new logic.

export { assertCausal, validateCandle } from "../backtest-engine";
export type { OhlcCandle, CandleValidation } from "../backtest-engine";

import type { CausalityMode } from "./result";

/** Intraday guard: rejects a candle whose end is at or after `nowTs`. */
export function assertClosedCandle(candleEndTs: number, nowTs: number):
  | { ok: true }
  | { ok: false; reason: string } {
  if (!Number.isFinite(candleEndTs) || !Number.isFinite(nowTs)) {
    return { ok: false, reason: "CANDLE_TS_INVALID" };
  }
  if (candleEndTs > nowTs) {
    return { ok: false, reason: "OPEN_CANDLE_LEAKAGE" };
  }
  return { ok: true };
}

/** Intraday guard: rejects reads before the 09:15 IST anchor. */
export function assertPostSnapshot(nowTs: number, snapshotTs: number):
  | { ok: true }
  | { ok: false; reason: string } {
  if (nowTs < snapshotTs) {
    return { ok: false, reason: "PRE_SNAPSHOT_LEAKAGE" };
  }
  return { ok: true };
}

export function requiredCausalityFor(granularity: "1d" | "5m"): CausalityMode {
  return granularity === "1d" ? "daily" : "intraday-5m";
}
