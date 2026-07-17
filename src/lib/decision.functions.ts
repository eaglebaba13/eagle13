// Phase 17 — server aggregator for the Decision Intelligence Engine.
//
// This function ONLY CONSUMES outputs from already-validated engines. It
// never recomputes Astro, Signals, Support/Resistance, Backtest, Replay, or
// Options analytics. If a module is unavailable it is marked absent so the
// pure decision engine can redistribute weights transparently.

import { createServerFn } from "@tanstack/react-start";
import { cached } from "./server-cache";
import {
  DEFAULT_ASTRO_FORMULA_VERSION,
  astroCacheKey,
  astroFormulaLabel,
  type AstroFormulaVersion,
} from "./engine-version";
import { getAstro } from "./astro.functions";
import { getMarketData } from "./market.functions";
import { getOptionsChain } from "./options-chain.functions";
import { nseSession } from "./terminal-clock";
import {
  computePCR,
  rankWriting,
  rankUnwinding,
} from "./options-analytics";
import {
  astroSignal,
  optionsSignal,
  pcrSignal,
  breadthSignal,
  sectorSignal,
  vixSignal,
  historicalSignal,
  replaySignal,
  computeDecision,
  type Decision,
  type ModuleSignal,
  type Bias,
} from "./decision-engine";
import type { CapabilityExplainer, ModuleCapability } from "./decision/capability";
import { explainCapability } from "./decision/capability";
import type { LiveChainAdapterResult } from "./decision/live-chain-adapter";
import { isAdaptedChainLive } from "./decision/live-chain-adapter";
import {
  selectHistoricalAccuracy,
  type HistoricalAccuracyResult,
  type HistoricalRunCandidate,
} from "./decision/historical-accuracy-adapter";
import {
  alignReplay,
  type ReplayObservation,
  type ReplayResult,
} from "./decision/replay-adapter";

export type DecisionSnapshot = {
  decision: Decision;
  signals: ModuleSignal[];
  context: {
    symbol: "NIFTY" | "BANKNIFTY";
    vix: number | null;
    marketOpen: boolean;
    provider: string;
    optionsSource: string;
    nifty: number | null;
    banknifty: number | null;
  };
  methodology: {
    astroFormulaVersion: AstroFormulaVersion;
    astroFormulaLabel: string;
    signalMethod: string;
    decisionMethod: string;
  };
  capabilities: {
    options: CapabilityExplainer;
    pcr: CapabilityExplainer;
    historical: {
      capability: HistoricalAccuracyResult["capability"];
      source: HistoricalAccuracyResult["source"];
      reason: string;
      sampleSize: number | null;
      winRatePct: number | null;
      runId: string | null;
      freshness: HistoricalAccuracyResult["freshness"];
      formulaVersion: string | null;
    };
    replay: {
      capability: ReplayResult["capability"];
      reason: string;
      observationCount: number;
      dominantDecision: ReplayResult["dominantDecision"];
      quality: ReplayResult["quality"];
      startTime: string | null;
      endTime: string | null;
      mfe: number | null;
      mae: number | null;
      transitions: number;
    };
  };
  liveOptionChain: {
    used: boolean;
    provider: string;
    capability: ModuleCapability;
    latencyMs: number;
    fetchedAt: string | null;
    safeError: string | null;
  };
  generatedAt: string;
};

export const getDecisionSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<DecisionSnapshot> =>
    cached<DecisionSnapshot>(
      astroCacheKey("decision-snapshot"),
      async () => {
        // Reuse every existing engine — never recompute.
        //
        // Phase 31 wiring: prefer the live Upstox option-chain provider
        // (same source Combined PCR uses). Fall back to the legacy
        // Yahoo/NSE `getOptionsChain` only when Upstox is not usable, so
        // the Decision matrix stops rendering "MISSING" whenever the live
        // pipeline is healthy. Formulas below are unchanged.
        const { fetchLiveDecisionChain } = await import(
          "./decision/live-chain-source.server"
        );
        const [astroRes, marketRes, liveChainRes] = await Promise.allSettled([
          getAstro(),
          getMarketData(),
          fetchLiveDecisionChain("NIFTY"),
        ]);

        const astro = astroRes.status === "fulfilled" ? astroRes.value : null;
        const market = marketRes.status === "fulfilled" ? marketRes.value : null;
        const liveAdapter: LiveChainAdapterResult | null =
          liveChainRes.status === "fulfilled" ? liveChainRes.value : null;

        // Only fall back to the legacy provider when the live path is not
        // usable — this avoids duplicate provider fetches when Upstox is
        // healthy.
        let chain = liveAdapter?.chain ?? null;
        let usedLive = liveAdapter != null && isAdaptedChainLive(liveAdapter);
        if (!usedLive) {
          try {
            chain = await getOptionsChain({ data: { symbol: "NIFTY" } });
          } catch {
            chain = chain; // keep any partial live chain if present
          }
        }

        const marketOpen = nseSession().isOpen;

        // ----- Astro signal -----
        const astroSig: ModuleSignal = astro
          ? astroSignal({
              bullCount: astro.bullCount,
              bearCount: astro.bearCount,
              retroCount: astro.retroCount,
              emaBias: astro.emaBias,
            })
          : absentSignal("astro", 0.25, "Astro");

        // ----- Options + PCR signals -----
        let optionsSig: ModuleSignal = absentSignal("options", 0.2, "Options");
        let pcrSig: ModuleSignal = absentSignal("pcr", 0.1, "PCR");
        let optionsSource = chain?.integrity.sourceStatus ?? "UNAVAILABLE";
        if (chain && chain.integrity.sourceStatus !== "UNAVAILABLE") {
          const legs = chain.snapshot.legs;
          const pcr = computePCR(legs);
          const topPutWriting = rankWriting(legs, chain.snapshot.spot, "PE", 3);
          const topCallWriting = rankWriting(legs, chain.snapshot.spot, "CE", 3);
          const topPutUnwind = rankUnwinding(legs, chain.snapshot.spot, "PE", 3);
          const topCallUnwind = rankUnwinding(legs, chain.snapshot.spot, "CE", 3);
          const putWriteVol = topPutWriting.reduce((a, r) => a + r.changeOi, 0);
          const callWriteVol = topCallWriting.reduce((a, r) => a + r.changeOi, 0);
          const putUnwindVol = Math.abs(
            topPutUnwind.reduce((a, r) => a + r.changeOi, 0),
          );
          const callUnwindVol = Math.abs(
            topCallUnwind.reduce((a, r) => a + r.changeOi, 0),
          );
          const bull =
            putWriteVol > callWriteVol * 1.1 || callUnwindVol > putUnwindVol * 1.1;
          const bear =
            callWriteVol > putWriteVol * 1.1 || putUnwindVol > callUnwindVol * 1.1;
          optionsSig = optionsSignal({
            pcrOi: pcr.pcrOi,
            writingBiasBull: bull,
            writingBiasBear: bear,
            present: chain.integrity.isTradable || chain.integrity.sourceStatus === "LIVE",
            note: `PCR-OI ${pcr.pcrOi.toFixed(2)} · put-write ${putWriteVol.toLocaleString()} vs call-write ${callWriteVol.toLocaleString()}`,
          });
          pcrSig = pcrSignal({ pcrOi: pcr.pcrOi });
        }

        // Capability explainers surface the exact failure/success stage.
        const optionsCapability: ModuleCapability =
          liveAdapter?.capability
          ?? (chain && chain.integrity.sourceStatus !== "UNAVAILABLE"
              ? "SUPPORTED"
              : "NO_DATA");
        const optionsExplainer =
          liveAdapter?.explainer
          ?? explainCapability(optionsCapability, {
            module: "options",
            stage: chain ? "delivery" : "provider-fetch",
            provider: chain?.snapshot.provider ?? "unknown",
          });
        // PCR shares the option-chain pipeline; when Options is live, PCR
        // is also live (we recompute PCR from the same legs).
        const pcrExplainer = explainCapability(
          isFullyLiveOptions(optionsCapability) ? "SUPPORTED" : optionsCapability,
          { module: "pcr", stage: "derived-from-options", provider: optionsExplainer.provider },
        );

        // ----- Breadth: indices trending together = positive breadth -----
        const advancers: string[] = [];
        const decliners: string[] = [];
        const check = (name: string, pct: number | null | undefined) => {
          if (pct == null) return;
          if (pct > 0.05) advancers.push(name);
          else if (pct < -0.05) decliners.push(name);
        };
        if (market) {
          check("NIFTY", market.nifty?.changePct);
          check("BANKNIFTY", market.banknifty?.changePct);
          check("VIX", market.vix ? -market.vix.changePct : null);
          check("Gold", market.gold?.changePct);
          check("Silver", market.silver?.changePct);
          check("BTC", market.btc?.changePct);
        }
        const breadthSig = breadthSignal({
          advancers: advancers.length,
          decliners: decliners.length,
          present: advancers.length + decliners.length > 0,
        });

        // ----- Sector rotation (NIFTY vs BANKNIFTY relative strength) -----
        let sectorSig: ModuleSignal = absentSignal("sector", 0.1, "Sector Rotation");
        if (market?.nifty && market.banknifty) {
          const diff = market.banknifty.changePct - market.nifty.changePct;
          const strength = Math.min(1, Math.abs(diff) / 1.5);
          const bias: Bias = diff > 0.2 ? "BULL" : diff < -0.2 ? "BEAR" : "NEUTRAL";
          sectorSig = sectorSignal({
            leadingBias: bias,
            strength,
            note: `BANK NIFTY vs NIFTY ${diff.toFixed(2)}%`,
            present: true,
          });
        }

        // ----- VIX -----
        const vixVal = market?.vix?.livePrice ?? null;
        const vixSig = vixSignal({
          vix: vixVal,
          changePct: market?.vix?.changePct ?? null,
        });

        // Phase 32 · Historical Accuracy + Replay adapters.
        // Both adapters consume ALREADY-computed results only. We pass
        // empty candidate/observation arrays here as the default in-
        // request path — persistent stores can plug in later without
        // touching the decision formulas. If nothing compatible is
        // available, the pure engine keeps the module absent and the UI
        // shows the exact capability + reason.
        const historicalCandidates: readonly HistoricalRunCandidate[] = [];
        const replayObservations: readonly ReplayObservation[] = [];
        const historicalResult = selectHistoricalAccuracy(historicalCandidates, {
          instrument: "NIFTY",
          strategyVersion: `astro@${DEFAULT_ASTRO_FORMULA_VERSION}`,
          formulaVersion: "decision@1.0.0",
          timeframe: "5m",
          now: new Date().toISOString(),
        });
        const replayResult = alignReplay(replayObservations, {
          instrument: "NIFTY",
          formulaVersion: "decision@1.0.0",
          minObservations: 5,
        });
        const historicalSig =
          historicalResult.capability === "SUPPORTED"
            ? historicalSignal({
                winRatePct: historicalResult.winRatePct,
                direction: historicalResult.direction,
                sampleSize: historicalResult.sampleSize ?? 0,
              })
            : historicalSignal({
                winRatePct: null,
                direction: "NEUTRAL",
                sampleSize: 0,
              });
        const replaySig =
          replayResult.capability === "SUPPORTED" && replayResult.dominantDecision !== "UNKNOWN"
            ? replaySignal({
                agreesWithDirection: replayResult.dominantDecision !== "WAIT",
                direction:
                  replayResult.dominantDecision === "CE"
                    ? "BULL"
                    : replayResult.dominantDecision === "PE"
                      ? "BEAR"
                      : "NEUTRAL",
                note: `Replay dominant=${replayResult.dominantDecision}, obs=${replayResult.observationCount}`,
              })
            : replaySignal({
                agreesWithDirection: null,
                direction: "NEUTRAL",
              });

        const signals = [
          astroSig,
          optionsSig,
          pcrSig,
          breadthSig,
          sectorSig,
          vixSig,
          historicalSig,
          replaySig,
        ];

        const decision = computeDecision(signals, {
          vix: vixVal,
          historicalAccuracy: historicalResult.winRatePct,
          marketOpen,
          generatedAt: new Date().toISOString(),
        });

        return {
          decision,
          signals,
          context: {
            symbol: "NIFTY",
            vix: vixVal,
            marketOpen,
            provider: chain?.snapshot.provider ?? "Yahoo / EagleBABA engines",
            optionsSource,
            nifty: market?.nifty?.livePrice ?? null,
            banknifty: market?.banknifty?.livePrice ?? null,
          },
          methodology: {
            astroFormulaVersion: DEFAULT_ASTRO_FORMULA_VERSION,
            astroFormulaLabel: astroFormulaLabel(DEFAULT_ASTRO_FORMULA_VERSION),
            signalMethod: "EagleBaba Composite Signal",
            decisionMethod: "EagleBaba Decision Intelligence",
          },
          capabilities: {
            options: optionsExplainer,
            pcr: pcrExplainer,
            historical: {
              capability: historicalResult.capability,
              source: historicalResult.source,
              reason: historicalResult.reason,
              sampleSize: historicalResult.sampleSize,
              winRatePct: historicalResult.winRatePct,
              runId: historicalResult.runId,
              freshness: historicalResult.freshness,
              formulaVersion: historicalResult.formulaVersion,
            },
            replay: {
              capability: replayResult.capability,
              reason: replayResult.reason,
              observationCount: replayResult.observationCount,
              dominantDecision: replayResult.dominantDecision,
              quality: replayResult.quality,
              startTime: replayResult.startTime,
              endTime: replayResult.endTime,
              mfe: replayResult.mfe,
              mae: replayResult.mae,
              transitions: replayResult.transitions,
            },
          },
          liveOptionChain: {
            used: usedLive,
            provider: liveAdapter?.provider ?? "n/a",
            capability: liveAdapter?.capability ?? "NO_DATA",
            latencyMs: liveAdapter?.latencyMs ?? 0,
            fetchedAt: liveAdapter?.fetchedAt ?? null,
            safeError: liveAdapter?.safeError ?? null,
          },
          generatedAt: new Date().toISOString(),
        };
      },
      { ttlMs: 30_000 },
    ),
);

function isFullyLiveOptions(cap: ModuleCapability): boolean {
  return cap === "SUPPORTED";
}

function absentSignal(
  key: ModuleSignal["key"],
  weight: number,
  label: string,
): ModuleSignal {
  return {
    key,
    label,
    bias: "NEUTRAL",
    score: 0,
    confidence: 0,
    weight,
    present: false,
    note: "Not available",
  };
}