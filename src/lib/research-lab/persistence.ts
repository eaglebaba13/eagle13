import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import type { ResearchRunReport } from "./types";

type ResearchLabClient = SupabaseClient<Database>;

export interface ResearchLabAdminSnapshot {
  readonly reports: readonly ResearchRunReport[];
  readonly failedRuns: number;
  readonly lastFailureAt: string | null;
  readonly averageDurationMs: number | null;
}

function databaseError(operation: string, code: string | undefined): Error {
  const suffix = code ? ` (${code})` : "";
  return new Error(`Research Lab ${operation} failed${suffix}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toDatabaseJson(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Research Lab report contains a non-finite number");
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : toDatabaseJson(item)));
  }
  if (isRecord(value)) {
    const json: { [key: string]: Json | undefined } = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) json[key] = toDatabaseJson(item);
    }
    return json;
  }
  throw new Error("Research Lab report contains a non-JSON value");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isResearchRunReport(value: unknown): value is ResearchRunReport {
  if (!isRecord(value)) return false;
  const manifest = value.manifest;
  const quality = value.dataQuality;
  const signals = value.signals;
  if (!isRecord(manifest) || !isRecord(quality) || !isRecord(signals)) return false;
  if (
    typeof manifest.runId !== "string" ||
    typeof manifest.createdAt !== "string" ||
    typeof manifest.datasetId !== "string" ||
    typeof manifest.datasetHash !== "string" ||
    typeof manifest.symbol !== "string" ||
    typeof manifest.startDate !== "string" ||
    typeof manifest.endDate !== "string" ||
    typeof manifest.timezone !== "string" ||
    typeof manifest.outcomeDefinitionVersion !== "string" ||
    !isFiniteNumber(manifest.flatGapTolerancePct) ||
    !isFiniteNumber(manifest.minSampleSize) ||
    !isStringArray(manifest.includedFamilies) ||
    !isStringArray(manifest.exclusionRules) ||
    !isRecord(manifest.formulaVersions) ||
    !isFiniteNumber(quality.duplicates) ||
    !isFiniteNumber(quality.missingSessions) ||
    !isFiniteNumber(quality.invalidOhlc) ||
    !isFiniteNumber(quality.leakageDetections) ||
    !isFiniteNumber(quality.formulaVersionMismatches) ||
    !isStringArray(quality.warnings) ||
    !["OK", "PARTIAL", "INVALID", "LEAKAGE_DETECTED"].includes(String(quality.overall)) ||
    !Object.values(signals).every(
      (metric) =>
        metric === undefined ||
        (isRecord(metric) && isFiniteNumber(metric.samples) && isFiniteNumber(metric.eligible)),
    ) ||
    (value.gannGap !== null && !isRecord(value.gannGap)) ||
    (value.smartAlerts !== null && !isRecord(value.smartAlerts)) ||
    (value.institutionalFlow !== null && !isRecord(value.institutionalFlow)) ||
    (value.walkForward !== null && !isRecord(value.walkForward)) ||
    !isStringArray(value.diagnostics) ||
    !isStringArray(value.warnings) ||
    typeof value.disclaimer !== "string" ||
    typeof value.generatedAt !== "string"
  ) {
    return false;
  }
  return true;
}

const researchRunReportSchema = z.custom<ResearchRunReport>(isResearchRunReport);

function decodeRunReport(value: Json, expectedRunId: string): ResearchRunReport {
  const parsed = researchRunReportSchema.safeParse(value);
  if (!parsed.success || parsed.data.manifest.runId !== expectedRunId) {
    throw new Error("Research Lab persistence returned an invalid run report");
  }
  return parsed.data;
}

function requireOwner(ownerId: string): void {
  if (!ownerId) throw new Error("Research run owner required");
}

export async function allocateRunId(client: ResearchLabClient): Promise<string> {
  const { data, error } = await client.rpc("allocate_research_lab_run_id");
  if (error) throw databaseError("Run ID allocation", error.code);
  if (typeof data !== "string" || !/^[1-9]\d*$/.test(data)) {
    throw new Error("Research Lab Run ID allocator returned an invalid sequence value");
  }
  return `RESEARCH_RUN_${BigInt(data).toString(36)}`;
}

export async function saveRun(
  client: ResearchLabClient,
  report: ResearchRunReport,
  ownerId: string,
  durationMs?: number,
): Promise<void> {
  requireOwner(ownerId);
  const { error } = await client.from("research_lab_runs").insert({
    run_id: report.manifest.runId,
    owner_id: ownerId,
    report: toDatabaseJson(report),
    duration_ms: typeof durationMs === "number" && Number.isFinite(durationMs) ? durationMs : null,
  });
  if (error) throw databaseError("run persistence", error.code);
}

export async function listRuns(
  client: ResearchLabClient,
  ownerId: string,
): Promise<readonly ResearchRunReport[]> {
  requireOwner(ownerId);
  const { data, error } = await client
    .from("research_lab_runs")
    .select("run_id,report")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .order("run_id", { ascending: true });
  if (error) throw databaseError("run listing", error.code);
  if (!data) throw new Error("Research Lab run listing returned no database result");
  return data.map((row) => decodeRunReport(row.report, row.run_id));
}

export async function readRun(
  client: ResearchLabClient,
  runId: string,
  ownerId: string,
): Promise<ResearchRunReport | null> {
  requireOwner(ownerId);
  const { data, error } = await client
    .from("research_lab_runs")
    .select("run_id,report")
    .eq("owner_id", ownerId)
    .eq("run_id", runId)
    .maybeSingle();
  if (error) throw databaseError("run read", error.code);
  return data ? decodeRunReport(data.report, data.run_id) : null;
}

export async function recordFailure(client: ResearchLabClient, ownerId: string): Promise<void> {
  requireOwner(ownerId);
  const { error } = await client.rpc("record_research_lab_failure", {
    p_owner_id: ownerId,
  });
  if (error) throw databaseError("failure recording", error.code);
}

export async function loadAdminSnapshot(
  client: ResearchLabClient,
): Promise<ResearchLabAdminSnapshot> {
  const { data, error } = await client.rpc("research_lab_admin_snapshot");
  if (error) throw databaseError("admin diagnostics read", error.code);
  if (!data?.length) throw new Error("Research Lab admin diagnostics returned no snapshot");

  const first = data[0];
  const reports = data.flatMap((row) =>
    row.run_report === null || row.run_id === null
      ? []
      : [decodeRunReport(row.run_report, row.run_id)],
  );
  if (
    !Number.isSafeInteger(first.failed_runs) ||
    first.failed_runs < 0 ||
    (first.average_duration_ms !== null && !Number.isFinite(first.average_duration_ms))
  ) {
    throw new Error("Research Lab admin diagnostics returned invalid persistence metrics");
  }
  return {
    reports,
    failedRuns: first.failed_runs,
    lastFailureAt: first.last_failure_at,
    averageDurationMs: first.average_duration_ms,
  };
}
