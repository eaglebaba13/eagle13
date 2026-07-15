// Phase 21.4 · Stage 4C — Export builders for provider metadata, data
// quality, three-way attribution, hybrid quality, and shadow history.
// Pure string builders; UI wraps with Blob and downloadBlob.

import type { DataQualityState } from "./data-quality-state";
import type { IntradayProviderMetadata } from "./providers";
import type { ShadowEvent } from "./hybrid-shadow";
import type {
  AttributionBucketId,
  AttributionMetrics,
  ThreeWayAttribution,
} from "./attribution";
import type { HybridQualityMetrics } from "./hybrid-quality";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function buildProviderMetadataCsv(m: IntradayProviderMetadata): string {
  return csv([
    ["field", "value"],
    ["providerId", m.providerId],
    ["providerLabel", m.providerLabel],
    ["timeframe", m.timeframe],
    ["timezone", m.timezone],
    ["requestedFrom", m.requestedFrom],
    ["requestedTo", m.requestedTo],
    ["actualFrom", m.actualFrom ?? ""],
    ["actualTo", m.actualTo ?? ""],
    ["candleCount", m.candleCount],
    ["dataHash", m.dataHash],
  ]);
}

export function buildDataQualityCsv(status: DataQualityState, coveragePct: number, gaps: number): string {
  return csv([
    ["field", "value"],
    ["status", status],
    ["coveragePct", coveragePct],
    ["gaps", gaps],
  ]);
}

export function buildAttributionCsv(a: ThreeWayAttribution): string {
  const header = [
    "bucket",
    "count",
    "wins",
    "losses",
    "winRatePct",
    "netPnl",
    "profitFactor",
    "expectancy",
    "avgMfe",
    "avgMae",
  ];
  const ids = (Object.keys(a) as (AttributionBucketId | "totals")[]).filter(
    (k) => k !== "totals",
  );
  const row = (id: string, m: AttributionMetrics) => [
    id,
    m.count,
    m.wins,
    m.losses,
    m.winRate,
    m.netPnl,
    Number.isFinite(m.profitFactor) ? m.profitFactor : "Infinity",
    m.expectancy,
    m.avgMfe,
    m.avgMae,
  ];
  return csv([
    header,
    ...ids.map((id) => row(id, a[id as AttributionBucketId])),
    row("TOTALS", a.totals),
  ]);
}

export function buildHybridQualityCsv(q: HybridQualityMetrics): string {
  return csv([
    ["metric", "valuePct"],
    ["totalDecisions", q.totalDecisions],
    ["agreementRate", q.agreementRate],
    ["conflictRate", q.conflictRate],
    ["waitRate", q.waitRate],
    ["dataIncompleteRate", q.dataIncompleteRate],
    ["formulaMismatchRate", q.formulaMismatchRate],
    ["hybridConversionRate", q.hybridConversionRate],
    ["winnerRetentionRate", q.winnerRetentionRate],
    ["loserFilteringRate", q.loserFilteringRate],
    ["missedWinnerRate", q.missedWinnerRate],
    ["falseAgreementRate", q.falseAgreementRate],
  ]);
}

export function buildShadowHistoryCsv(events: readonly ShadowEvent[]): string {
  const header = [
    "timestamp",
    "type",
    "instrument",
    "timeframe",
    "provider",
    "providerStatus",
    "hybridDirection",
    "score",
    "runId",
    "outcome",
    "reasons",
  ];
  const rows = events.map((e) => [
    e.timestamp,
    e.type,
    e.instrument,
    e.timeframe,
    e.provider,
    e.providerStatus,
    e.hybridDirection ?? "",
    e.score,
    e.runId,
    e.outcome,
    e.reasons.join(" | "),
  ]);
  return csv([header, ...rows]);
}

export type HybridValidationPayload = {
  version: "HYBRID_VALIDATION_V1";
  provider: IntradayProviderMetadata;
  dataQuality: { status: DataQualityState; coveragePct: number; gaps: number };
  attribution: ThreeWayAttribution;
  hybridQuality: HybridQualityMetrics;
  shadow: readonly ShadowEvent[];
};

export function buildValidationJson(payload: HybridValidationPayload): string {
  return JSON.stringify(payload, null, 2);
}