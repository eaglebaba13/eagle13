// Phase 21.9 · Stage 2 — Optimizer history store.
// Deterministic, in-memory, immutable. Stores completed optimizer runs so
// the UI can compare any two runs. Never mutates production defaults or
// upstream Run IDs.

import type { OptimizerResult } from "./explainable-optimizer";
import type { ResolvedResearchContext } from "./research-context";
import { researchContextSignature } from "./research-context";

export type OptimizerHistoryEntry = {
  readonly id: string;
  readonly runId: string;
  readonly strategy: OptimizerResult["strategy"];
  readonly instrument: string;
  readonly provider: string;
  readonly from: string;
  readonly to: string;
  readonly contextSignature: string;
  readonly recordedAt: string;
  readonly result: OptimizerResult;
};

export type OptimizerHistory = {
  readonly entries: readonly OptimizerHistoryEntry[];
};

export function emptyOptimizerHistory(): OptimizerHistory {
  return { entries: [] };
}

export function recordOptimizerHistory(
  history: OptimizerHistory,
  input: {
    readonly context: ResolvedResearchContext;
    readonly result: OptimizerResult;
    readonly recordedAt: string;
  },
  limit = 20,
): OptimizerHistory {
  const sig = researchContextSignature(input.context);
  const id = `${input.result.runId}#${sig}`;
  const filtered = history.entries.filter((e) => e.id !== id);
  const entry: OptimizerHistoryEntry = {
    id,
    runId: input.result.runId,
    strategy: input.result.strategy,
    instrument: input.context.instrument,
    provider: input.context.provider,
    from: input.context.from,
    to: input.context.to,
    contextSignature: sig,
    recordedAt: input.recordedAt,
    result: input.result,
  };
  const next = [entry, ...filtered];
  return { entries: next.slice(0, Math.max(1, limit)) };
}

export function findOptimizerHistoryEntry(
  history: OptimizerHistory,
  id: string,
): OptimizerHistoryEntry | null {
  return history.entries.find((e) => e.id === id) ?? null;
}

export type OptimizerHistoryComparison = {
  readonly a: OptimizerHistoryEntry;
  readonly b: OptimizerHistoryEntry;
  readonly scoreDelta: number;
  readonly confidenceChanged: boolean;
  readonly overfitRiskChanged: boolean;
  readonly parametersChanged: boolean;
  readonly summary: string;
};

function paramsEqual(
  a: Readonly<Record<string, number>> | null,
  b: Readonly<Record<string, number>> | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k]; const vb = b[k];
    if (va === undefined || vb === undefined) return false;
    if (Math.abs(va - vb) > 1e-6) return false;
  }
  return true;
}

export function compareOptimizerHistoryEntries(
  a: OptimizerHistoryEntry,
  b: OptimizerHistoryEntry,
): OptimizerHistoryComparison {
  const scoreDelta = b.result.objectiveScore - a.result.objectiveScore;
  const confidenceChanged = a.result.confidence !== b.result.confidence;
  const overfitRiskChanged = a.result.overfitRisk !== b.result.overfitRisk;
  const parametersChanged = !paramsEqual(
    a.result.recommendedParameters,
    b.result.recommendedParameters,
  );
  const summary =
    !parametersChanged && !confidenceChanged && !overfitRiskChanged
      ? "Runs recommend the same region with the same confidence and risk."
      : `Δscore=${scoreDelta.toFixed(3)}; parameters ${parametersChanged ? "changed" : "unchanged"}; confidence ${a.result.confidence}→${b.result.confidence}; risk ${a.result.overfitRisk}→${b.result.overfitRisk}.`;
  return { a, b, scoreDelta, confidenceChanged, overfitRiskChanged, parametersChanged, summary };
}