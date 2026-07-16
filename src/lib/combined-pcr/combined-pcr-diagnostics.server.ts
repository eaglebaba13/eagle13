// Phase 27 · Stage 1 — Combined PCR diagnostics.
// Server-only. Read-only. Consumes existing Option Chain provider.

import { computeCombinedPcr } from "./combined-pcr";
import { DEFAULT_COMBINED_PCR_WEIGHTS } from "./types";
import type { OptionUnderlying, OptionChainSnapshot } from "../option-chain/types";

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
}

export async function buildCombinedPcrDiagnostics(): Promise<CombinedPcrDiagnosticsReport> {
  const now = new Date().toISOString();
  const rows: CombinedPcrDiagnosticRow[] = [];

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
    for (const u of ["NIFTY", "BANKNIFTY"] as const) {
      const inst = reading.instruments.find((i) => i.underlying === u) ?? null;
      const snap = snapshots[u];
      const freshness = snap ? Math.max(0, Date.now() - Date.parse(snap.timestamp)) : null;
      rows.push({
        underlying: u,
        status: inst && inst.instrumentScore != null ? "ACTIVE" : "FAILED",
        expiry: inst?.expiry ?? null,
        atm: inst?.atm ?? null,
        strikeCount: inst?.strikeCount ?? 0,
        totalCallOi: null,
        totalPutOi: null,
        totalCallChangeOi: null,
        totalPutChangeOi: null,
        rawOiPcr: inst?.rawOiPcr ?? null,
        rawChangeOiPcr: inst?.rawChangeOiPcr ?? null,
        emaFast: reading.emaFast,
        emaSlow: reading.emaSlow,
        slope: reading.slope,
        freshnessMs: freshness,
        provider: inst?.provider ?? "UPSTOX",
        capability: inst && inst.missing.length === 0 ? "OK" : inst ? "PARTIAL" : "MISSING",
        safeError: errors[u] ?? null,
      });
    }
  } catch (e) {
    const safe = e instanceof Error ? e.message.slice(0, 200) : "diagnostics failed";
    for (const u of ["NIFTY", "BANKNIFTY"] as const) {
      rows.push({
        underlying: u, status: "FAILED", expiry: null, atm: null, strikeCount: 0,
        totalCallOi: null, totalPutOi: null, totalCallChangeOi: null, totalPutChangeOi: null,
        rawOiPcr: null, rawChangeOiPcr: null, emaFast: null, emaSlow: null, slope: null,
        freshnessMs: null, provider: "UPSTOX", capability: "MISSING", safeError: safe,
      });
    }
  }

  rows.push({
    underlying: "SENSEX", status: "COMING_SOON", expiry: null, atm: null, strikeCount: 0,
    totalCallOi: null, totalPutOi: null, totalCallChangeOi: null, totalPutChangeOi: null,
    rawOiPcr: null, rawChangeOiPcr: null, emaFast: null, emaSlow: null, slope: null,
    freshnessMs: null, provider: "N/A", capability: "MISSING", safeError: null,
  });

  const active = rows.filter((r) => r.status === "ACTIVE").length;
  const overall: "READY" | "PARTIAL" | "OFFLINE" = active === 2 ? "READY" : active === 1 ? "PARTIAL" : "OFFLINE";
  return { generatedAt: now, rows, overall };
}