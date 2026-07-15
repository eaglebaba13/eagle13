// Phase 21.2 · Stage 5 — deterministic export helpers for the validation
// dashboard. Every export carries full version + policy provenance.

import {
  GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
  INTRADAY_FORMULA_VERSIONS,
} from "./engine-version";
import type { HistoryResult } from "./gann-intraday-history.functions";

const csvEscape = (v: string | number | null | undefined): string => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function historyToSummaryCsv(r: HistoryResult): string {
  const meta = [
    `# version=${r.version}`,
    `# formulaVersion=${INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1}`,
    `# runId=${r.runId}`,
    `# instrument=${r.instrument}`,
    `# months=${r.months}`,
    `# from=${r.from}`,
    `# to=${r.to}`,
    `# ambiguousPolicy=${r.ambiguousPolicy}`,
    `# generatedAt=${r.generatedAt}`,
    `# labeledAs=${r.labeledAs}`,
  ].join("\n");
  const header = [
    "tradingDate",
    "status",
    "candles",
    "missing",
    "totalTrades",
    "wins",
    "losses",
    "netPnL",
    "error",
  ].join(",");
  const rows = r.sessionsSummary.map((s) =>
    [
      s.tradingDate,
      s.status,
      s.candles,
      s.missing,
      s.totalTrades,
      s.wins,
      s.losses,
      s.netPnL,
      csvEscape(s.error ?? ""),
    ].join(","),
  );
  return `${meta}\n${header}\n${rows.join("\n")}`;
}

export function historyToJson(r: HistoryResult): string {
  return JSON.stringify(
    {
      version: GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      ...r,
    },
    null,
    2,
  );
}

export function historyExportFilename(
  r: Pick<HistoryResult, "instrument" | "from" | "to">,
  ext: "csv" | "json",
): string {
  return `GANN_ABSOLUTE_INTRADAY_VALIDATION_${r.instrument}_${r.from}_${r.to}.${ext}`;
}