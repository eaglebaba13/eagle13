// Phase 3D — Institutional Flow server function.
// Consumer only. Canonical option-chain + PCR + breadth + decision + GTI.
// Never fetches its own providers, never emits signals or orders.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildInstitutionalFlowReport } from "./report";
import type { InstitutionalFlowReport } from "./types";
import type { OptionUnderlying, OptionChainSnapshot } from "@/lib/option-chain/types";

export interface GetInstitutionalFlowInput {
  readonly underlying?: OptionUnderlying;
  readonly useMock?: boolean;
}

export const getInstitutionalFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: GetInstitutionalFlowInput | undefined) => data ?? {})
  .handler(async ({ data }): Promise<InstitutionalFlowReport> => {
    const underlying: OptionUnderlying = data.underlying === "BANKNIFTY" ? "BANKNIFTY" : "NIFTY";
    const t0 = Date.now();

    // Canonical option chain — sole source of leg/OI/greeks.
    const { fetchCanonicalOptionChain } = await import(
      "@/lib/option-chain/canonical-snapshot.server"
    );
    const chainRes = await fetchCanonicalOptionChain({ underlying });
    const snapshot: OptionChainSnapshot | null =
      chainRes.ok && chainRes.snapshot ? chainRes.snapshot : null;

    // Combined PCR — reuse canonical snapshot history.
    let pcrScore: number | null = null;
    let pcrState: string | null = null;
    try {
      const { computeCombinedPcr } = await import("../combined-pcr/combined-pcr");
      const { DEFAULT_COMBINED_PCR_WEIGHTS } = await import("../combined-pcr/types");
      const { getSnapshotHistory } = await import("../option-chain/snapshot-history");
      const other = underlying === "NIFTY"
        ? await fetchCanonicalOptionChain({ underlying: "BANKNIFTY" })
        : await fetchCanonicalOptionChain({ underlying: "NIFTY" });
      const snaps: Partial<Record<OptionUnderlying, OptionChainSnapshot | null>> = {
        [underlying]: snapshot,
        [underlying === "NIFTY" ? "BANKNIFTY" : "NIFTY"]:
          other.ok && other.snapshot ? other.snapshot : null,
      };
      if (snapshot) {
        const pcr = computeCombinedPcr({
          snapshots: snaps,
          weights: DEFAULT_COMBINED_PCR_WEIGHTS,
          atmMode: "ATM_10",
          history: getSnapshotHistory(),
          runId: `iflow-${Date.now().toString(36)}`,
        });
        pcrScore = pcr.combinedScore;
        pcrState = pcr.confirmedState;
      }
    } catch { /* pcr optional */ }

    // Breadth bundle — canonical research bundle (Phase 2 policy).
    const { buildMockBreadthBundle } = await import("../market-breadth/mock-provider");
    const { SECTOR_REGISTRY_VERSION } = await import("../market-breadth/sector-registry");
    const bundle = buildMockBreadthBundle({ scenario: "MIXED" });

    // Underlying price change — reuse getMarketData quote if present.
    let underlyingPriceChange: number | null = null;
    let vix: number | null = null;
    try {
      const { getMarketData } = await import("../market.functions");
      const md = await getMarketData();
      const q = underlying === "NIFTY" ? md?.nifty : md?.banknifty;
      if (q && Number.isFinite(q.change)) underlyingPriceChange = q.change;
      vix = md?.vix?.livePrice ?? null;
    } catch { /* market data optional */ }

    // Decision + GTI — consume canonical snapshots, do not re-classify here.
    let decisionAction: string | null = null;
    let decisionConfidence: number | null = null;
    let gtiState: string | null = null;
    let gtiConfidence: number | null = null;
    try {
      const { getDecisionSnapshot } = await import("../decision.functions");
      const dec = await getDecisionSnapshot();
      decisionAction = dec?.summary?.decision ?? null;
      decisionConfidence = dec?.summary?.confidence ?? null;
    } catch { /* decision optional */ }
    try {
      const { classifyGti } = await import("../market-breadth/gti-classifier");
      const { evaluateVixRegime } = await import("../market-breadth/vix-regime");
      const { adaptPcrConfirmation } = await import("../market-breadth/pcr-confirmation");
      const vixEval = evaluateVixRegime({
        currentVix: vix,
        previousVix: null,
        provider: vix != null ? "UPSTOX" : "N/A",
        timestamp: new Date().toISOString(),
        freshness: vix != null ? "FRESH" : "UNKNOWN",
      });
      const gti = classifyGti({
        broad: bundle.broad,
        nifty50: bundle.nifty50,
        topWeighted: bundle.topWeighted,
        banking: bundle.banking,
        it: bundle.it,
        oilGas: bundle.oilGas,
        auto: bundle.auto,
        pcr: adaptPcrConfirmation({ reading: null }),
        vix: vixEval,
        runId: `iflow-gti-${Date.now().toString(36)}`,
      });
      gtiState = gti.state;
      gtiConfidence = gti.confidence;
    } catch { /* gti optional */ }

    if (!snapshot) {
      // Return an UNAVAILABLE-shaped report with empty snapshot placeholder.
      const placeholder: OptionChainSnapshot = {
        provider: "UNAVAILABLE",
        instrument: underlying,
        expiry: "",
        timestamp: new Date().toISOString(),
        spotPrice: null,
        strikes: [],
        availableExpiries: [],
        marketSession: "CLOSED",
        dataQuality: "STALE",
      };
      return buildInstitutionalFlowReport({
        underlying,
        snapshot: placeholder,
        underlyingPriceChange,
        broadBreadth: bundle.broad,
        sectorSnapshots: [bundle.banking, bundle.it, bundle.oilGas, bundle.auto],
        sectorRegistryVersion: SECTOR_REGISTRY_VERSION,
        pcrScore,
        pcrState,
        vix,
        decisionAction,
        decisionConfidence,
        gtiState,
        gtiConfidence,
        source: "UNAVAILABLE",
        nowMs: t0,
      });
    }

    return buildInstitutionalFlowReport({
      underlying,
      snapshot,
      underlyingPriceChange,
      broadBreadth: bundle.broad,
      sectorSnapshots: [bundle.banking, bundle.it, bundle.oilGas, bundle.auto],
      sectorRegistryVersion: SECTOR_REGISTRY_VERSION,
      pcrScore,
      pcrState,
      vix,
      decisionAction,
      decisionConfidence,
      gtiState,
      gtiConfidence,
      source: pcrScore != null && (vix != null || underlyingPriceChange != null) ? "MIXED" : "MIXED",
      nowMs: t0,
    });
  });

export type InstitutionalFlowResponse = Awaited<ReturnType<typeof getInstitutionalFlow>>;