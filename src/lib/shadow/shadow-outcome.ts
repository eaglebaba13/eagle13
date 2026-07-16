// Phase 23 · Stage 1 — Shadow outcome tracker. Pure and deterministic.
// Steps through subsequent closed candles and resolves TARGET / STOP /
// SESSION_CLOSE / MAX_HOLD / INVALIDATED / DATA_QUALITY exits without ever
// touching a real broker path.

import {
  emptyOutcome,
  type ShadowClosedCandle,
  type ShadowHypotheticalPosition,
  type ShadowOutcome,
  type ShadowPolicy,
} from "./shadow-types";

export type OutcomeInput = {
  readonly position: ShadowHypotheticalPosition;
  readonly candles: readonly ShadowClosedCandle[]; // future closed candles
  readonly policy: ShadowPolicy;
  readonly invalidated?: boolean;
  readonly dataQualityFailed?: boolean;
};

export function trackOutcome(inp: OutcomeInput): ShadowOutcome {
  if (inp.dataQualityFailed) {
    return { ...emptyOutcome(), resolved: true, exit: "DATA_QUALITY" };
  }
  if (inp.invalidated) {
    return { ...emptyOutcome(), resolved: true, exit: "INVALIDATED" };
  }
  const p = inp.position;
  let mfe = 0;
  let mae = 0;
  const maxHold = inp.policy.maxHoldBars ?? Number.POSITIVE_INFINITY;
  for (let i = 0; i < inp.candles.length; i++) {
    const c = inp.candles[i];
    // MFE / MAE (in points) using bar range.
    if (p.side === "LONG") {
      mfe = Math.max(mfe, c.high - p.entry);
      mae = Math.min(mae, c.low - p.entry);
      // Assume worst-case ordering: if stop and target both touched in the
      // same bar, STOP resolves first (conservative research assumption).
      if (c.low <= p.stop) {
        return finalize("STOP", p.stop, c.date, mfe, mae, i + 1, p, inp.policy);
      }
      if (c.high >= p.target) {
        return finalize("TARGET", p.target, c.date, mfe, mae, i + 1, p, inp.policy);
      }
    } else {
      mfe = Math.max(mfe, p.entry - c.low);
      mae = Math.min(mae, p.entry - c.high);
      if (c.high >= p.stop) {
        return finalize("STOP", p.stop, c.date, mfe, mae, i + 1, p, inp.policy);
      }
      if (c.low <= p.target) {
        return finalize("TARGET", p.target, c.date, mfe, mae, i + 1, p, inp.policy);
      }
    }
    if (i + 1 >= maxHold) {
      return finalize("MAX_HOLD", c.close, c.date, mfe, mae, i + 1, p, inp.policy);
    }
  }
  const last = inp.candles[inp.candles.length - 1];
  if (!last) return emptyOutcome();
  return finalize("SESSION_CLOSE", last.close, last.date, mfe, mae, inp.candles.length, p, inp.policy);
}

function finalize(
  exit: NonNullable<ShadowOutcome["exit"]>,
  exitPrice: number,
  exitDate: string,
  mfe: number,
  mae: number,
  bars: number,
  p: ShadowHypotheticalPosition,
  policy: ShadowPolicy,
): ShadowOutcome {
  const points = p.side === "LONG" ? exitPrice - p.entry : p.entry - exitPrice;
  const costs = policy.costsPct * p.entry;
  return {
    resolved: true,
    exit,
    exitPrice,
    exitDate,
    mfe,
    mae,
    holdingBars: bars,
    netPoints: points,
    netAfterCosts: points - costs,
  };
}