// Phase 3E — Research Lab server functions.
// Consumer-only. No provider fetches. Reads a dataset supplied by the
// caller (or an empty in-memory fallback) and runs deterministic
// analytics. Persistence uses the in-memory fallback described in
// persistence.ts.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildDataset } from "./dataset";
import {
  buildResearchRunReport,
  compareRuns,
  exportCsv,
  exportJson,
} from "./report";
import { buildDiagnostics } from "./diagnostics";
import { assessDataQuality } from "./data-quality";
import { eventsByFamily } from "./signal-events";
import {
  listRuns,
  persistenceAvailable,
  persistenceStats,
  readRun,
  recordFailure,
  saveRun,
} from "./persistence";
import type {
  HistoricalRow,
  OutcomeThresholds,
  ResearchRunReport,
  SignalFamily,
  WalkForwardConfig,
} from "./types";

export interface CreateResearchRunInput {
  readonly datasetId: string;
  readonly symbol: string;
  readonly timezone: string;
  readonly rows: readonly HistoricalRow[];
  readonly thresholds?: OutcomeThresholds;
  readonly includedFamilies?: readonly SignalFamily[];
  readonly walkForward?: WalkForwardConfig | null;
}

function newRunId(now: number): string {
  return `RESEARCH_RUN_${now.toString(36)}`;
}

export const createResearchRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateResearchRunInput) => data)
  .handler(async ({ data }): Promise<ResearchRunReport> => {
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    try {
      const ds = buildDataset({
        datasetId: data.datasetId,
        symbol: data.symbol,
        timezone: data.timezone,
        rows: data.rows,
        generatedAt: nowIso,
      });
      const report = buildResearchRunReport({
        runId: newRunId(Date.now()),
        dataset: ds,
        nowIso,
        thresholds: data.thresholds,
        includedFamilies: data.includedFamilies,
        walkForward: data.walkForward ?? null,
      });
      saveRun(report, Date.now() - t0);
      return report;
    } catch (err) {
      recordFailure(nowIso);
      throw err;
    }
  });

export const listResearchRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<readonly ResearchRunReport[]> => {
    return listRuns();
  });

export const readResearchRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data }): Promise<ResearchRunReport | null> => {
    return readRun(data.runId);
  });

export const compareResearchRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runIdA: string; runIdB: string }) => data)
  .handler(async ({ data }) => {
    const a = readRun(data.runIdA);
    const b = readRun(data.runIdB);
    if (!a || !b) return null;
    return compareRuns(a, b);
  });

export const exportResearchRunJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data }): Promise<string> => {
    const r = readRun(data.runId);
    if (!r) return "";
    return exportJson(r);
  });

export const exportResearchRunCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data }): Promise<string> => {
    const r = readRun(data.runId);
    if (!r) return "";
    return exportCsv(r);
  });

export const getResearchLabDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const runs = listRuns();
    const stats = persistenceStats();
    const latest = runs[runs.length - 1] ?? null;
    const events = latest ? eventsByFamily(latest.manifest ? [] : []) : null;
    void events;
    const coverage: Record<string, number> = {};
    if (latest) {
      for (const [k, v] of Object.entries(latest.signals)) {
        coverage[k] = v?.samples ?? 0;
      }
    }
    const quality = latest ? latest.dataQuality : null;
    return buildDiagnostics({
      dataset: latest
        ? {
            datasetId: latest.manifest.datasetId,
            symbol: latest.manifest.symbol,
            timezone: latest.manifest.timezone,
            startDate: latest.manifest.startDate,
            endDate: latest.manifest.endDate,
            rows: [],
            hash: latest.manifest.datasetHash,
            generatedAt: latest.generatedAt,
            warnings: [],
          }
        : null,
      quality,
      reports: runs,
      persistenceAvailable: persistenceAvailable(),
      failedRuns: stats.failed,
      lastFailureAt: stats.lastFailureAt,
      averageDurationMs: stats.avgDurationMs,
      signalCoverage: coverage,
    });
  });

// Client-friendly pure helper (no server-fn wrapping) for tests.
export function runResearchNow(input: CreateResearchRunInput, nowIso: string): ResearchRunReport {
  const ds = buildDataset({
    datasetId: input.datasetId,
    symbol: input.symbol,
    timezone: input.timezone,
    rows: input.rows,
    generatedAt: nowIso,
  });
  void assessDataQuality; // ensure tree-shake keeps deterministic quality path in tests
  return buildResearchRunReport({
    runId: newRunId(Date.parse(nowIso) || 0),
    dataset: ds,
    nowIso,
    thresholds: input.thresholds,
    includedFamilies: input.includedFamilies,
    walkForward: input.walkForward ?? null,
  });
}
