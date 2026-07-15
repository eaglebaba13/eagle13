// Phase 21.2 · Stage 5 — Shadow Alert FSM.
//
// Deterministic state machine. Produces VALIDATION-ONLY alerts that never
// touch broker, notification, or Decision surfaces. Consumers persist history
// client-side under `shadow-alerts-v1`. Never writes to broker audit logs.

import { SHADOW_ALERT_VERSION, INTRADAY_FORMULA_VERSIONS } from "./engine-version";
import type { RankedLevel } from "./gann-level-ranking";
import type { LevelSimulation } from "./gann-intraday-simulator";
import type { InstrumentSymbol } from "./gann-intraday-policy";

export type ShadowStage =
  | "LEVEL_APPROACHING"
  | "LEVEL_TOUCHED"
  | "CONFIRMATION_WAIT"
  | "RETEST_WAIT"
  | "ENTRY_READY_SHADOW"
  | "MISSED_CHASE"
  | "INVALIDATED"
  | "TARGET_HIT"
  | "STOP_HIT"
  | "WAIT"
  | "DATA_INCOMPLETE";

export type ShadowInputs = {
  instrument: InstrumentSymbol;
  tradingDate: string;
  todayIst: string;
  snapshotStatus: string;
  formulaVersion: string;
  simulation: LevelSimulation | null;
  level: RankedLevel | null;
  livePrice: number | null;
  lastCandleClosed: boolean;
  providerHealthy: boolean;
};

export type ShadowEvent = {
  version: typeof SHADOW_ALERT_VERSION;
  labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION";
  timestamp: string;
  instrument: InstrumentSymbol;
  formulaVersion: string;
  stage: ShadowStage;
  reasons: string[];
  level: {
    planet: string;
    value: number;
    side: string;
    safety: string;
    pivotConfluence: string;
    cluster: number;
  } | null;
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
  cubeGrade: string | null;
};

function baseEvent(
  i: ShadowInputs,
  stage: ShadowStage,
  reasons: string[],
): ShadowEvent {
  return {
    version: SHADOW_ALERT_VERSION,
    labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
    timestamp: new Date().toISOString(),
    instrument: i.instrument,
    formulaVersion: i.formulaVersion,
    stage,
    reasons,
    level: i.level
      ? {
          planet: i.level.planet,
          value: i.level.value,
          side: i.level.side,
          safety: i.level.safety,
          pivotConfluence: i.level.pivotConfluence,
          cluster: i.level.clusterCount,
        }
      : null,
    entry: i.simulation?.entry ?? null,
    stopLoss: i.simulation?.stopLoss ?? null,
    target: i.simulation?.target ?? null,
    cubeGrade: i.simulation?.cube.cubeGrade ?? null,
  };
}

/**
 * Compute the current shadow stage. Never emits ENTRY_READY_SHADOW unless
 * every safety precondition passes (spec §20).
 */
export function computeShadowEvent(i: ShadowInputs): ShadowEvent {
  const reasons: string[] = [];

  if (!i.providerHealthy) reasons.push("Provider unhealthy");
  if (i.tradingDate !== i.todayIst) reasons.push("Trading date mismatch");
  if (
    i.snapshotStatus !== "LOCKED" &&
    i.snapshotStatus !== "HISTORICAL_LOCKED"
  )
    reasons.push("Snapshot not locked");
  if (i.formulaVersion !== INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1)
    reasons.push("Formula version mismatch");

  if (reasons.length > 0) return baseEvent(i, "DATA_INCOMPLETE", reasons);
  if (!i.level || !i.simulation) return baseEvent(i, "WAIT", ["No candidate level"]);

  const s = i.simulation;
  if (s.outcome === "TARGET") return baseEvent(i, "TARGET_HIT", ["Target hit"]);
  if (s.outcome === "STOP") return baseEvent(i, "STOP_HIT", ["Stop hit"]);
  if (s.outcome === "INVALIDATED") return baseEvent(i, "INVALIDATED", ["Setup invalidated"]);
  if (s.outcome === "MISSED_CHASE") return baseEvent(i, "MISSED_CHASE", ["Missed retest window"]);

  // Cube gating.
  const approved = s.cube.mandatoryPassed && (s.cube.action === "BUY" || s.cube.action === "SELL");
  const pivotOk = i.level.safety === "SAFE" || i.level.pivotConfluence !== "NONE";
  if (!approved) return baseEvent(i, "WAIT", s.cube.reasons.length ? s.cube.reasons : ["Cube not approved"]);
  if (!pivotOk) return baseEvent(i, "WAIT", ["Risky level without pivot confirmation"]);

  if (s.retestIndex != null && s.entry != null && i.lastCandleClosed)
    return baseEvent(i, "ENTRY_READY_SHADOW", ["Retest completed", ...s.cube.reasons]);
  if (s.confirmIndex != null) return baseEvent(i, "RETEST_WAIT", ["Confirmation candle closed"]);
  if (s.touchIndex != null) return baseEvent(i, "CONFIRMATION_WAIT", ["Level touched"]);

  // Approaching?
  if (i.livePrice != null) {
    const dist = Math.abs(i.livePrice - i.level.value);
    if (dist <= 25) return baseEvent(i, "LEVEL_APPROACHING", [`Distance ${dist.toFixed(1)}pt`]);
  }
  return baseEvent(i, "WAIT", ["Awaiting first touch"]);
}

export const SHADOW_HISTORY_LIMIT = 100;

export function appendShadowHistory(
  history: ShadowEvent[],
  event: ShadowEvent,
): ShadowEvent[] {
  const next = [...history, event];
  return next.slice(-SHADOW_HISTORY_LIMIT);
}