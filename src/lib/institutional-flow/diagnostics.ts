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
import { INSTITUTIONAL_FLOW_VERSION } from "./types";

const MAX_PAIN_METHODOLOGY =
  "pain(K) = Σ callOi(S)·max(K−S,0) + putOi(S)·max(S−K,0); minimise pain(K). Tie-break: nearest-to-spot, then lower strike.";
const BUILD_UP_METHODOLOGY =
  "Aggregate leg-normalised OI build-up. Call side: underlying up + ΔOI up → LONG_BUILDUP. Put side: leg price inverted from underlying. See report.buildUp for evidence.";

export function buildDiagnostics(input: {
  readonly underlying: OptionUnderlying;
  readonly snapshot: OptionChainSnapshot | null;
  readonly oi: OiAnalysis;
  readonly gamma: GammaResult;
  readonly maxPain: MaxPainResult;
  readonly buildUp: AggregateBuildUp;
  readonly sectorFlow: SectorFlow;
  readonly processingMs: number;
  readonly lastSuccessfulAt?: string | null;
  readonly lastFailedAt?: string | null;
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
  if (sectorFlow.availability !== "OK") {
    warnings.push(
      "Sector coverage limited to canonical registry (Banking, IT, Auto, Oil & Gas); FMCG / Pharma / Financials / Metals require canonical constituent mappings.",
    );
  }

  const freshness: InstitutionalFlowDiagnostics["snapshotFreshness"] =
    snapshot == null ? "UNKNOWN" : snapshot.dataQuality === "STALE" ? "STALE" : "FRESH";

  const denom = Math.max(1, strikeCoverage);
  const pct = (n: number) => (strikeCoverage === 0 ? 0 : n / denom);
  const rows = snapshot?.strikes ?? [];
  const callOiCoverage = pct(rows.filter((s) => s.call.oi != null).length);
  const putOiCoverage = pct(rows.filter((s) => s.put.oi != null).length);
  const changeOiCoverage = pct(
    rows.filter((s) => s.call.changeOi != null || s.put.changeOi != null).length,
  );
  const volumeCoverage = pct(
    rows.filter((s) => s.call.volume != null || s.put.volume != null).length,
  );
  const ivCoverage = pct(
    rows.filter((s) => s.call.iv != null || s.put.iv != null).length,
  );
  const greeksCoverage = pct(
    rows.filter((s) => s.call.greeks != null || s.put.greeks != null).length,
  );
  const sectorRows = sectorFlow.rows;
  const sectorCoverage = sectorRows.length === 0
    ? 0
    : sectorRows.filter((r) => r.bias !== "UNAVAILABLE").length / sectorRows.length;

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
    methodologyVersion: INSTITUTIONAL_FLOW_VERSION,
    maxPainMethodology: MAX_PAIN_METHODOLOGY,
    buildUpMethodology: BUILD_UP_METHODOLOGY,
    callOiCoverage,
    putOiCoverage,
    changeOiCoverage,
    volumeCoverage,
    ivCoverage,
    greeksCoverage,
    missingGreeksReason: missingGreeks ? "PROVIDER_GREEKS_UNAVAILABLE" : null,
    maxPainAvailability: maxPain.availability,
    gammaAvailability: gamma.availability,
    sectorCoverage,
    lastSuccessfulAt: input.lastSuccessfulAt ?? null,
    lastFailedAt: input.lastFailedAt ?? null,
  };
}