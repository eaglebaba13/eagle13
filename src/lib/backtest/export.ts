// Phase 21.3 · Unified export writer. Every export carries full provenance.
// Formula-specific exporters remain unchanged for now; parity tests in a
// later sub-phase will confirm byte-identical output before swapping consumers.

import type { HistoricalBacktestResult } from "./result";

const csvEscape = (v: string | number | null | undefined): string => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export type ExportSection =
  | "summary"
  | "trades"
  | "dataQuality"
  | "formulaComparison"
  | "providerComparison";

function provenanceHeader(
  r: HistoricalBacktestResult,
  validationOnly: boolean,
): string[] {
  const lines = [
    `# formulaVersion=${r.formulaVersion}`,
    `# engineVersion=${r.engineVersion}`,
    `# executionVersion=${r.executionVersion}`,
    `# cubeVersion=${r.cubeVersion}`,
    `# policyVersion=${r.policyVersion}`,
    `# runId=${r.runId}`,
    `# generatedAt=${r.generatedAt}`,
    `# instrument=${r.instrument}`,
    `# from=${r.from}`,
    `# to=${r.to}`,
    `# dataGranularity=${r.dataGranularity}`,
    `# source=${r.source}`,
  ];
  if (validationOnly) {
    lines.push(`# labeledAs=VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION`);
  }
  return lines;
}

export function exportSummaryCsv(
  r: HistoricalBacktestResult,
  opts: { validationOnly?: boolean } = {},
): string {
  const meta = provenanceHeader(r, opts.validationOnly ?? false);
  const header = ["month", "trades", "wins", "losses", "netPnl"].join(",");
  const rows = r.monthly.map((m) =>
    [m.month, m.trades, m.wins, m.losses, m.netPnl].join(","),
  );
  return `${meta.join("\n")}\n${header}\n${rows.join("\n")}`;
}

export function exportTradesCsv(
  r: HistoricalBacktestResult,
  opts: { validationOnly?: boolean } = {},
): string {
  const meta = provenanceHeader(r, opts.validationOnly ?? false);
  const header = [
    "id",
    "date",
    "side",
    "entry",
    "stop",
    "target",
    "exit",
    "outcome",
    "pnl",
    "ambiguous",
    "reasons",
  ].join(",");
  const rows = r.trades.map((t) =>
    [
      csvEscape(t.id),
      t.date,
      t.side,
      t.entry ?? "",
      t.stop ?? "",
      t.target ?? "",
      t.exit ?? "",
      t.outcome,
      t.pnl,
      t.ambiguous ? "1" : "0",
      csvEscape(t.reasons.join("|")),
    ].join(","),
  );
  return `${meta.join("\n")}\n${header}\n${rows.join("\n")}`;
}

export function exportResultJson(
  r: HistoricalBacktestResult,
  opts: { validationOnly?: boolean } = {},
): string {
  return JSON.stringify(
    {
      ...r,
      labeledAs: opts.validationOnly
        ? "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION"
        : undefined,
    },
    null,
    2,
  );
}

export function exportFilename(
  r: Pick<HistoricalBacktestResult, "formulaVersion" | "instrument" | "from" | "to">,
  section: ExportSection,
  ext: "csv" | "json",
): string {
  return `${r.formulaVersion}_${section}_${r.instrument}_${r.from}_${r.to}.${ext}`;
}
