// Phase 3E — In-memory persistence fallback for research runs.
// Deterministic; safe for tests and for production when a database is
// unavailable. No credentials, no provider payloads, no PII stored.

import type { ResearchRunReport } from "./types";

const STORE: ResearchRunReport[] = [];
let lastFailureAt: string | null = null;
let failedCount = 0;
const durationsMs: number[] = [];

export function saveRun(report: ResearchRunReport, durationMs?: number): void {
  STORE.push(report);
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) durationsMs.push(durationMs);
}

export function listRuns(): readonly ResearchRunReport[] {
  return STORE.slice();
}

export function readRun(runId: string): ResearchRunReport | null {
  return STORE.find((r) => r.manifest.runId === runId) ?? null;
}

export function recordFailure(atIso: string): void {
  failedCount++;
  lastFailureAt = atIso;
}

export function persistenceStats(): {
  readonly count: number;
  readonly failed: number;
  readonly lastFailureAt: string | null;
  readonly avgDurationMs: number | null;
} {
  const avg = durationsMs.length > 0
    ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length
    : null;
  return { count: STORE.length, failed: failedCount, lastFailureAt, avgDurationMs: avg };
}

export function persistenceAvailable(): boolean {
  return true; // in-memory fallback always available
}

export function _resetPersistenceForTests(): void {
  STORE.length = 0;
  failedCount = 0;
  lastFailureAt = null;
  durationsMs.length = 0;
}
