// Phase 28 — Unified GTI / Dashboard summary server function.
//
// Aggregates existing server pieces into ONE fetch so the dashboard
// summary widget and the expanded GTI section share the same result
// and never issue duplicate provider requests. Pure consumer: this
// module never touches Astro, Decision, Broker, or formulas.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMarketData } from "../market.functions";
import { computeCombinedPcr } from "../combined-pcr/combined-pcr";
import { DEFAULT_COMBINED_PCR_WEIGHTS } from "../combined-pcr/types";
import { buildMockBreadthBundle } from "../market-breadth/mock-provider";
import { evaluateVixRegime } from "../market-breadth/vix-regime";
import { adaptPcrConfirmation } from "../market-breadth/pcr-confirmation";
import { classifyGti } from "../market-breadth/gti-classifier";
import { evaluateTrafficLight, type TrafficLight } from "../provider-health/traffic-light";
import type { OptionUnderlying, OptionChainSnapshot } from "../option-chain/types";

export interface GtiSummaryResponse {
  readonly nifty: { readonly price: number; readonly change: number; readonly changePercent: number } | null;
  readonly banknifty: { readonly price: number; readonly change: number; readonly changePercent: number } | null;
  readonly vix: { readonly value: number | null; readonly regime: string; readonly rising: boolean };
  readonly combinedPcr: {
    readonly score: number | null;
    readonly state: string;
    readonly direction: "CE" | "NEUTRAL" | "PE";
  };
  readonly breadthState: string;
  readonly gti: {
    readonly state: string;
    readonly confidence: number;
    readonly conflicts: number;
  };
  readonly health: {
    readonly overall: TrafficLight;
    readonly quotes: TrafficLight;
    readonly options: TrafficLight;
    readonly breadth: TrafficLight;
  };
  readonly freshness: string;
  readonly runId: string;
  readonly generatedAt: string;
  readonly warnings: readonly string[];
  readonly disclaimer: string;
}

function newRunId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `gti-sum-${Date.now().toString(36)}-${rand}`;
}

export const getGtiSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<GtiSummaryResponse> => {
    const generatedAt = new Date().toISOString();
    const warnings: string[] = [];

    // ── 1. Quotes ─────────────────────────────────────────────
    let quotes: Awaited<ReturnType<typeof getMarketData>> | null = null;
    try {
      quotes = await getMarketData();
    } catch (e) {
      warnings.push(`quotes:${e instanceof Error ? e.message.slice(0, 80) : "error"}`);
    }
    const nifty = quotes?.nifty
      ? { price: quotes.nifty.livePrice, change: quotes.nifty.change, changePercent: quotes.nifty.changePct }
      : null;
    const banknifty = quotes?.banknifty
      ? { price: quotes.banknifty.livePrice, change: quotes.banknifty.change, changePercent: quotes.banknifty.changePct }
      : null;
    const vixValue = quotes?.vix?.livePrice ?? null;

    // ── 2. Combined PCR (option-chain foundation) ────────────
    let pcrReading: ReturnType<typeof computeCombinedPcr> | null = null;
    try {
      const { UpstoxOptionChainProvider } = await import("../option-chain/upstox-provider.server");
      const { MockOptionChainProvider } = await import("../option-chain/mock-provider");
      const { getSnapshotHistory } = await import("../option-chain/snapshot-history");
      const provider = new UpstoxOptionChainProvider();
      const fallback = new MockOptionChainProvider({ scenario: "SIDEWAYS" });
      const history = getSnapshotHistory();
      const snapshots: Partial<Record<OptionUnderlying, OptionChainSnapshot | null>> = {};
      for (const u of ["NIFTY", "BANKNIFTY"] as const) {
        const res = await provider.fetchSnapshot({ underlying: u }).catch(() => null);
        if (res?.ok && res.snapshot) {
          snapshots[u] = res.snapshot;
          try { history.push(res.snapshot); } catch { /* ignore */ }
        } else {
          const mock = await fallback.fetchSnapshot({ underlying: u });
          snapshots[u] = mock.snapshot ?? null;
          warnings.push(`pcr:${u}:fallback`);
        }
      }
      pcrReading = computeCombinedPcr({
        snapshots,
        weights: DEFAULT_COMBINED_PCR_WEIGHTS,
        atmMode: "ATM_10",
        history,
        runId: newRunId(),
      });
    } catch (e) {
      warnings.push(`pcr:${e instanceof Error ? e.message.slice(0, 80) : "error"}`);
    }

    // ── 3. Breadth + VIX regime + GTI classify ───────────────
    const bundle = buildMockBreadthBundle({ scenario: "MIXED" });
    const vix = evaluateVixRegime({
      currentVix: vixValue,
      previousVix: null,
      provider: vixValue != null ? "UPSTOX" : "N/A",
      timestamp: generatedAt,
      freshness: vixValue != null ? "FRESH" : "UNKNOWN",
    });
    const pcrConf = adaptPcrConfirmation({ reading: pcrReading ?? null });
    const gtiReading = classifyGti({
      broad: bundle.broad,
      nifty50: bundle.nifty50,
      topWeighted: bundle.topWeighted,
      banking: bundle.banking,
      it: bundle.it,
      oilGas: bundle.oilGas,
      auto: bundle.auto,
      pcr: pcrConf,
      vix,
      runId: newRunId(),
    });

    // ── 4. Traffic-lights ────────────────────────────────────
    const quotesLight = evaluateTrafficLight({
      freshnessMs: nifty ? 30_000 : null,
      latencyMs: null,
      coverage: nifty && banknifty ? 1 : 0.5,
      failures: nifty && banknifty ? 0 : 1,
      providerStatus: (quotes?.providerMetadata?.nifty?.status as never) ?? "UNKNOWN",
    });
    const optionsLight = evaluateTrafficLight({
      freshnessMs: pcrReading ? 30_000 : null,
      latencyMs: null,
      coverage: pcrReading ? 1 : 0.5,
      failures: pcrReading ? 0 : 1,
    });
    const breadthLight = evaluateTrafficLight({
      freshnessMs: 60_000,
      latencyMs: null,
      coverage: bundle.broad.constituentCoverage ?? 0,
      failures: 0,
      providerStatus: "DELAYED",
    });
    const rank: Record<TrafficLight, number> = { GREEN: 0, YELLOW: 1, RED: 2 };
    const overall: TrafficLight = [quotesLight, optionsLight, breadthLight].reduce<TrafficLight>(
      (acc, cur) => (rank[cur] > rank[acc] ? cur : acc),
      "GREEN",
    );

    return {
      nifty,
      banknifty,
      vix: { value: vixValue, regime: vix.regime, rising: vix.rising },
      combinedPcr: {
        score: pcrReading?.combinedScore ?? null,
        state: pcrReading?.confirmedState ?? "NO_TRADE",
        direction: pcrReading?.direction ?? "NEUTRAL",
      },
      breadthState: bundle.nifty50.dataQuality,
      gti: {
        state: gtiReading.state,
        confidence: gtiReading.confidence,
        conflicts: gtiReading.conflicts.length,
      },
      health: { overall, quotes: quotesLight, options: optionsLight, breadth: breadthLight },
      freshness: generatedAt,
      runId: gtiReading.runId,
      generatedAt,
      warnings,
      disclaimer: "RESEARCH ONLY — NOT INVESTMENT ADVICE",
    };
  });

export type GtiSummary = Awaited<ReturnType<typeof getGtiSummary>>;