// Phase 29 · Signal Replay Engine — deterministic.
// Runs each historical snapshot through the existing Decision Engine,
// scores outcome, and classifies failures. Does NOT mutate any input.

import { computeOptionDecision } from "@/lib/option-strategy-decision/engine";
import type {
  FailureCategory,
  HistoricalSnapshot,
  ReplayResult,
  TradeOutcome,
} from "./types";

const WIN_THRESHOLD_PCT = 0.15; // ≥0.15% forward move counts as a win

function scoreOutcome(
  action: ReplayResult["action"],
  spot: number,
  forward: number | null,
): { outcome: TradeOutcome; returnPct: number } {
  if (action === "WAIT" || action === "NO_TRADE")
    return { outcome: action === "WAIT" ? "WAIT" : "NO_TRADE", returnPct: 0 };
  if (forward == null || spot <= 0) return { outcome: "WAIT", returnPct: 0 };
  const movePct = ((forward - spot) / spot) * 100;
  if (action === "BUY_CALL") {
    return {
      outcome: movePct >= WIN_THRESHOLD_PCT ? "WIN" : "LOSS",
      returnPct: round(movePct, 3),
    };
  }
  // BUY_PUT
  return {
    outcome: -movePct >= WIN_THRESHOLD_PCT ? "WIN" : "LOSS",
    returnPct: round(-movePct, 3),
  };
}

function round(x: number, d = 2): number {
  const m = 10 ** d;
  return Math.round(x * m) / m;
}

function classifyFailure(snap: HistoricalSnapshot, r: ReplayResult): FailureCategory | null {
  if (r.outcome !== "LOSS") return null;
  const vix = snap.input.vix ?? null;
  if (vix != null && vix > 25) return "HIGH_VIX";
  if (r.confidence < 60) return "LOW_CONFIDENCE";
  if (r.decision.conflicts.length >= 2) return "CONFLICTING_SIGNALS";
  const netB = snap.input.breadth.netBreadth;
  if (snap.input.breadth.available && netB != null && Math.abs(netB) < 0.1)
    return "WEAK_BREADTH";
  const oi = snap.input.oi;
  if (oi.available && oi.buildUp && (oi.buildUp === "SHORT_COVERING" || oi.buildUp === "LONG_UNWINDING"))
    return "POOR_OI";
  // Direction flipped hard vs signal
  if (snap.forwardPrice != null && snap.spotPrice > 0) {
    const move = (snap.forwardPrice - snap.spotPrice) / snap.spotPrice;
    if ((r.action === "BUY_CALL" && move < -0.005) || (r.action === "BUY_PUT" && move > 0.005))
      return "MARKET_REVERSAL";
  }
  return "UNKNOWN";
}

/** Replay a single snapshot. Pure. */
export function replaySnapshot(snap: HistoricalSnapshot, holdingBars = 1): ReplayResult {
  const decision = computeOptionDecision(snap.input);
  const { outcome, returnPct } = scoreOutcome(decision.action, snap.spotPrice, snap.forwardPrice);
  const partial: ReplayResult = {
    timestamp: snap.timestamp,
    spotPrice: snap.spotPrice,
    forwardPrice: snap.forwardPrice,
    bullScore: decision.bullScore,
    bearScore: decision.bearScore,
    confidence: decision.confidence,
    action: decision.action,
    strike: decision.strike.strike,
    moneyness: decision.strike.moneyness,
    regime: snap.regime,
    institutionalFlow: snap.institutionalFlow,
    outcome,
    returnPct,
    holdingBars,
    decision,
    failure: null,
  };
  return { ...partial, failure: classifyFailure(snap, partial) };
}

/** Replay an ordered series. */
export function replaySeries(
  snapshots: readonly HistoricalSnapshot[],
  holdingBars = 1,
): readonly ReplayResult[] {
  return snapshots.map((s) => replaySnapshot(s, holdingBars));
}