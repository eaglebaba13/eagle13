// Phase 3E — Research Lab server functions.
// Consumer-only. No provider fetches. Reads a dataset supplied by the
// caller and persists deterministic analytics through Supabase.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth, assertAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { buildDataset } from "./dataset";
import { buildResearchRunReport, compareRuns, exportCsv, exportJson } from "./report";
import { buildDiagnostics } from "./diagnostics";
import { assessDataQuality } from "./data-quality";
import {
  allocateRunId,
  listRuns,
  loadAdminSnapshot,
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

type ResearchLabClient = SupabaseClient<Database>;

function requireDatabaseClient(client: ResearchLabClient | null): ResearchLabClient {
  if (!client) throw new Error("Research Lab database client unavailable");
  return client;
}

function newRunId(now: number): string {
  return `RESEARCH_RUN_${now.toString(36)}`;
}

export const createResearchRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateResearchRunInput) => data)
  .handler(async ({ data, context }): Promise<ResearchRunReport> => {
    assertAuth(context);
    const client = requireDatabaseClient(context.supabase);
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
      const runId = await allocateRunId(client);
      const report = buildResearchRunReport({
        runId,
        dataset: ds,
        nowIso,
        thresholds: data.thresholds,
        includedFamilies: data.includedFamilies,
        walkForward: data.walkForward ?? null,
      });
      await saveRun(client, report, context.userId, Date.now() - t0);
      return report;
    } catch (err) {
      try {
        await recordFailure(client, context.userId);
      } catch (failureError) {
        throw new AggregateError(
          [err, failureError],
          "Research Lab run failed and failure tracking could not be persisted",
        );
      }
      throw err;
    }
  });

export const listResearchRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly ResearchRunReport[]> => {
    assertAuth(context);
    return listRuns(requireDatabaseClient(context.supabase), context.userId);
  });

export const readResearchRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data, context }): Promise<ResearchRunReport | null> => {
    assertAuth(context);
    return readRun(requireDatabaseClient(context.supabase), data.runId, context.userId);
  });

export const compareResearchRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runIdA: string; runIdB: string }) => data)
  .handler(async ({ data, context }) => {
    assertAuth(context);
    const client = requireDatabaseClient(context.supabase);
    const [a, b] = await Promise.all([
      readRun(client, data.runIdA, context.userId),
      readRun(client, data.runIdB, context.userId),
    ]);
    if (!a || !b) return null;
    return compareRuns(a, b);
  });

export const exportResearchRunJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data, context }): Promise<string> => {
    assertAuth(context);
    const r = await readRun(requireDatabaseClient(context.supabase), data.runId, context.userId);
    if (!r) return "";
    return exportJson(r);
  });

export const exportResearchRunCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data, context }): Promise<string> => {
    assertAuth(context);
    const r = await readRun(requireDatabaseClient(context.supabase), data.runId, context.userId);
    if (!r) return "";
    return exportCsv(r);
  });

export const getResearchLabDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAuth(context);
    const client = requireDatabaseClient(context.supabase);
    const { data: isAdmin, error } = await client.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error("Research Lab admin authorization check failed");
    if (isAdmin !== true) throw new Error("forbidden");

    const snapshot = await loadAdminSnapshot(client);
    const runs = snapshot.reports;
    const coverage: Record<string, number> = {};
    for (const run of runs) {
      for (const [key, value] of Object.entries(run.signals)) {
        coverage[key] = (coverage[key] ?? 0) + (value?.samples ?? 0);
      }
    }
    const sum = (
      key:
        | "missingSessions"
        | "duplicates"
        | "invalidOhlc"
        | "leakageDetections"
        | "formulaVersionMismatches",
    ) => runs.reduce((total, run) => total + run.dataQuality[key], 0);
    const qualityOrder = ["OK", "PARTIAL", "INVALID", "LEAKAGE_DETECTED"] as const;
    const quality =
      runs.length === 0
        ? null
        : {
            ...runs[0].dataQuality,
            missingSessions: sum("missingSessions"),
            duplicates: sum("duplicates"),
            invalidOhlc: sum("invalidOhlc"),
            leakageDetections: sum("leakageDetections"),
            formulaVersionMismatches: sum("formulaVersionMismatches"),
            overall:
              qualityOrder[
                Math.max(...runs.map((run) => qualityOrder.indexOf(run.dataQuality.overall)))
              ],
            warnings: [],
          };
    return buildDiagnostics({
      // Operational aggregates only: no dataset fingerprints, symbols or raw warnings.
      dataset: null,
      quality,
      reports: runs,
      persistenceAvailable: true,
      failedRuns: snapshot.failedRuns,
      lastFailureAt: snapshot.lastFailureAt,
      averageDurationMs: snapshot.averageDurationMs,
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
