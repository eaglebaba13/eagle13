// Phase 2G — Runtime readiness collector (server fn).
//
// Assembles canonical evidence from already-cached snapshots and
// hands it to the pure builder. This is the single server endpoint
// consumed by every status page and dashboard summary.

import { createServerFn } from "@tanstack/react-start";
import { buildRuntimeReadinessReport } from "./build-report";
import type { RuntimeReadinessReport } from "./runtime-readiness";

function newRunId(): string {
  return `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const getRuntimeReadinessReport = createServerFn({ method: "POST" })
  .handler(async (): Promise<RuntimeReadinessReport> => {
    const now = new Date().toISOString();
    const { fetchCanonicalOptionChain } =
      await import("@/lib/option-chain/canonical-snapshot.server");
    const { getMarketData } = await import("@/lib/market.functions");
    const { computeCombinedPcr } = await import("@/lib/combined-pcr/combined-pcr");
    const { DEFAULT_COMBINED_PCR_WEIGHTS } = await import("@/lib/combined-pcr/types");
    const { getSnapshotHistory } = await import("@/lib/option-chain/snapshot-history");
    const { evaluateMarketBreadthCapability } = await import("@/lib/market-breadth/capability");
    const { evaluateVixRegime } = await import("@/lib/market-breadth/vix-regime");
    const { adaptPcrConfirmation } = await import("@/lib/market-breadth/pcr-confirmation");
    const { classifyGti } = await import("@/lib/market-breadth/gti-classifier");
    const { classifySmartAlertReadiness, unknownEngineHealth } =
      await import("@/lib/smart-alerts/readiness");

    // ── Parallel independent probes ─────────────────────────────
    const [quotesRes, niftyRes, bnkRes] = await Promise.allSettled([
      getMarketData(),
      fetchCanonicalOptionChain({ underlying: "NIFTY" }),
      fetchCanonicalOptionChain({ underlying: "BANKNIFTY" }),
    ]);

    const quotes = quotesRes.status === "fulfilled" ? quotesRes.value : null;
    const niftyChain = niftyRes.status === "fulfilled" ? niftyRes.value : null;
    const bnkChain = bnkRes.status === "fulfilled" ? bnkRes.value : null;

    const quotesAvailable = !!quotes?.nifty;
    const vixValue = quotes?.vix?.livePrice ?? null;

    // ── Combined PCR (canonical, reused snapshots) ──────────────
    let pcrReading: ReturnType<typeof computeCombinedPcr> | null = null;
    const snapshots = {
      NIFTY: niftyChain?.snapshot ?? null,
      BANKNIFTY: bnkChain?.snapshot ?? null,
    };
    if (Object.values(snapshots).some((s) => s != null)) {
      try {
        pcrReading = computeCombinedPcr({
          snapshots,
          weights: DEFAULT_COMBINED_PCR_WEIGHTS,
          atmMode: "ATM_10",
          history: getSnapshotHistory(),
          runId: newRunId(),
        });
      } catch {
        pcrReading = null;
      }
    }

    // ── Breadth capability ──────────────────────────────────────
    // Production readiness must use real breadth data, never mock.
    // When real breadth is unavailable, report UNAVAILABLE explicitly.
    const vix = evaluateVixRegime({
      currentVix: vixValue,
      previousVix: null,
      provider: vixValue != null ? "UPSTOX" : "N/A",
      timestamp: now,
      freshness: vixValue != null ? "FRESH" : "UNKNOWN",
    });
    const pcrConf = adaptPcrConfirmation({ reading: pcrReading ?? null });
    const breadthCap = evaluateMarketBreadthCapability({
      nowIso: now,
      vix,
      vixError: null,
      vixLatencyMs: null,
      pcr: pcrConf,
      pcrError: null,
      pcrLatencyMs: null,
      breadth: { broad: null, nifty50: null },
      breadthSource: "CONFIGURATION",
      providerAlias: "BREADTH",
      latencyMs: 0,
    });

    // ── GTI classifier ──────────────────────────────────────────
    let gtiComputed = false;
    try {
      classifyGti({
        broad: null,
        nifty50: null,
        topWeighted: null,
        banking: null,
        it: null,
        oilGas: null,
        auto: null,
        pcr: pcrConf,
        vix,
        runId: newRunId(),
      });
      gtiComputed = true;
    } catch {
      gtiComputed = false;
    }

    return buildRuntimeReadinessReport({
      nowIso: now,
      quotesAvailable,
      vixAvailable: vixValue != null,
      niftyCapability: niftyChain?.capability ?? null,
      banknifyCapability: bnkChain?.capability ?? null,
      combinedPcr: pcrReading,
      breadthCapability: breadthCap,
      gtiComputed,
      smartAlertEngine: (() => {
        // Probe operational health. Non-fatal — engine module registration
        // reflects import success + rule count + adapter configuration.
        const health = unknownEngineHealth();
        const readiness = classifySmartAlertReadiness(health);
        return {
          available: readiness.status !== "UNAVAILABLE",
          demo: false,
          reason: readiness.reason,
          warnings: readiness.warnings,
          blockers: readiness.blockers,
        };
      })(),
      institutionalFlow: (() => {
        // Institutional Flow depends on canonical option-chain OI. Marked
        // available whenever at least one underlying reports SUPPORTED or
        // PARTIAL — heavier module reads still run under `/institutional-flow`.
        const nifty = niftyChain?.capability?.status;
        const bnk = bnkChain?.capability?.status;
        const anyUsable = [nifty, bnk].some((s) => s === "SUPPORTED" || s === "PARTIAL");
        return {
          available: anyUsable,
          demo: !anyUsable ? false : nifty !== "SUPPORTED" && bnk !== "SUPPORTED",
          reason: anyUsable
            ? "Institutional Flow consuming canonical option-chain snapshot"
            : "Institutional Flow blocked — option chain unavailable",
          warnings: anyUsable ? [] : ["Canonical option-chain snapshot missing"],
          blockers: anyUsable ? [] : ["OPTION_CHAIN unavailable"],
        };
      })(),
    });
  });

export type RuntimeReadinessResult = Awaited<ReturnType<typeof getRuntimeReadinessReport>>;
