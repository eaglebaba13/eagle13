// Phase 27 · Stage 3 — Market Breadth / GTI server function.
//
// Consumes the existing Combined PCR server function output (via direct
// helper import) for the PCR confirmation, but the breadth itself flows
// from a provider-neutral bundle. When no live breadth provider is
// wired, the deterministic mock provider fills the bundle so the
// research page is always testable — never labelled live.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildMockBreadthBundle, type MockScenario } from "./mock-provider";
import { evaluateVixRegime } from "./vix-regime";
import { adaptPcrConfirmation } from "./pcr-confirmation";
import { classifyGti } from "./gti-classifier";
import { evaluateMarketBreadthCapability, type MarketBreadthCapability, type MarketBreadthSourceKind } from "./capability";
import { safeProviderLabel } from "@/lib/provider-labels";
import type { CombinedPcrReading } from "../combined-pcr/types";

export interface GetMarketBreadthInput {
  readonly mockScenario?: MockScenario;
  readonly vix?: number | null;
  readonly previousVix?: number | null;
  readonly pcr?: CombinedPcrReading | null;
  readonly broadUniverseSize?: number;
  readonly runId?: string;
  readonly attachLive?: boolean;
  readonly useMockOptionChain?: boolean;
}

function validate(input: unknown): GetMarketBreadthInput {
  const i = (input ?? {}) as Partial<GetMarketBreadthInput>;
  return {
    mockScenario: (i.mockScenario as MockScenario | undefined) ?? "MIXED",
    vix: typeof i.vix === "number" ? i.vix : null,
    previousVix: typeof i.previousVix === "number" ? i.previousVix : null,
    pcr: (i.pcr as CombinedPcrReading | null | undefined) ?? null,
    broadUniverseSize: typeof i.broadUniverseSize === "number" ? i.broadUniverseSize : undefined,
    runId: typeof i.runId === "string" ? i.runId : undefined,
    attachLive: i.attachLive !== false,
    useMockOptionChain: i.useMockOptionChain === true,
  };
}

function newRunId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `gti-${Date.now().toString(36)}-${rand}`;
}

export const getMarketBreadth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      const bundle = buildMockBreadthBundle({
        scenario: data.mockScenario ?? "MIXED",
        broadUniverseSize: data.broadUniverseSize,
      });

      // ── Canonical live inputs (India VIX + Combined PCR) ─────
      let vixValue: number | null = data.vix ?? null;
      let vixFreshness: "FRESH" | "STALE" | "UNKNOWN" = data.vix != null ? "FRESH" : "UNKNOWN";
      let vixProviderAlias = data.vix != null ? safeProviderLabel("MARKET_DATA") : "N/A";
      let vixTimestamp = new Date().toISOString();
      let vixError: string | null = null;
      let vixLatencyMs: number | null = null;

      let pcrReading: CombinedPcrReading | null = data.pcr ?? null;
      let pcrError: string | null = null;
      let pcrLatencyMs: number | null = null;
      const pcrCapabilities: Record<string, string> = {};

      if (data.attachLive) {
        if (vixValue == null) {
          const tv = Date.now();
          try {
            const { getMarketData } = await import("../market.functions");
            const md = await getMarketData();
            if (md.vix && Number.isFinite(md.vix.livePrice)) {
              vixValue = md.vix.livePrice;
              const meta = md.providerMetadata?.vix;
              vixFreshness = meta?.status === "DELAYED" ? "STALE" : "FRESH";
              vixProviderAlias = safeProviderLabel("MARKET_DATA");
              vixTimestamp = meta?.receivedAt ?? vixTimestamp;
            } else {
              vixError = "no live vix";
            }
          } catch (e) {
            vixError = e instanceof Error ? e.message.slice(0, 120) : "vix error";
          }
          vixLatencyMs = Date.now() - tv;
        }

        if (pcrReading == null) {
          const tp = Date.now();
          try {
            const { fetchCanonicalOptionChain } = await import("../option-chain/canonical-snapshot.server");
            const { computeCombinedPcr } = await import("../combined-pcr/combined-pcr");
            const { DEFAULT_COMBINED_PCR_WEIGHTS } = await import("../combined-pcr/types");
            const { getSnapshotHistory } = await import("../option-chain/snapshot-history");
            const snapshots: Record<string, unknown> = {};
            let anyUsable = false;
            for (const u of ["NIFTY", "BANKNIFTY"] as const) {
              const res = await fetchCanonicalOptionChain({
                underlying: u,
                useMock: data.useMockOptionChain,
              });
              pcrCapabilities[u] = res.capability.status;
              const usable = res.capability.status === "SUPPORTED" || res.capability.status === "PARTIAL";
              snapshots[u] = usable && res.snapshot ? res.snapshot : null;
              if (usable && res.snapshot) anyUsable = true;
            }
            if (anyUsable) {
              pcrReading = computeCombinedPcr({
                snapshots: snapshots as never,
                weights: DEFAULT_COMBINED_PCR_WEIGHTS,
                atmMode: "ATM_10",
                history: getSnapshotHistory(),
                runId: newRunId(),
              });
            } else {
              pcrError = "pcr canonical unavailable";
            }
          } catch (e) {
            pcrError = e instanceof Error ? e.message.slice(0, 120) : "pcr error";
          }
          pcrLatencyMs = Date.now() - tp;
        }
      }

      const vix = evaluateVixRegime({
        currentVix: vixValue,
        previousVix: data.previousVix ?? null,
        provider: vixValue != null ? vixProviderAlias : "N/A",
        timestamp: vixTimestamp,
        freshness: vixValue != null ? vixFreshness : "UNKNOWN",
      });
      const pcr = adaptPcrConfirmation({ reading: pcrReading });
      const reading = classifyGti({
        broad: bundle.broad,
        nifty50: bundle.nifty50,
        topWeighted: bundle.topWeighted,
        banking: bundle.banking,
        it: bundle.it,
        oilGas: bundle.oilGas,
        auto: bundle.auto,
        pcr,
        vix,
        runId: data.runId ?? newRunId(),
      });

      // NIFTY50 constituents come from the deterministic mock provider
      // (no live per-symbol resolver wired in production); label the
      // breadth source as RESEARCH_DEMO so consumers never display it
      // as LIVE. VIX + PCR are live where possible.
      const breadthSource: MarketBreadthSourceKind = "RESEARCH_DEMO";
      const providerAlias = safeProviderLabel("BREADTH");
      const capability: MarketBreadthCapability = evaluateMarketBreadthCapability({
        nowIso: new Date().toISOString(),
        vix,
        vixError,
        vixLatencyMs,
        pcr,
        pcrError,
        pcrLatencyMs,
        breadth: { broad: bundle.broad, nifty50: bundle.nifty50 },
        breadthSource,
        providerAlias,
        latencyMs: Date.now() - t0,
      });

      return {
        ok: true as const,
        reading,
        providerId: providerAlias,
        providerAlias,
        capability,
        breadthSource,
        vixMeta: {
          providerAlias: vixProviderAlias,
          freshness: vix.freshness,
          timestamp: vix.timestamp,
          latencyMs: vixLatencyMs,
          error: vixError,
        },
        pcrMeta: {
          providerAlias: safeProviderLabel("OPTIONS"),
          available: pcr.available,
          quality: pcr.dataQuality,
          latencyMs: pcrLatencyMs,
          error: pcrError,
          instrumentCapabilities: pcrCapabilities,
        },
        safeError: null as string | null,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    } catch (e) {
      const safe = e instanceof Error ? e.message.slice(0, 200) : "market-breadth failed";
      const nowIso = new Date().toISOString();
      const providerAlias = safeProviderLabel("BREADTH");
      return {
        ok: false as const,
        reading: null,
        providerId: "N/A",
        providerAlias,
        capability: {
          status: "PROVIDER_ERROR" as const,
          reason: safe,
          providerAlias,
          failingStage: "AGGREGATION" as const,
          retryable: true,
          freshness: "UNKNOWN" as const,
          latencyMs: Date.now() - t0,
          observedAt: nowIso,
          source: "RESEARCH_DEMO" as const,
          notes: [],
        },
        breadthSource: "RESEARCH_DEMO" as const,
        vixMeta: null,
        pcrMeta: null,
        safeError: safe,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }
  });

export type GetMarketBreadthResult = Awaited<ReturnType<typeof getMarketBreadth>>;

export const getMarketBreadthDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const startedAt = new Date().toISOString();
    try {
      let isAdmin = false;
      try {
        const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
        isAdmin = data === true;
      } catch { isAdmin = false; }
      if (!isAdmin) {
        return { ok: false as const, report: null, safeError: "admin required", startedAt, completedAt: new Date().toISOString() };
      }
      const { buildMarketBreadthDiagnostics } = await import("./diagnostics.server");
      const report = await buildMarketBreadthDiagnostics();
      return { ok: true as const, report, safeError: null, startedAt, completedAt: new Date().toISOString() };
    } catch (e) {
      const safe = e instanceof Error ? e.message.slice(0, 200) : "diagnostics failed";
      return { ok: false as const, report: null, safeError: safe, startedAt, completedAt: new Date().toISOString() };
    }
  });
