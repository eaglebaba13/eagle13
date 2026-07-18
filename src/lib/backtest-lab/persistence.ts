// Phase 3G — In-memory persistence fallback for strategies + runs.
// Deterministic, no PII, no secrets. Never claims live storage.

import type { BacktestRunReport, StrategyDefinition } from "./types";

const STRATEGIES = new Map<string, StrategyDefinition>();
const RUNS: BacktestRunReport[] = [];
let failed = 0;
let lastFailureAt: string | null = null;
const durationsMs: number[] = [];

export function saveStrategy(def: StrategyDefinition): void {
  STRATEGIES.set(def.strategyId, def);
}
export function listStrategies(): readonly StrategyDefinition[] {
  return Array.from(STRATEGIES.values());
}
export function readStrategy(id: string): StrategyDefinition | null {
  return STRATEGIES.get(id) ?? null;
}
export function deleteStrategy(id: string): boolean {
  return STRATEGIES.delete(id);
}
export function updateStrategy(def: StrategyDefinition): void {
  STRATEGIES.set(def.strategyId, def);
}

export function saveRun(report: BacktestRunReport, durationMs?: number): void {
  RUNS.push(report);
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) durationsMs.push(durationMs);
}
export function listRuns(): readonly BacktestRunReport[] {
  return RUNS.slice();
}
export function readRun(runId: string): BacktestRunReport | null {
  return RUNS.find((r) => r.runId === runId) ?? null;
}
export function recordFailure(atIso: string): void {
  failed++;
  lastFailureAt = atIso;
}
export function persistenceAvailable(): boolean {
  return true;
}
export function persistenceStats(): {
  strategies: number;
  runs: number;
  failed: number;
  lastFailureAt: string | null;
  avgDurationMs: number | null;
} {
  const avg = durationsMs.length > 0 ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length : null;
  return {
    strategies: STRATEGIES.size,
    runs: RUNS.length,
    failed,
    lastFailureAt,
    avgDurationMs: avg,
  };
}
export function _resetForTests(): void {
  STRATEGIES.clear();
  RUNS.length = 0;
  failed = 0;
  lastFailureAt = null;
  durationsMs.length = 0;
}