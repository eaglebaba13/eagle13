// Phase 21.2 · Layer 3 — Execution Confirmation Engine.
//
// Pure state machine over an intraday level. Given a stream of price ticks
// and 5-minute candle closes, drive the state machine per spec §§16–19.

import type { RankedLevel } from "./gann-level-ranking";
import { getInstrumentPolicy, type InstrumentSymbol } from "./gann-intraday-policy";

export type ExecutionState =
  | "PENDING_TOUCH"
  | "TOUCHED"
  | "WAITING_CANDLE"
  | "CONFIRMED"
  | "WAITING_RETEST"
  | "ENTRY_READY"
  | "MISSED_CHASE"
  | "INVALIDATED";

export type Candle5m = {
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ExecutionPlan = {
  state: ExecutionState;
  level: RankedLevel;
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
  /** Distance from level at which entry is still permitted. */
  maxEntryDeviation: number;
};

export function initExecution(
  instrument: InstrumentSymbol,
  level: RankedLevel,
): ExecutionPlan {
  const policy = getInstrumentPolicy(instrument);
  return {
    state: "PENDING_TOUCH",
    level,
    entry: null,
    stopLoss: null,
    target: null,
    maxEntryDeviation: policy.maximumEntryDeviation,
  };
}

function computeStopTarget(
  instrument: InstrumentSymbol,
  entry: number,
  side: "BUY" | "SELL",
): { stopLoss: number; target: number } {
  const p = getInstrumentPolicy(instrument);
  if (side === "BUY") {
    return { stopLoss: entry - p.stopLossPoints, target: entry + p.targetPoints };
  }
  return { stopLoss: entry + p.stopLossPoints, target: entry - p.targetPoints };
}

/** Register the first price touch of the level's tolerance band. Spec §16. */
export function onTouch(plan: ExecutionPlan): ExecutionPlan {
  if (plan.state !== "PENDING_TOUCH") return plan;
  return { ...plan, state: "WAITING_CANDLE" };
}

/**
 * Apply a 5-minute candle close. Returns a plan whose state advances to
 * CONFIRMED (touch + correct-colour close), WAITING_RETEST (close beyond
 * maxEntryDeviation), or INVALIDATED (opposite-colour close).
 */
export function onCandleClose(
  instrument: InstrumentSymbol,
  plan: ExecutionPlan,
  candle: Candle5m,
): ExecutionPlan {
  if (plan.state !== "WAITING_CANDLE" && plan.state !== "WAITING_RETEST") return plan;
  const green = candle.close > candle.open;
  const red = candle.close < candle.open;
  const buySide = plan.level.tradeBias === "BUY";
  const sellSide = plan.level.tradeBias === "SELL";
  const correct = (buySide && green) || (sellSide && red);
  const wrong = (buySide && red) || (sellSide && green);
  if (wrong) return { ...plan, state: "INVALIDATED" };
  if (!correct) return plan;

  const deviation = Math.abs(candle.close - plan.level.value);
  if (deviation > plan.maxEntryDeviation) {
    return { ...plan, state: "WAITING_RETEST" };
  }
  const side = buySide ? "BUY" : "SELL";
  const { stopLoss, target } = computeStopTarget(instrument, candle.close, side);
  return {
    ...plan,
    state: "ENTRY_READY",
    entry: candle.close,
    stopLoss,
    target,
  };
}

/**
 * A retest occurs after a WAITING_RETEST when price returns within
 * maxEntryDeviation of the level. Fills entry at the retest price.
 */
export function onRetest(
  instrument: InstrumentSymbol,
  plan: ExecutionPlan,
  price: number,
): ExecutionPlan {
  if (plan.state !== "WAITING_RETEST") return plan;
  const deviation = Math.abs(price - plan.level.value);
  if (deviation > plan.maxEntryDeviation) return plan;
  const side = plan.level.tradeBias === "BUY" ? "BUY" : "SELL";
  const { stopLoss, target } = computeStopTarget(instrument, price, side);
  return { ...plan, state: "ENTRY_READY", entry: price, stopLoss, target };
}

/** Called at session close — expire everything (spec §20). */
export function expireAtSessionClose(plan: ExecutionPlan): ExecutionPlan {
  if (plan.state === "ENTRY_READY") return plan;
  return { ...plan, state: "INVALIDATED" };
}