// Phase 21.7 · Stage 2 — Research Batch exports.
// Pure serialisation over the orchestrator state. Existing exports are not
// altered; these are additive CSV/JSON emitters for the batch tab only.

import type {
  BatchJobRecord,
  BatchOrchestratorState,
  BatchSummary,
} from "./cross-asset-orchestrator";
import { summarizeBatch, CROSS_ASSET_ORCHESTRATOR_VERSION } from "./cross-asset-orchestrator";

export type BatchExportProvenance = {
  readonly generatedAt: string;
  readonly source: string;
  readonly note?: string;
};

function csvEscape(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function provenanceHeader(prov: BatchExportProvenance): string {
  return [
    `# generator: ${CROSS_ASSET_ORCHESTRATOR_VERSION}`,
    `# generatedAt: ${prov.generatedAt}`,
    `# source: ${prov.source}`,
    prov.note ? `# note: ${prov.note}` : null,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

function netPnl(rec: BatchJobRecord): number {
  const trades = rec.result?.trades ?? [];
  return Math.round(trades.reduce((s, t) => s + t.pnl, 0) * 100) / 100;
}

export function buildBatchResultsCsv(
  state: BatchOrchestratorState,
  prov: BatchExportProvenance,
): string {
  const header = [
    "strategy","formula","instrument","timeframe","period","from","to",
    "status","attempts","trades","netPnl","runId","dataHash","errorCode",
  ];
  const rows = state.records.map((r) => [
    r.job.strategy, r.job.formula, r.job.instrument, r.job.timeframe,
    r.job.period.label, r.job.period.from, r.job.period.to,
    r.status, r.attempts,
    r.result?.trades.length ?? 0,
    netPnl(r),
    r.runId ?? "",
    r.dataHash ?? "",
    r.error?.code ?? "",
  ].map(csvEscape).join(","));
  return [provenanceHeader(prov), header.join(","), ...rows].join("\n");
}

export function buildBatchFailuresCsv(
  state: BatchOrchestratorState,
  prov: BatchExportProvenance,
): string {
  const header = ["strategy","formula","instrument","timeframe","period","errorCode","errorMessage"];
  const rows = state.records
    .filter((r) => r.status === "failed" || r.status === "cancelled")
    .map((r) => [
      r.job.strategy, r.job.formula, r.job.instrument, r.job.timeframe,
      r.job.period.label,
      r.error?.code ?? r.status.toUpperCase(),
      r.error?.message ?? "",
    ].map(csvEscape).join(","));
  return [provenanceHeader(prov), header.join(","), ...rows].join("\n");
}

export function buildBatchCoverageCsv(
  state: BatchOrchestratorState,
  prov: BatchExportProvenance,
): string {
  const header = ["strategy","instrument","timeframe","total","completed","failed","coveragePct"];
  type Bucket = { total: number; completed: number; failed: number };
  const buckets = new Map<string, Bucket>();
  for (const r of state.records) {
    const k = `${r.job.strategy}|${r.job.instrument}|${r.job.timeframe}`;
    const b = buckets.get(k) ?? { total: 0, completed: 0, failed: 0 };
    b.total += 1;
    if (r.status === "completed") b.completed += 1;
    if (r.status === "failed" || r.status === "cancelled") b.failed += 1;
    buckets.set(k, b);
  }
  const rows = [...buckets.entries()].sort(([a],[b]) => (a < b ? -1 : 1)).map(([k, b]) => {
    const [s, i, t] = k.split("|");
    const pct = b.total > 0 ? Math.round((b.completed / b.total) * 10000) / 100 : 0;
    return [s, i, t, b.total, b.completed, b.failed, pct].map(csvEscape).join(",");
  });
  return [provenanceHeader(prov), header.join(","), ...rows].join("\n");
}

export function buildBatchSummaryJson(
  state: BatchOrchestratorState,
  prov: BatchExportProvenance,
): string {
  const summary: BatchSummary = summarizeBatch(state);
  return JSON.stringify(
    {
      generator: CROSS_ASSET_ORCHESTRATOR_VERSION,
      provenance: prov,
      summary,
    },
    null,
    2,
  );
}

export function buildBatchResultsJson(
  state: BatchOrchestratorState,
  prov: BatchExportProvenance,
): string {
  return JSON.stringify(
    {
      generator: CROSS_ASSET_ORCHESTRATOR_VERSION,
      provenance: prov,
      records: state.records.map((r) => ({
        key: r.key,
        status: r.status,
        attempts: r.attempts,
        job: r.job,
        runId: r.runId,
        dataHash: r.dataHash,
        trades: r.result?.trades.length ?? 0,
        netPnl: netPnl(r),
        error: r.error,
      })),
    },
    null,
    2,
  );
}
