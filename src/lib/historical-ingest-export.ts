// Phase 21.2 · Stage 5.1 — deterministic exports for the ingestion pipeline.
// Every export carries full provenance: source, formulaVersion, ingestVersion,
// executionVersion, cubeVersion, date range, generatedAt, runId.

import {
  GANN_ABSOLUTE_INTRADAY_INGEST_VERSION,
  GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
  INTRADAY_FORMULA_VERSIONS,
} from "./engine-version";
import type { ParsedCandle, RejectedRow } from "./candle-csv-parser";
import type { BuildResult } from "./candle-session-builder";
import type { DataQualityReport } from "./candle-data-quality";
import type { ProviderComparisonResult } from "./provider-comparison";

export type ProvenanceHeader = {
  source: string;
  instrument: string;
  from: string;
  to: string;
  runId: string;
  generatedAt: string;
};

function esc(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function provenanceBlock(p: ProvenanceHeader): string {
  return [
    `# ingestVersion=${GANN_ABSOLUTE_INTRADAY_INGEST_VERSION}`,
    `# validationVersion=${GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION}`,
    `# formulaVersion=${INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1}`,
    `# source=${p.source}`,
    `# instrument=${p.instrument}`,
    `# from=${p.from}`,
    `# to=${p.to}`,
    `# runId=${p.runId}`,
    `# generatedAt=${p.generatedAt}`,
    `# labeledAs=VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION`,
  ].join("\n");
}

export function cleanedCandlesToCsv(
  rows: ParsedCandle[],
  p: ProvenanceHeader,
): string {
  const header = "timeIst,open,high,low,close,volume";
  const body = rows
    .map((r) => `${r.timeIst},${r.open},${r.high},${r.low},${r.close},${r.volume ?? ""}`)
    .join("\n");
  return `${provenanceBlock(p)}\n${header}\n${body}`;
}

export function rejectedRowsToCsv(
  rows: RejectedRow[],
  p: ProvenanceHeader,
): string {
  const header = "rowIndex,reason,raw";
  const body = rows
    .map((r) => `${r.rowIndex},${esc(r.reason)},${esc(r.raw)}`)
    .join("\n");
  return `${provenanceBlock(p)}\n${header}\n${body}`;
}

export function sessionSummaryToCsv(
  b: BuildResult,
  p: ProvenanceHeader,
): string {
  const header = "tradingDate,candles,previousCloseDate,previousClose,rejectionReason";
  const body = b.sessions
    .map(
      (s) =>
        `${s.tradingDate},${s.candlesCount},${s.previousCloseDate ?? ""},${s.previousClose ?? ""},${esc(s.rejectionReason ?? "")}`,
    )
    .join("\n");
  return `${provenanceBlock(p)}\n${header}\n${body}`;
}

export function providerComparisonToCsv(
  cmp: ProviderComparisonResult,
  p: ProvenanceHeader,
): string {
  const header =
    "tradingDate,aCount,bCount,ohlcDiffs,missingInA,missingInB,highDiff,lowDiff,classification";
  const body = cmp.perSession
    .map(
      (s) =>
        `${s.tradingDate},${s.aCount},${s.bCount},${s.ohlcDiffs},${s.missingInA},${s.missingInB},${s.highDiff},${s.lowDiff},${s.classification}`,
    )
    .join("\n");
  return `${provenanceBlock(p)}\n${header}\n${body}`;
}

export function dqReportToJson(
  dq: DataQualityReport,
  p: ProvenanceHeader,
): string {
  return JSON.stringify(
    {
      ...p,
      ingestVersion: GANN_ABSOLUTE_INTRADAY_INGEST_VERSION,
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
      dataQuality: dq,
    },
    null,
    2,
  );
}

export function ingestExportFilename(
  p: Pick<ProvenanceHeader, "instrument" | "from" | "to">,
  kind: "candles" | "rejected" | "sessions" | "compare" | "dq",
  ext: "csv" | "json",
): string {
  return `GANN_ABSOLUTE_INTRADAY_INGEST_${p.instrument}_${kind}_${p.from}_${p.to}.${ext}`;
}