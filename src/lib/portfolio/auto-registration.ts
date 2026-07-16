// Phase 22 · Stage 3 — Auto-registration hook. Converts a completed
// HistoricalBacktestResult (plus optional research metadata) into a
// PortfolioAsset and pushes it into the shared candidate registry.
//
// Research-only. Never re-runs strategies. Never mutates source trades.
// Duplicate Run IDs are rejected; incomplete metadata is rejected.

import type { HistoricalBacktestResult } from "@/lib/backtest/result";
import {
  candidateFromResult,
  globalCandidateRegistry,
  type CandidateMeta,
  type CandidateRegistry,
} from "./candidate-discovery";
import type { PortfolioAsset } from "./portfolio-types";

export type RegistrationSource =
  | "CROSS_ASSET"
  | "RESEARCH_BATCH"
  | "OPTIMIZER"
  | "REGIME_RECOMMENDATION"
  | "RECOMMENDATION_VALIDATION"
  | "SMC"
  | "HYBRID"
  | "ASTRO"
  | "ABSOLUTE"
  | "MANUAL";

export type RegistrationOutcome =
  | { ok: true; asset: PortfolioAsset; source: RegistrationSource }
  | { ok: false; reason: string; source: RegistrationSource };

export type AutoRegisterInput = {
  readonly result: HistoricalBacktestResult;
  readonly meta?: CandidateMeta;
  readonly source: RegistrationSource;
  readonly registry?: CandidateRegistry;
  readonly minTrades?: number;
};

/** Deterministic guardrails — mirrors portfolio-engine safety gates. */
export function evaluateRegistrationSafety(
  result: HistoricalBacktestResult,
  meta: CandidateMeta | undefined,
  minTrades: number,
): string | null {
  if (!result.runId) return "MISSING_RUN_ID";
  if (!result.formulaVersion) return "MISSING_FORMULA_VERSION";
  if (!result.instrument) return "MISSING_INSTRUMENT";
  if (!result.dataGranularity) return "UNSUPPORTED_TIMEFRAME";
  if (result.trades.length < minTrades) return "INSUFFICIENT_TRADES";
  if (meta?.dataHash === "") return "MISSING_DATA_HASH";
  if (meta?.overfitStatus === "OVERFIT" || meta?.overfitStatus === "FAIL") return "OPTIMIZER_OVERFIT";
  if (meta?.reliability === "POOR" || meta?.reliability === "UNRELIABLE") return "UNRELIABLE_RECOMMENDATION";
  if (meta?.oosExpectancy != null && meta.oosExpectancy < 0) return "NEGATIVE_OOS_EXPECTANCY";
  // Causality sanity: from ≤ to.
  if (result.from && result.to && result.from > result.to) return "CAUSALITY_FAILURE";
  return null;
}

export function autoRegisterCandidate(input: AutoRegisterInput): RegistrationOutcome {
  const { result, meta, source } = input;
  const registry = input.registry ?? globalCandidateRegistry;
  const minTrades = input.minTrades ?? 1;
  const reason = evaluateRegistrationSafety(result, meta, minTrades);
  if (reason) return { ok: false, reason, source };

  const asset = candidateFromResult(result, meta);
  // Deduplicate by Run ID (any existing asset with same runId blocks re-add).
  const dup = registry.list().find((a) => a.runId === asset.runId);
  if (dup) return { ok: false, reason: "DUPLICATE_RUN_ID", source };
  registry.register(asset);
  return { ok: true, asset, source };
}

/** Bulk registration convenience. Returns per-item outcomes; order preserved. */
export function autoRegisterMany(
  items: readonly AutoRegisterInput[],
): readonly RegistrationOutcome[] {
  return items.map(autoRegisterCandidate);
}