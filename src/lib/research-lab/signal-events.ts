// Phase 3E — Normalize canonical outputs into research signal events.
// Consumer-only: reads snapshots off dataset rows. Never mutates
// canonical logic.

import type {
  HistoricalRow,
  ReadinessState,
  SignalEvent,
  SignalFamily,
} from "./types";

function readiness(available: boolean, partial: boolean): ReadinessState {
  if (!available) return "UNAVAILABLE";
  return partial ? "PARTIAL" : "READY";
}

export function eventsForRow(row: HistoricalRow): readonly SignalEvent[] {
  const events: SignalEvent[] = [];
  const ts = row.timestamp;
  if (row.decision) {
    const state = row.decision.state;
    const predicted =
      state === "BULLISH" ? "GAP_UP" : state === "BEARISH" ? "GAP_DOWN" : null;
    events.push({
      family: "DECISION",
      label: state,
      symbol: row.symbol,
      sessionDate: row.sessionDate,
      signalTimestamp: ts,
      formulaVersion: row.decision.formulaVersion,
      readiness: readiness(state !== "UNAVAILABLE", state === "CONFLICT" || state === "NEUTRAL"),
      confidence: row.decision.confidence,
      blockingWarnings: [],
      eligible: state === "BULLISH" || state === "BEARISH",
      inputAvailability: state === "UNAVAILABLE" ? "MISSING" : "OK",
      predictedDirection: predicted,
    });
  }
  if (row.gannGap) {
    const outlook = row.gannGap.outlook;
    const predicted =
      outlook === "GAP_UP" ? "GAP_UP" : outlook === "GAP_DOWN" ? "GAP_DOWN" : null;
    const eligible = outlook === "GAP_UP" || outlook === "GAP_DOWN";
    events.push({
      family: "GANN_GAP",
      label: outlook,
      symbol: row.symbol,
      sessionDate: row.sessionDate,
      signalTimestamp: ts,
      formulaVersion: row.gannGap.formulaVersion,
      readiness: readiness(outlook !== "UNAVAILABLE", outlook === "NO_TRADE" || outlook === "CONFLICT"),
      confidence: null,
      blockingWarnings: [],
      eligible,
      inputAvailability: outlook === "UNAVAILABLE" ? "MISSING" : "OK",
      predictedDirection: predicted,
    });
  }
  for (const alert of row.smartAlerts) {
    events.push({
      family: "SMART_ALERT",
      label: alert.family,
      symbol: row.symbol,
      sessionDate: row.sessionDate,
      signalTimestamp: ts,
      formulaVersion: "smart-alerts",
      readiness: alert.readinessBlocked ? "BLOCKED" : alert.staleData ? "STALE" : "READY",
      confidence: null,
      blockingWarnings: alert.readinessBlocked ? ["READINESS_BLOCKED"] : alert.staleData ? ["STALE_DATA"] : [],
      eligible: !alert.readinessBlocked && !alert.staleData && !alert.duplicateSuppressed,
      inputAvailability: "OK",
      predictedDirection: null,
    });
  }
  if (row.institutionalFlow) {
    const summary = row.institutionalFlow.summary;
    const predicted =
      summary === "PUT_WRITERS_ACTIVE" ? "GAP_UP" :
      summary === "CALL_WRITERS_ACTIVE" ? "GAP_DOWN" : null;
    events.push({
      family: "INSTITUTIONAL_FLOW",
      label: summary,
      symbol: row.symbol,
      sessionDate: row.sessionDate,
      signalTimestamp: ts,
      formulaVersion: "institutional-flow",
      readiness: readiness(summary !== "UNAVAILABLE", summary === "CONFLICT" || summary === "BALANCED"),
      confidence: null,
      blockingWarnings: [],
      eligible: summary === "PUT_WRITERS_ACTIVE" || summary === "CALL_WRITERS_ACTIVE",
      inputAvailability: summary === "UNAVAILABLE" ? "MISSING" : "OK",
      predictedDirection: predicted,
    });
  }
  return events;
}

export function eventsByFamily(
  rows: readonly HistoricalRow[],
): Readonly<Record<SignalFamily, readonly SignalEvent[]>> {
  const out: Record<SignalFamily, SignalEvent[]> = {
    DECISION: [], GTI: [], COMBINED_PCR: [], BREADTH: [],
    GANN_GAP: [], SMART_ALERT: [], INSTITUTIONAL_FLOW: [], OPTION_STRATEGY: [],
  };
  for (const r of rows) {
    for (const e of eventsForRow(r)) out[e.family].push(e);
  }
  return out;
}
