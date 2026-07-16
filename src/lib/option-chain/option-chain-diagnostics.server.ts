// Phase 26 · Stage 5 — Option Chain diagnostics (server-only).
// Read-only per-underlying capability probe surfaced by /admin/providers.

import { UpstoxHttpClient } from "../provider-foundation/upstox/upstox-http.server";
import { UpstoxOptionChainProvider } from "./upstox-provider.server";
import { classifyExpiries } from "./expiry-engine";
import { computeAtm } from "./atm-engine";
import { assessDataQuality } from "./data-quality";
import type { OptionUnderlying } from "./types";

export type OptionDiagVerdict = "PASS" | "PARTIAL" | "FAIL" | "AUTH_REQUIRED";

export interface OptionChainDiagnosticRow {
  readonly underlying: OptionUnderlying;
  readonly verdict: OptionDiagVerdict;
  readonly authentication: OptionDiagVerdict;
  readonly expiry: OptionDiagVerdict;
  readonly spot: OptionDiagVerdict;
  readonly strikeCount: number;
  readonly atm: number | null;
  readonly snapshot: OptionDiagVerdict;
  readonly latencyMs: number;
  readonly provider: string;
  readonly freshness: OptionDiagVerdict;
  readonly historicalAvailability: OptionDiagVerdict;
  readonly intradayAvailability: OptionDiagVerdict;
  readonly safeError: string | null;
  readonly upstreamCode: string | null;
  readonly checkedAt: string;
}

export interface OptionChainDiagnosticsReport {
  readonly rows: readonly OptionChainDiagnosticRow[];
  readonly generatedAt: string;
}

async function probe(underlying: OptionUnderlying, http: UpstoxHttpClient): Promise<OptionChainDiagnosticRow> {
  const checkedAt = new Date().toISOString();
  const provider = new UpstoxOptionChainProvider(http);
  const t0 = Date.now();
  const res = await provider.fetchSnapshot({ underlying });
  const latency = Date.now() - t0;

  if (!res.ok || !res.snapshot) {
    const auth = res.meta.status === "AUTH_REQUIRED";
    return {
      underlying,
      verdict: auth ? "AUTH_REQUIRED" : "FAIL",
      authentication: auth ? "AUTH_REQUIRED" : "FAIL",
      expiry: "FAIL",
      spot: "FAIL",
      strikeCount: 0,
      atm: null,
      snapshot: "FAIL",
      latencyMs: latency,
      provider: "UPSTOX",
      freshness: "FAIL",
      historicalAvailability: "PARTIAL",
      intradayAvailability: "PARTIAL",
      safeError: res.meta.safeError,
      upstreamCode: res.meta.upstreamCode,
      checkedAt,
    };
  }

  const snap = res.snapshot;
  const q = assessDataQuality(snap, { nowIso: checkedAt });
  const atm = computeAtm(snap.strikes, snap.spotPrice, "ATM").atm;
  const expiries = await provider.listExpiries(underlying);
  const cls = classifyExpiries(expiries, checkedAt);

  return {
    underlying,
    verdict: q.ok && snap.strikes.length >= 5 && snap.spotPrice != null ? "PASS" : "PARTIAL",
    authentication: "PASS",
    expiry: cls.currentWeekly ? "PASS" : "PARTIAL",
    spot: snap.spotPrice != null ? "PASS" : "FAIL",
    strikeCount: snap.strikes.length,
    atm,
    snapshot: q.ok ? "PASS" : "PARTIAL",
    latencyMs: latency,
    provider: "UPSTOX",
    freshness: q.issues.some((i) => i.code === "PROVIDER_STALE") ? "PARTIAL" : "PASS",
    historicalAvailability: "PASS",
    intradayAvailability: "PASS",
    safeError: null,
    upstreamCode: null,
    checkedAt,
  };
}

export async function buildOptionChainDiagnostics(
  http: UpstoxHttpClient = new UpstoxHttpClient(),
): Promise<OptionChainDiagnosticsReport> {
  const rows = await Promise.all((["NIFTY", "BANKNIFTY"] as const).map((u) => probe(u, http)));
  return { rows, generatedAt: new Date().toISOString() };
}