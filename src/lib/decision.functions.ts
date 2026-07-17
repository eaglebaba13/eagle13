// Phase 17 — server aggregator for the Decision Intelligence Engine.
//
// This function ONLY CONSUMES outputs from already-validated engines. It
// never recomputes Astro, Signals, Support/Resistance, Backtest, Replay, or
// Options analytics. If a module is unavailable it is marked absent so the
// pure decision engine can redistribute weights transparently.
//
// Phase 2D wiring: Options + PCR now consume the CANONICAL option-chain
// snapshot (same helper `/options-chain` and Combined PCR use). Legacy
// Yahoo/NSE fetches are removed from the healthy path. Combined PCR is
// computed once, in this scope, from the same canonical snapshots — the
// pcrSignal is fed from that reading. Formulas are unchanged.

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
import type { OptionUnderlying, OptionChainSnapshot } from "./option-chain/types";
import type { OptionChainCapabilityStatus } from "./option-chain/capability";
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
import {
  buildOptionsModuleInput,
  buildPcrModuleInput,
  buildDecisionSummary,
  type DecisionSummary,
  type OptionsModuleInput,
  type PcrModuleInput,
} from "./decision/module-inputs";
import { safeProviderLabel } from "./provider-labels";
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
    optionsCanonical: {
      NIFTY: {
        status: OptionChainCapabilityStatus;
        reason: string;
        suggestedAction: string;
        retryable: boolean;
        providerAlias: string;
        freshnessSec: number | null;
        latencyMs: number | null;
        fetchedAt: string | null;
        expiry: string | null;
        strikeCount: number;
      };
      BANKNIFTY: {
        status: OptionChainCapabilityStatus;
        reason: string;
        suggestedAction: string;
        retryable: boolean;
        providerAlias: string;
        freshnessSec: number | null;
        latencyMs: number | null;
        fetchedAt: string | null;
        expiry: string | null;
        strikeCount: number;
      };
    };
    pcrCombined: {
      computed: boolean;
      status: OptionChainCapabilityStatus;
      reason: string;
      pcrOi: number | null;
      combinedScore: number | null;
      direction: "CE" | "NEUTRAL" | "PE" | null;
      instrumentCount: number;
      formulaVersion: string;
      providerAlias: string;
    };
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
  summary: DecisionSummary;
  generatedAt: string;
};

export const getDecisionSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<DecisionSnapshot> =>
    cached<DecisionSnapshot>(
      astroCacheKey("decision-snapshot"),
      async () => {
        // Phase 2D: single canonical option-chain fetch per underlying.
        // No legacy Yahoo/NSE fallback. Combined PCR is computed once
        // from the same snapshots and reused for the pcrSignal input.
        const { fetchCanonicalOptionChain } = await import(
          "./option-chain/canonical-snapshot.server"
        );
        const { computeCombinedPcr } = await import("./combined-pcr/combined-pcr");
        const { getSnapshotHistory } = await import("./option-chain/snapshot-history");

        const [astroRes, marketRes, niftyCanonRes, banknCanonRes] =
          await Promise.allSettled([
            getAstro(),
            getMarketData(),
            fetchCanonicalOptionChain({ underlying: "NIFTY" }),
            fetchCanonicalOptionChain({ underlying: "BANKNIFTY" }),
          ]);

        const astro = astroRes.status === "fulfilled" ? astroRes.value : null;
        const market = marketRes.status === "fulfilled" ? marketRes.value : null;
        const niftyCanon =
          niftyCanonRes.status === "fulfilled" ? niftyCanonRes.value : null;
        const banknCanon =
          banknCanonRes.status === "fulfilled" ? banknCanonRes.value : null;

        const nowIso = new Date().toISOString();

        // ----- Options module input (from canonical envelope) -----
        const niftyOptions: OptionsModuleInput | null = niftyCanon
          ? buildOptionsModuleInput(
              "NIFTY",
              {
                ok: niftyCanon.ok,
                snapshot: niftyCanon.snapshot,
                meta: niftyCanon.meta,
                capability: niftyCanon.capability,
              },
              nowIso,
            )
          : null;
        const banknOptionsInput: OptionsModuleInput | null = banknCanon
          ? buildOptionsModuleInput(
              "BANKNIFTY",
              {
                ok: banknCanon.ok,
                snapshot: banknCanon.snapshot,
                meta: banknCanon.meta,
                capability: banknCanon.capability,
              },
              nowIso,
            )
          : null;

        const chain = niftyOptions?.chain ?? null;
        const usedLive = niftyOptions?.usable === true;

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

        // ----- Combined PCR (once, from canonical snapshots) -----
        const snapshotsForPcr: Partial<Record<OptionUnderlying, OptionChainSnapshot | null>> = {
          NIFTY: niftyOptions?.usable ? (niftyCanon?.snapshot ?? null) : null,
          BANKNIFTY: banknOptionsInput?.usable ? (banknCanon?.snapshot ?? null) : null,
        };
        const anyUsable = Object.values(snapshotsForPcr).some((s) => s != null);
        let combinedReading = null as Awaited<ReturnType<typeof computeCombinedPcr>> | null;
        if (anyUsable) {
          try {
            combinedReading = computeCombinedPcr({
              snapshots: snapshotsForPcr,
              history: getSnapshotHistory(),
              runId: `decision-${Date.now().toString(36)}`,
              nowIso,
            });
          } catch {
            combinedReading = null;
          }
        }

        // ----- Options + PCR signals -----
        let optionsSig: ModuleSignal = absentSignal("options", 0.2, "Options");
        let pcrSig: ModuleSignal = absentSignal("pcr", 0.1, "PCR");
        let optionsSource = chain?.integrity.sourceStatus ?? "UNAVAILABLE";
        if (niftyOptions?.usable && chain && chain.integrity.sourceStatus !== "UNAVAILABLE") {
          const legs = chain.snapshot.legs;
          // pcrOi is sourced from Combined PCR when available. If the
          // combined reading is missing (e.g. history/aggregation edge),
          // fall back to the SAME canonical legs — never a legacy fetch,
          // never a fake zero.
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
          // Prefer Combined PCR's NIFTY OI-PCR when available.
          const combinedNifty =
            combinedReading?.instruments.find((i) => i.underlying === "NIFTY") ?? null;
          const pcrOiForSignal = combinedNifty?.rawOiPcr ?? pcr.pcrOi;
          pcrSig = pcrSignal({ pcrOi: pcrOiForSignal });
        }

        // Capability explainers: canonical status → decision capability.
        const pcrInput: PcrModuleInput = buildPcrModuleInput(
          niftyOptions ?? {
            underlying: "NIFTY",
            usable: false,
            chain: null,
            capability: "NO_DATA",
            canonicalStatus: "PROVIDER_ERROR",
            explainer: explainCapability("NO_DATA", { module: "options", stage: "provider-fetch", provider: safeProviderLabel(null, "OPTIONS") }),
            providerAlias: safeProviderLabel(null, "OPTIONS"),
            fetchedAt: null,
            latencyMs: null,
            freshnessSec: null,
            expiry: null,
            strikeCount: 0,
            safeError: null,
            reason: "Canonical option-chain fetch failed.",
            suggestedAction: "Retry, or check Admin → Providers.",
            retryable: true,
            failingStage: "provider-fetch",
          },
          combinedReading,
        );
        const optionsExplainer: CapabilityExplainer =
          niftyOptions?.explainer ??
          explainCapability("NO_DATA", {
            module: "options",
            stage: "provider-fetch",
            provider: safeProviderLabel(null, "OPTIONS"),
          });
        const pcrExplainer: CapabilityExplainer = pcrInput.explainer;

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

        const providerAlias = safeProviderLabel(null, "OPTIONS");
        const summary = buildDecisionSummary({
          action: decision.action,
          confidence: decision.confidence,
          risk: decision.risk.level,
          present: decision.contributions.filter((c) => c.present).length,
          total: decision.contributions.length,
          options:
            niftyOptions ?? {
              underlying: "NIFTY",
              usable: false,
              chain: null,
              capability: "NO_DATA",
              canonicalStatus: "PROVIDER_ERROR",
              explainer: optionsExplainer,
              providerAlias,
              fetchedAt: null,
              latencyMs: null,
              freshnessSec: null,
              expiry: null,
              strikeCount: 0,
              safeError: null,
              reason: "Canonical option-chain fetch failed.",
              suggestedAction: "Retry.",
              retryable: true,
              failingStage: "provider-fetch",
            },
          pcr: pcrInput,
          generatedAt: new Date().toISOString(),
        });

        return {
          decision,
          signals,
          context: {
            symbol: "NIFTY",
            vix: vixVal,
            marketOpen,
            provider: providerAlias,
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
            optionsCanonical: {
              NIFTY: {
                status: niftyOptions?.canonicalStatus ?? "PROVIDER_ERROR",
                reason: niftyOptions?.reason ?? "Option chain unavailable.",
                suggestedAction: niftyOptions?.suggestedAction ?? "Retry.",
                retryable: niftyOptions?.retryable ?? true,
                providerAlias,
                freshnessSec: niftyOptions?.freshnessSec ?? null,
                latencyMs: niftyOptions?.latencyMs ?? null,
                fetchedAt: niftyOptions?.fetchedAt ?? null,
                expiry: niftyOptions?.expiry ?? null,
                strikeCount: niftyOptions?.strikeCount ?? 0,
              },
              BANKNIFTY: {
                status: banknOptionsInput?.canonicalStatus ?? "PROVIDER_ERROR",
                reason: banknOptionsInput?.reason ?? "Option chain unavailable.",
                suggestedAction: banknOptionsInput?.suggestedAction ?? "Retry.",
                retryable: banknOptionsInput?.retryable ?? true,
                providerAlias,
                freshnessSec: banknOptionsInput?.freshnessSec ?? null,
                latencyMs: banknOptionsInput?.latencyMs ?? null,
                fetchedAt: banknOptionsInput?.fetchedAt ?? null,
                expiry: banknOptionsInput?.expiry ?? null,
                strikeCount: banknOptionsInput?.strikeCount ?? 0,
              },
            },
            pcrCombined: {
              computed: pcrInput.computed,
              status: pcrInput.canonicalStatus,
              reason: pcrInput.reason,
              pcrOi: pcrInput.pcrOi,
              combinedScore: pcrInput.combinedScore,
              direction: pcrInput.direction,
              instrumentCount: pcrInput.instrumentCount,
              formulaVersion: pcrInput.formulaVersion,
              providerAlias,
            },
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
            provider: providerAlias,
            capability: niftyOptions?.capability ?? "NO_DATA",
            latencyMs: niftyOptions?.latencyMs ?? 0,
            fetchedAt: niftyOptions?.fetchedAt ?? null,
            safeError: niftyOptions?.safeError ?? null,
          },
          summary,
          generatedAt: new Date().toISOString(),
        };
      },
      { ttlMs: 30_000 },
    ),
);

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