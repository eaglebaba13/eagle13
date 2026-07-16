// Phase 23 · Stage 1 — Shadow exports. CSV + Full Bundle JSON.
// Every export carries the shadow disclaimer.

import type { ShadowHistorySnapshot } from "./shadow-history";
import type { ShadowDriftReport } from "./shadow-drift";
import {
  SHADOW_DISCLAIMER,
  type ShadowMetrics,
  type ShadowObservation,
  type ShadowPortfolioDecision,
  type ShadowSession,
  type ShadowValidationEvent,
} from "./shadow-types";

const HEADER = `# ${SHADOW_DISCLAIMER}\n# SHADOW RESEARCH ONLY — NOT A LIVE TRADE RECORD\n`;

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function row(cells: Array<string | number | boolean | null | undefined>): string {
  return cells.map(csvEscape).join(",");
}

export function buildObservationsCsv(list: readonly ShadowObservation[]): string {
  const lines = [
    row([
      "observationId",
      "sessionId",
      "recordedAt",
      "strategy",
      "formulaVersion",
      "instrument",
      "timeframe",
      "direction",
      "confidence",
      "reliability",
      "status",
      "entry",
      "stop",
      "target",
      "exit",
      "exitPrice",
      "mfe",
      "mae",
      "netAfterCosts",
      "dataHash",
      "providerId",
      "recommendationRunId",
      "portfolioRunId",
      "blockingReasons",
    ]),
  ];
  for (const o of list) {
    lines.push(
      row([
        o.id,
        o.sessionId,
        o.recordedAt,
        o.strategy,
        o.formulaVersion,
        o.instrument,
        o.timeframe,
        o.direction,
        o.confidence,
        o.reliability,
        o.status,
        o.hypothetical?.entry ?? "",
        o.hypothetical?.stop ?? "",
        o.hypothetical?.target ?? "",
        o.outcome.exit ?? "",
        o.outcome.exitPrice ?? "",
        o.outcome.mfe,
        o.outcome.mae,
        o.outcome.netAfterCosts,
        o.evidence.dataHash,
        o.evidence.providerId,
        o.evidence.recommendationRunId ?? "",
        o.evidence.portfolioRunId ?? "",
        o.blockingReasons.join("|"),
      ]),
    );
  }
  return HEADER + lines.join("\n");
}

export function buildEventsCsv(list: readonly ShadowValidationEvent[]): string {
  const lines = [row(["eventId", "kind", "at", "reason", "recommendationRunId", "portfolioRunId", "dataHash"])];
  for (const e of list) {
    lines.push(
      row([
        e.id,
        e.kind,
        e.at,
        e.reason ?? "",
        e.evidence.recommendationRunId ?? "",
        e.evidence.portfolioRunId ?? "",
        e.evidence.dataHash,
      ]),
    );
  }
  return HEADER + lines.join("\n");
}

export function buildSessionsCsv(list: readonly ShadowSession[]): string {
  const lines = [
    row([
      "sessionId",
      "instrument",
      "timeframe",
      "sessionDate",
      "status",
      "recommendationRunId",
      "portfolioRunId",
      "dataHash",
      "blockingReasons",
    ]),
  ];
  for (const s of list) {
    lines.push(
      row([
        s.id,
        s.instrument,
        s.timeframe,
        s.sessionDate,
        s.status,
        s.recommendationRunId ?? "",
        s.portfolioRunId ?? "",
        s.evidence.dataHash,
        s.blockingReasons.join("|"),
      ]),
    );
  }
  return HEADER + lines.join("\n");
}

export function buildMetricsCsv(m: ShadowMetrics): string {
  const lines = [row(["metric", "value"])];
  for (const [k, v] of Object.entries(m)) lines.push(row([k, v as number]));
  return HEADER + lines.join("\n");
}

export function buildDriftCsv(report: ShadowDriftReport): string {
  const lines = [row(["dimension", "status", "deltaPct", "reason"])];
  for (const r of report.readings) {
    lines.push(row([r.dimension, r.status, r.deltaPct, r.reason]));
  }
  lines.push(row(["OVERALL", report.overall, report.driftScore, "aggregate"]));
  return HEADER + lines.join("\n");
}

export function buildPortfolioShadowCsv(list: readonly ShadowPortfolioDecision[]): string {
  const lines = [
    row([
      "portfolioRunId",
      "assetId",
      "included",
      "allocationWeight",
      "sizingUnits",
      "riskBudgetPct",
      "correlationExposure",
      "capitalUtilizationPct",
      "confidence",
      "hardGatePassed",
      "blockingReasons",
    ]),
  ];
  for (const p of list) {
    lines.push(
      row([
        p.runId,
        p.assetId,
        p.included,
        p.allocationWeight,
        p.sizingUnits,
        p.riskBudgetPct,
        p.correlationExposure,
        p.capitalUtilizationPct,
        p.confidence,
        p.hardGatePassed,
        p.blockingReasons.join("|"),
      ]),
    );
  }
  return HEADER + lines.join("\n");
}

export type ShadowBundle = {
  readonly version: "SHADOW_BUNDLE_V1";
  readonly disclaimer: string;
  readonly snapshot: ShadowHistorySnapshot;
  readonly metrics: ShadowMetrics;
  readonly drift: ShadowDriftReport | null;
};

export function buildShadowBundleJson(bundle: ShadowBundle): string {
  return JSON.stringify(
    {
      ...bundle,
      disclaimer: SHADOW_DISCLAIMER,
    },
    null,
    2,
  );
}