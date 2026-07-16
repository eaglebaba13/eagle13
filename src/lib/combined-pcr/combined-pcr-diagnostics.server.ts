// Phase 27 · Stage 1 — Combined PCR diagnostics.
// Server-only. Read-only. Consumes existing Option Chain provider.

import { computeCombinedPcr } from "./combined-pcr";
import { DEFAULT_COMBINED_PCR_WEIGHTS } from "./types";
import type { OptionUnderlying, OptionChainSnapshot } from "../option-chain/types";
import { aggregateStrikes } from "./pcr-math";
import { filterStrikes } from "../option-chain/strike-filter";
import { assessSensexCapability, type SensexCapabilityReport } from "./sensex-capability";

export interface CombinedPcrDiagnosticRow {
  readonly underlying: OptionUnderlying | "SENSEX";
  readonly status: "ACTIVE" | "COMING_SOON" | "FAILED";
  readonly expiry: string | null;
  readonly atm: number | null;
  readonly strikeCount: number;
  readonly totalCallOi: number | null;
  readonly totalPutOi: number | null;
  readonly totalCallChangeOi: number | null;
  readonly totalPutChangeOi: number | null;
  readonly rawOiPcr: number | null;
  readonly rawChangeOiPcr: number | null;
  readonly normalizedOiPcr: number | null;
  readonly normalizedChangeOiPcr: number | null;
  readonly instrumentScore: number | null;
  readonly configuredWeight: number | null;
  readonly effectiveWeight: number | null;
  readonly emaFast: number | null;
  readonly emaSlow: number | null;
  readonly slope: number | null;
  readonly freshnessMs: number | null;
  readonly provider: string;
  readonly capability: "OK" | "PARTIAL" | "MISSING";
  readonly safeError: string | null;
}

export interface CombinedPcrDiagnosticsReport {
  readonly generatedAt: string;
  readonly rows: readonly CombinedPcrDiagnosticRow[];
  readonly overall: "READY" | "PARTIAL" | "OFFLINE";
  readonly combinedScore: number | null;
  readonly signalState: string | null;
  readonly weightRenormalization: {
    readonly configured: Record<string, number>;
    readonly effective: Record<string, number>;
    readonly renormalized: boolean;
  };
  readonly sensex: SensexCapabilityReport;
}

export async function buildCombinedPcrDiagnostics(): Promise<CombinedPcrDiagnosticsReport> {
  const now = new Date().toISOString();
  const rows: CombinedPcrDiagnosticRow[] = [];
  let combinedScore: number | null = null;
  let signalState: string | null = null;
  const configured: Record<string, number> = {
    NIFTY: DEFAULT_COMBINED_PCR_WEIGHTS.NIFTY,
    BANKNIFTY: DEFAULT_COMBINED_PCR_WEIGHTS.BANKNIFTY,
  };
  const effective: Record<string, number> = { NIFTY: 0, BANKNIFTY: 0 };
  let sensex: SensexCapabilityReport = assessSensexCapability({
    snapshot: null, providerId: "N/A", safeError: "not wired",
  });

  try {
    const { UpstoxOptionChainProvider } = await import("../option-chain/upstox-provider.server");
    const provider = new UpstoxOptionChainProvider();
    const snapshots: Partial<Record<OptionUnderlying, OptionChainSnapshot | null>> = {};
    const errors: Partial<Record<OptionUnderlying, string | null>> = {};
    for (const u of ["NIFTY", "BANKNIFTY"] as const) {
      const res = await provider.fetchSnapshot({ underlying: u });
      if (res.ok && res.snapshot) {
        snapshots[u] = res.snapshot;
        errors[u] = null;
      } else {
        snapshots[u] = null;
        errors[u] = res.meta.safeError ?? "unavailable";
      }
    }
    const reading = computeCombinedPcr({
      snapshots,
      weights: DEFAULT_COMBINED_PCR_WEIGHTS,
      runId: `pcr-diag-${Date.now().toString(36)}`,
    });
    combinedScore = reading.combinedScore;
    signalState = reading.signalState;
    for (const u of ["NIFTY", "BANKNIFTY"] as const) {
      const inst = reading.instruments.find((i) => i.underlying === u) ?? null;
      const snap = snapshots[u];
      const freshness = snap ? Math.max(0, Date.now() - Date.parse(snap.timestamp)) : null;
      let totalCallOi: number | null = null;
      let totalPutOi: number | null = null;
      let totalCallChangeOi: number | null = null;
      let totalPutChangeOi: number | null = null;
      if (snap) {
        const filter = filterStrikes(snap, "ATM_10");
        const agg = aggregateStrikes(filter.included);
        totalCallOi = agg.callOi;
        totalPutOi = agg.putOi;
        totalCallChangeOi = agg.callChangeOiPositive;
        totalPutChangeOi = agg.putChangeOiPositive;
      }
      if (inst) effective[u] = inst.weight;
      rows.push({
        underlying: u,
        status: inst && inst.instrumentScore != null ? "ACTIVE" : "FAILED",
        expiry: inst?.expiry ?? null,
        atm: inst?.atm ?? null,
        strikeCount: inst?.strikeCount ?? 0,
        totalCallOi,
        totalPutOi,
        totalCallChangeOi,
        totalPutChangeOi,
        rawOiPcr: inst?.rawOiPcr ?? null,
        rawChangeOiPcr: inst?.rawChangeOiPcr ?? null,
        normalizedOiPcr: inst?.normalizedOiPcr ?? null,
        normalizedChangeOiPcr: inst?.normalizedChangeOiPcr ?? null,
        instrumentScore: inst?.instrumentScore ?? null,
        configuredWeight: inst?.configuredWeight ?? configured[u] ?? null,
        effectiveWeight: inst?.weight ?? null,
        emaFast: reading.emaFast,
        emaSlow: reading.emaSlow,
        slope: reading.slope,
        freshnessMs: freshness,
        provider: inst?.provider ?? "UPSTOX",
        capability: inst && inst.missing.length === 0 ? "OK" : inst ? "PARTIAL" : "MISSING",
        safeError: errors[u] ?? null,
      });
    }
    // SENSEX capability probe — currently no provider path; stays UNSUPPORTED.
    sensex = assessSensexCapability({
      snapshot: null, providerId: "UPSTOX",
      safeError: "no SENSEX option-chain provider wired",
    });
  } catch (e) {
    const safe = e instanceof Error ? e.message.slice(0, 200) : "diagnostics failed";
    for (const u of ["NIFTY", "BANKNIFTY"] as const) {
      rows.push({
        underlying: u, status: "FAILED", expiry: null, atm: null, strikeCount: 0,
        totalCallOi: null, totalPutOi: null, totalCallChangeOi: null, totalPutChangeOi: null,
        rawOiPcr: null, rawChangeOiPcr: null,
        normalizedOiPcr: null, normalizedChangeOiPcr: null,
        instrumentScore: null, configuredWeight: configured[u] ?? null, effectiveWeight: null,
        emaFast: null, emaSlow: null, slope: null,
        freshnessMs: null, provider: "UPSTOX", capability: "MISSING", safeError: safe,
      });
    }
    sensex = assessSensexCapability({
      snapshot: null, providerId: "UPSTOX", safeError: safe,
    });
  }

  rows.push({
    underlying: "SENSEX", status: "COMING_SOON", expiry: null, atm: null, strikeCount: 0,
    totalCallOi: null, totalPutOi: null, totalCallChangeOi: null, totalPutChangeOi: null,
    rawOiPcr: null, rawChangeOiPcr: null,
    normalizedOiPcr: null, normalizedChangeOiPcr: null,
    instrumentScore: null, configuredWeight: null, effectiveWeight: null,
    emaFast: null, emaSlow: null, slope: null,
    freshnessMs: null, provider: "N/A", capability: "MISSING", safeError: null,
  });

  const active = rows.filter((r) => r.status === "ACTIVE").length;
  const overall: "READY" | "PARTIAL" | "OFFLINE" = active === 2 ? "READY" : active === 1 ? "PARTIAL" : "OFFLINE";
  const cfgSum = configured.NIFTY + configured.BANKNIFTY;
  const effSum = effective.NIFTY + effective.BANKNIFTY;
  const renormalized = Math.abs(cfgSum - effSum) > 1e-6
    || Math.abs((configured.NIFTY || 0) - (effective.NIFTY || 0)) > 1e-6
    || Math.abs((configured.BANKNIFTY || 0) - (effective.BANKNIFTY || 0)) > 1e-6;
  return {
    generatedAt: now, rows, overall,
    combinedScore, signalState,
    weightRenormalization: { configured, effective, renormalized },
    sensex,
  };
}