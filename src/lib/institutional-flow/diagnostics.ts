// Phase 3D — Institutional Flow diagnostics builder.
// Redacts raw provider payloads. Safe for admin export.

import type { OptionChainSnapshot, OptionUnderlying } from "@/lib/option-chain/types";
import type {
  InstitutionalFlowDiagnostics,
  OiAnalysis,
  GammaResult,
  MaxPainResult,
  AggregateBuildUp,
  SectorFlow,
} from "./types";

export function buildDiagnostics(input: {
  readonly underlying: OptionUnderlying;
  readonly snapshot: OptionChainSnapshot | null;
  readonly oi: OiAnalysis;
  readonly gamma: GammaResult;
  readonly maxPain: MaxPainResult;
  readonly buildUp: AggregateBuildUp;
  readonly sectorFlow: SectorFlow;
  readonly processingMs: number;
}): InstitutionalFlowDiagnostics {
  const { snapshot, oi, gamma, maxPain, buildUp, sectorFlow } = input;
  const warnings: string[] = [];
  const unavailable: string[] = [];

  if (gamma.availability === "UNAVAILABLE") unavailable.push("gamma");
  if (maxPain.availability === "UNAVAILABLE") unavailable.push("max_pain");
  if (buildUp.availability === "UNAVAILABLE") unavailable.push("build_up");
  if (sectorFlow.availability === "UNAVAILABLE") unavailable.push("sector_flow");
  if (oi.availability === "UNAVAILABLE") unavailable.push("oi_analysis");

  const strikeCoverage = snapshot?.strikes.length ?? 0;
  const missingGreeks = gamma.availability === "UNAVAILABLE";
  if (missingGreeks) warnings.push("Provider does not expose option greeks");
  if (snapshot?.dataQuality === "STALE") warnings.push("Option chain marked STALE");
  if (oi.availability === "PARTIAL") warnings.push("OI analysis has partial coverage");

  const freshness: InstitutionalFlowDiagnostics["snapshotFreshness"] =
    snapshot == null ? "UNKNOWN" : snapshot.dataQuality === "STALE" ? "STALE" : "FRESH";

  return {
    underlying: input.underlying,
    snapshotTimestamp: snapshot?.timestamp ?? null,
    snapshotProvider: snapshot?.provider ?? "UNAVAILABLE",
    snapshotFreshness: freshness,
    strikeCoverage,
    missingGreeks,
    unavailableCalculations: unavailable,
    processingMs: input.processingMs,
    warnings,
  };
}