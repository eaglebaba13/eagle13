// Phase 21.2 · Stage 4 — deterministic session simulator.
//
// Given ranked Astro levels, a session of 5-minute candles, and Cube inputs,
// drive each level through the existing execution FSM (Stage 2) plus the
// existing Cube evaluator (Stage 2). Compute outcome, MFE, MAE, and
// ambiguous-candle statistics. Spec §§2–7, 8, 9.
//
// STRICT no-future-leak invariant: when processing candle index i, the
// simulator only ever reads candles[0..i]. This is asserted by test.

import {
  initExecution,
  onCandleClose,
  onRetest,
  onTouch,
  expireAtSessionClose,
  type Candle5m,
  type ExecutionPlan,
} from "./gann-intraday-execution";
import {
  evaluateCube,
  type CubeInputs,
  type CubeResult,
} from "./gann-cube-engine";
import type { RankedLevel } from "./gann-level-ranking";
import { getInstrumentPolicy, type InstrumentSymbol } from "./gann-intraday-policy";
import type { TimedCandle5m } from "./gann-intraday-touch";

export type AmbiguousPolicy = "conservative" | "optimistic" | "exclude_ambiguous";
export const DEFAULT_AMBIGUOUS_POLICY: AmbiguousPolicy = "conservative";

export type SessionOutcome =
  | "TARGET"
  | "STOP"
  | "OPEN"
  | "MISSED_CHASE"
  | "INVALIDATED"
  | "NO_TOUCH"
  | "AMBIGUOUS_EXCLUDED";

export type LevelSimulation = {
  level: RankedLevel;
  cube: CubeResult;
  finalPlan: ExecutionPlan;
  touchIndex: number | null;
  confirmIndex: number | null;
  retestIndex: number | null;
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
  entryTimeIst: string | null;
  exitTimeIst: string | null;
  exitIndex: number | null;
  outcome: SessionOutcome;
  mfe: number;
  mae: number;
  ambiguousCandleCount: number;
  ambiguousExcluded: boolean;
  candlesConsumed: number;
};

export type SessionSimulation = {
  instrument: InstrumentSymbol;
  totalCandles: number;
  ambiguousPolicy: AmbiguousPolicy;
  perLevel: LevelSimulation[];
  counters: {
    firstTouch: number;
    confirmed: number;
    retest: number;
    missedChase: number;
    cubeApproved: number;
    cubeConflict: number;
    ambiguous: number;
    invalidated: number;
    targetHit: number;
    stopHit: number;
  };
  processingMicros: number;
};

function stripCandle(c: TimedCandle5m): Candle5m {
  return { open: c.open, high: c.high, low: c.low, close: c.close };
}

function candleTouchesLevel(
  c: TimedCandle5m,
  level: number,
  tol: number,
): boolean {
  if (c.low <= level && level <= c.high) return true;
  if (level > c.high) return level - c.high <= tol;
  return c.low - level <= tol;
}

function candlePriceRange(c: TimedCandle5m): { min: number; max: number } {
  return { min: c.low, max: c.high };
}

/**
 * Simulate one Astro level over the session.
 *
 * The state machine deliberately re-uses the existing pure helpers from
 * `gann-intraday-execution` to keep behaviour identical to Stage 2 unit
 * tests. Only the outer loop and outcome/MFE/MAE bookkeeping is new.
 */
export function simulateLevel(
  instrument: InstrumentSymbol,
  level: RankedLevel,
  candles: TimedCandle5m[],
  cubeInputs: Omit<CubeInputs, "level">,
  ambiguousPolicy: AmbiguousPolicy = DEFAULT_AMBIGUOUS_POLICY,
): LevelSimulation {
  const policy = getInstrumentPolicy(instrument);
  const tol = policy.maximumEntryDeviation;
  const cube = evaluateCube({ ...cubeInputs, level });

  let plan = initExecution(instrument, level);
  let touchIndex: number | null = null;
  let confirmIndex: number | null = null;
  let retestIndex: number | null = null;
  let entryTimeIst: string | null = null;
  let exitTimeIst: string | null = null;
  let exitIndex: number | null = null;
  let outcome: SessionOutcome = "NO_TOUCH";
  let mfe = 0;
  let mae = 0;
  let ambiguousCandleCount = 0;
  let ambiguousExcluded = false;
  let consumed = 0;

  const buySide = level.tradeBias === "BUY";
  const sellSide = level.tradeBias === "SELL";

  for (let i = 0; i < candles.length; i++) {
    consumed = i + 1;
    const c = candles[i];

    // Phase 1 — awaiting first touch.
    if (plan.state === "PENDING_TOUCH") {
      if (candleTouchesLevel(c, level.value, tol)) {
        touchIndex = i;
        plan = onTouch(plan);
      } else {
        continue;
      }
    }

    // Phase 2a — confirmation candle (only on candles AFTER the touch).
    if (plan.state === "WAITING_CANDLE" && touchIndex !== null && i > touchIndex) {
      const prev = plan.state;
      plan = onCandleClose(instrument, plan, stripCandle(c));
      if (prev === "WAITING_CANDLE" && plan.state !== "WAITING_CANDLE") {
        confirmIndex = i;
      }
      if (plan.state === "ENTRY_READY") {
        entryTimeIst = c.timeIst;
      }
      if (plan.state === "INVALIDATED") {
        outcome = "INVALIDATED";
        exitIndex = i;
        exitTimeIst = c.timeIst;
        break;
      }
    } else if (plan.state === "WAITING_RETEST") {
      // Phase 2b — retest: fill when price returns within tolerance band.
      const range = candlePriceRange(c);
      const withinLow = level.value - tol;
      const withinHigh = level.value + tol;
      if (range.max >= withinLow && range.min <= withinHigh) {
        const retestPrice = Math.max(withinLow, Math.min(withinHigh, level.value));
        plan = onRetest(instrument, plan, retestPrice);
        if (plan.state === "ENTRY_READY") {
          retestIndex = i;
          entryTimeIst = c.timeIst;
        }
      }
    }

    // Phase 3 — running trade; monitor SL/target + track MFE/MAE.
    if (
      plan.state === "ENTRY_READY" &&
      plan.entry != null &&
      plan.stopLoss != null &&
      plan.target != null
    ) {
      const entry = plan.entry;
      const sl = plan.stopLoss;
      const tgt = plan.target;
      // The candle that fills the entry doesn't retro-hit its own SL/target.
      if (i > (retestIndex ?? confirmIndex ?? -1)) {
        const stopHit = buySide ? c.low <= sl : c.high >= sl;
        const targetHit = buySide ? c.high >= tgt : c.low <= tgt;
        if (stopHit && targetHit) {
          ambiguousCandleCount++;
          if (ambiguousPolicy === "exclude_ambiguous") {
            ambiguousExcluded = true;
            outcome = "AMBIGUOUS_EXCLUDED";
            exitIndex = i;
            exitTimeIst = c.timeIst;
            break;
          }
          const won = ambiguousPolicy === "optimistic";
          outcome = won ? "TARGET" : "STOP";
          exitIndex = i;
          exitTimeIst = c.timeIst;
          const excursion = won ? tgt - entry : sl - entry;
          if (buySide) {
            mfe = Math.max(mfe, tgt - entry, c.high - entry);
            mae = Math.min(mae, sl - entry, c.low - entry);
          } else {
            mfe = Math.max(mfe, entry - tgt, entry - c.low);
            mae = Math.min(mae, entry - sl, entry - c.high);
          }
          void excursion;
          break;
        }
        if (stopHit) {
          outcome = "STOP";
          exitIndex = i;
          exitTimeIst = c.timeIst;
          if (buySide) {
            mfe = Math.max(mfe, c.high - entry);
            mae = Math.min(mae, sl - entry);
          } else {
            mfe = Math.max(mfe, entry - c.low);
            mae = Math.min(mae, entry - sl);
          }
          break;
        }
        if (targetHit) {
          outcome = "TARGET";
          exitIndex = i;
          exitTimeIst = c.timeIst;
          if (buySide) {
            mfe = Math.max(mfe, tgt - entry);
            mae = Math.min(mae, c.low - entry);
          } else {
            mfe = Math.max(mfe, entry - tgt);
            mae = Math.min(mae, entry - c.high);
          }
          break;
        }
        // Track intra-trade excursion.
        if (buySide) {
          mfe = Math.max(mfe, c.high - entry);
          mae = Math.min(mae, c.low - entry);
        } else if (sellSide) {
          mfe = Math.max(mfe, entry - c.low);
          mae = Math.min(mae, entry - c.high);
        }
      }
    }
  }

  // Post-loop resolution.
  if (outcome === "NO_TOUCH") {
    if (plan.state === "PENDING_TOUCH") {
      outcome = "NO_TOUCH";
    } else if (plan.state === "WAITING_RETEST") {
      // Never returned to the level within tolerance → missed chase.
      plan = { ...plan, state: "MISSED_CHASE" };
      outcome = "MISSED_CHASE";
    } else if (plan.state === "WAITING_CANDLE") {
      outcome = "NO_TOUCH";
    } else if (plan.state === "ENTRY_READY") {
      outcome = "OPEN";
    } else if (plan.state === "INVALIDATED") {
      outcome = "INVALIDATED";
    }
  }
  if (plan.state !== "ENTRY_READY" && outcome === "OPEN") {
    plan = expireAtSessionClose(plan);
  }

  return {
    level,
    cube,
    finalPlan: plan,
    touchIndex,
    confirmIndex,
    retestIndex,
    entry: plan.entry,
    stopLoss: plan.stopLoss,
    target: plan.target,
    entryTimeIst,
    exitTimeIst,
    exitIndex,
    outcome,
    mfe: Math.round(mfe * 100) / 100,
    mae: Math.round(mae * 100) / 100,
    ambiguousCandleCount,
    ambiguousExcluded,
    candlesConsumed: consumed,
  };
}

export type SimulateSessionArgs = {
  instrument: InstrumentSymbol;
  ranked: RankedLevel[];
  candles: TimedCandle5m[];
  cubeInputs: Omit<CubeInputs, "level">;
  ambiguousPolicy?: AmbiguousPolicy;
};

export function simulateSession(args: SimulateSessionArgs): SessionSimulation {
  const started =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const perLevel = args.ranked.map((lvl) =>
    simulateLevel(
      args.instrument,
      lvl,
      args.candles,
      args.cubeInputs,
      args.ambiguousPolicy ?? DEFAULT_AMBIGUOUS_POLICY,
    ),
  );
  const counters = {
    firstTouch: 0,
    confirmed: 0,
    retest: 0,
    missedChase: 0,
    cubeApproved: 0,
    cubeConflict: 0,
    ambiguous: 0,
    invalidated: 0,
    targetHit: 0,
    stopHit: 0,
  };
  for (const p of perLevel) {
    if (p.touchIndex != null) counters.firstTouch++;
    if (p.confirmIndex != null) counters.confirmed++;
    if (p.retestIndex != null) counters.retest++;
    if (p.outcome === "MISSED_CHASE") counters.missedChase++;
    if (p.outcome === "INVALIDATED") counters.invalidated++;
    if (p.outcome === "TARGET") counters.targetHit++;
    if (p.outcome === "STOP") counters.stopHit++;
    if (p.ambiguousCandleCount > 0) counters.ambiguous++;
    if (p.cube.action === "BUY" || p.cube.action === "SELL") counters.cubeApproved++;
    if (p.cube.action === "NO_TRADE_CONFLICT") counters.cubeConflict++;
  }
  const finished =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    instrument: args.instrument,
    totalCandles: args.candles.length,
    ambiguousPolicy: args.ambiguousPolicy ?? DEFAULT_AMBIGUOUS_POLICY,
    perLevel,
    counters,
    processingMicros: Math.round((finished - started) * 1000),
  };
}