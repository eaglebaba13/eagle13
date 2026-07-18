// Phase 3D — Pure report builder. No I/O. Callers pass canonical inputs.

import type { OptionChainSnapshot, OptionUnderlying } from "@/lib/option-chain/types";
import type { MarketBreadthSnapshot } from "@/lib/market-breadth/types";
import { analyzeOi } from "./oi-analysis";
import { classifyBuildUp } from "./build-up";
import { computeMaxPain } from "./max-pain";
import { computeGamma } from "./gamma";
import { buildHeatmap } from "./heatmap";
import { buildSectorFlow } from "./sector-flow";
import { buildMarketInternals } from "./market-internals";
import { summariseFlow } from "./summary";
import { buildDiagnostics } from "./diagnostics";
import {
  INSTITUTIONAL_FLOW_DISCLAIMER,
  INSTITUTIONAL_FLOW_VERSION,
  type InstitutionalFlowReport,
} from "./types";

export interface BuildReportInput {
  readonly underlying: OptionUnderlying;
  readonly snapshot: OptionChainSnapshot;
  readonly underlyingPriceChange: number | null;
  readonly historicalMaxPain?: number | null;
  readonly broadBreadth: MarketBreadthSnapshot | null;
  readonly sectorSnapshots: readonly MarketBreadthSnapshot[];
  readonly sectorRegistryVersion: string | null;
  readonly pcrScore: number | null;
  readonly pcrState: string | null;
  readonly vix: number | null;
  readonly decisionAction: string | null;
  readonly decisionConfidence: number | null;
  readonly gtiState: string | null;
  readonly gtiConfidence: number | null;
  readonly source: InstitutionalFlowReport["source"];
  readonly generatedAt?: string;
  readonly nowMs?: number;
}

export function buildInstitutionalFlowReport(input: BuildReportInput): InstitutionalFlowReport {
  const t0 = input.nowMs ?? Date.now();
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const oi = analyzeOi(input.snapshot);
  const buildUp = classifyBuildUp({
    underlyingPriceChange: input.underlyingPriceChange,
    totalCallChangeOi: oi.totalCallChangeOi,
    totalPutChangeOi: oi.totalPutChangeOi,
  });
  const maxPain = computeMaxPain({ snapshot: input.snapshot, historicalMaxPain: input.historicalMaxPain });
  const gamma = computeGamma(input.snapshot);
  const heatmap = buildHeatmap(oi, { atm: oi.atmStrike, maxPain: maxPain.currentMaxPain });
  const sectorFlow = buildSectorFlow({
    sectors: input.sectorSnapshots,
    registryVersion: input.sectorRegistryVersion,
  });
  const internals = buildMarketInternals({
    broadBreadth: input.broadBreadth,
    pcrScore: input.pcrScore,
    pcrState: input.pcrState,
    vix: input.vix,
    decisionAction: input.decisionAction,
    decisionConfidence: input.decisionConfidence,
    gtiState: input.gtiState,
    gtiConfidence: input.gtiConfidence,
  });
  const summary = summariseFlow({ oi, buildUp, maxPain, pcrScore: input.pcrScore });
  const t1 = input.nowMs != null ? input.nowMs : Date.now();
  const processingMs = Math.max(0, t1 - t0);

  const diagnostics = buildDiagnostics({
    underlying: input.underlying,
    snapshot: input.snapshot,
    oi,
    gamma,
    maxPain,
    buildUp,
    sectorFlow,
    processingMs,
  });

  return {
    underlying: input.underlying,
    spot: input.snapshot.spotPrice,
    generatedAt,
    oi,
    buildUp,
    maxPain,
    gamma,
    heatmap,
    sectorFlow,
    internals,
    summary,
    diagnostics,
    source: input.source,
    disclaimer: INSTITUTIONAL_FLOW_DISCLAIMER,
    version: INSTITUTIONAL_FLOW_VERSION,
  };
}

/**
 * Readiness classification for the runtime readiness engine.
 * Non-critical module: BLOCKED only if snapshot & PCR both missing.
 */
export function classifyInstitutionalFlowReadiness(r: InstitutionalFlowReport | null): {
  readonly available: boolean;
  readonly demo: boolean;
  readonly reason: string;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
} {
  if (!r) {
    return {
      available: false,
      demo: false,
      reason: "Institutional Flow unavailable — no canonical inputs",
      warnings: [],
      blockers: ["Option Chain snapshot unavailable"],
    };
  }
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (r.oi.availability === "UNAVAILABLE") blockers.push("OI analysis unavailable");
  if (r.diagnostics.missingGreeks) warnings.push("Gamma unavailable — provider missing greeks");
  if (r.diagnostics.snapshotFreshness === "STALE") warnings.push("Snapshot is STALE");
  if (r.sectorFlow.availability !== "OK") warnings.push("Sector flow partial or unavailable");

  const available = blockers.length === 0;
  const demo = r.source === "RESEARCH_DEMO";
  return {
    available,
    demo,
    reason: available
      ? demo
        ? "Institutional Flow computed from research demo snapshot"
        : "Institutional Flow computed from live canonical snapshot"
      : "Institutional Flow blocked — canonical inputs missing",
    warnings,
    blockers,
  };
}