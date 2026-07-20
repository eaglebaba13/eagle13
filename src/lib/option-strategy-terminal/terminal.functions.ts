// Phase 3A — Server function for the Live Option Strategy Terminal.
// Pure consumer of canonical modules. Never fetches from a broker directly
// and never recomputes any formula. Aggregates:
//   - Decision Engine snapshot (already includes Astro/PCR/Breadth/VIX/Historical)
//   - GTI Summary (Combined PCR + breadth traffic-lights + GTI state)
//   - Gann Gap Outlook
// and feeds them into the deterministic strategy engine.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { getDecisionSnapshot } from "@/lib/decision.functions";
import { getGtiSummary } from "@/lib/gti-summary/gti-summary.functions";
import { getGannGapOutlook } from "@/lib/gann-gap/gann-gap.functions";
import { getInstitutionalFlow } from "@/lib/institutional-flow/institutional-flow.functions";
import { computeOptionDecision, computeInstitutionalFlow } from "@/lib/option-strategy-decision";
import type {
  DecisionEngineOutput,
  InstitutionalFlowEngineOutput,
} from "@/lib/option-strategy-decision";

import type { Bias, ModuleKey } from "@/lib/decision-engine";
import { runStrategyEngine } from "./strategies";
import { withExplanation } from "./explanation";
import type {
  CanonicalBias,
  CanonicalSignals,
  StrategyEngineOutput,
} from "./types";

function biasToCanonical(bias: Bias | undefined, present: boolean): CanonicalBias {
  if (!present) return "UNAVAILABLE";
  if (bias === "BULL") return "BULLISH";
  if (bias === "BEAR") return "BEARISH";
  if (bias === "NEUTRAL") return "NEUTRAL";
  return "UNAVAILABLE";
}

function gtiStateToBias(state: string): CanonicalBias {
  const s = state.toUpperCase();
  if (s.includes("BULL")) return "BULLISH";
  if (s.includes("BEAR")) return "BEARISH";
  if (s.includes("CONFLICT")) return "CONFLICT";
  if (s.includes("NEUTRAL") || s.includes("RANGE") || s.includes("NO_TRADE")) return "NEUTRAL";
  return "UNAVAILABLE";
}

function gapLabelToBias(label: string): CanonicalBias {
  const s = label.toUpperCase();
  if (s.includes("UP") || s.includes("BULL")) return "BULLISH";
  if (s.includes("DOWN") || s.includes("BEAR")) return "BEARISH";
  if (s.includes("FLAT") || s.includes("NEUTRAL") || s.includes("RANGE")) return "NEUTRAL";
  return "UNAVAILABLE";
}

export interface TerminalResponse {
  readonly signals: CanonicalSignals;
  readonly engine: StrategyEngineOutput;
  readonly decisionEngine: DecisionEngineOutput;
  readonly institutionalFlowEngine: InstitutionalFlowEngineOutput;
  readonly evidence: {
    readonly decision: { available: boolean; action: string; regime: string; confidence: number | null };
    readonly pcr: { available: boolean; state: string; direction: string; score: number | null };
    readonly gti: { available: boolean; state: string; confidence: number };
    readonly breadth: { available: boolean; state: string };
    readonly astro: { available: boolean; bias: CanonicalBias };
    readonly gann: { available: boolean; bias: CanonicalBias };
    readonly gannGap: { available: boolean; label: string; source: string };
  };
  readonly source: "LIVE" | "MIXED" | "RESEARCH_DEMO" | "UNAVAILABLE";
  readonly disclaimer: string;
  readonly generatedAt: string;
}

export const getOptionStrategyTerminal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<TerminalResponse> => {
    const generatedAt = new Date().toISOString();
    const [decisionRes, gtiRes, gapRes, flowRes] = await Promise.allSettled([
      getDecisionSnapshot(),
      getGtiSummary(),
      getGannGapOutlook(),
      getInstitutionalFlow({ data: { underlying: "NIFTY" } }),
    ]);

    const decision = decisionRes.status === "fulfilled" ? decisionRes.value : null;
    const gti = gtiRes.status === "fulfilled" ? gtiRes.value : null;
    const gap = gapRes.status === "fulfilled" ? gapRes.value : null;
    const flow = flowRes.status === "fulfilled" ? flowRes.value : null;

    const findContribution = (key: ModuleKey) =>
      decision?.decision.contributions.find((c) => c.key === key) ?? null;

    const astroC = findContribution("astro");
    const pcrC = findContribution("pcr");
    const breadthC = findContribution("breadth");

    const astroBias = biasToCanonical(astroC?.bias, !!astroC?.present);
    const pcrBias = biasToCanonical(pcrC?.bias, !!pcrC?.present);
    const breadthBias = biasToCanonical(breadthC?.bias, !!breadthC?.present);
    const gtiBias = gti ? gtiStateToBias(gti.gti.state) : "UNAVAILABLE";
    const gannGapBias = gap && gap.lifecycle !== "PENDING" ? gapLabelToBias(gap.label) : "UNAVAILABLE";

    let decisionBias: CanonicalBias = "UNAVAILABLE";
    if (decision) {
      const a = decision.decision.action;
      if (a === "STRONG_BUY_CE" || a === "BUY_CE") decisionBias = "BULLISH";
      else if (a === "STRONG_BUY_PE" || a === "BUY_PE") decisionBias = "BEARISH";
      else if (a === "WAIT") decisionBias = "NEUTRAL";
    }

    const decisionConfidence = decision?.decision.confidence ?? null;
    const vix = decision?.context.vix ?? gti?.vix.value ?? null;

    const signals: CanonicalSignals = {
      decision: decisionBias,
      pcr: pcrBias,
      gti: gtiBias,
      breadth: breadthBias,
      astro: astroBias,
      gann: "UNAVAILABLE", // Reserved: Gann levels module doesn't yet expose a bias.
      gannGap: gannGapBias,
      decisionConfidence: decisionConfidence != null ? decisionConfidence * 100 : null,
    };

    const engine = withExplanation(
      signals,
      runStrategyEngine({ signals, vix, generatedAt }),
    );

    // Phase 27 — Weighted Decision Engine (research-only).
    const sectorRows = flow?.sectorFlow.rows ?? [];
    const findSector = (needle: string) =>
      sectorRows.find((r) => r.name.toUpperCase().includes(needle)) ?? null;
    const bankingRow = findSector("BANK");
    const itRow = findSector("IT") ?? findSector("TECH");
    const oilGasRow = findSector("OIL") ?? findSector("ENERGY");
    const sectorAvailable = !!flow && flow.sectorFlow.availability !== "UNAVAILABLE";
    const decisionEngine = computeOptionDecision({
      pcr: {
        combinedScore: decision?.capabilities.pcrCombined.combinedScore ?? null,
        state: decision?.capabilities.pcrCombined.direction ?? null,
        available: !!pcrC?.present,
      },
      breadth: {
        advances: flow?.internals.advances ?? null,
        declines: flow?.internals.declines ?? null,
        netBreadth: flow?.internals.netBreadth ?? null,
        available:
          !!flow &&
          (flow.internals.availability !== "UNAVAILABLE" ||
            flow.internals.netBreadth != null),
      },
      sector: {
        banking: bankingRow?.bias ?? "UNAVAILABLE",
        oilGas: oilGasRow?.bias ?? "UNAVAILABLE",
        it: itRow?.bias ?? "UNAVAILABLE",
        available: sectorAvailable,
      },
      oi: {
        highestCallOiStrike: flow?.oi.highestCallOiStrike ?? null,
        highestPutOiStrike: flow?.oi.highestPutOiStrike ?? null,
        atmStrike: flow?.oi.atmStrike ?? null,
        totalCallChangeOi: flow?.oi.totalCallChangeOi ?? null,
        totalPutChangeOi: flow?.oi.totalPutChangeOi ?? null,
        buildUp: flow?.buildUp.overall ?? null,
        available: !!flow && flow.oi.availability !== "UNAVAILABLE",
      },
      maxPain: {
        value: flow?.maxPain.currentMaxPain ?? null,
        spot: flow?.spot ?? null,
        distance: flow?.maxPain.distanceFromSpot ?? null,
        distancePct: flow?.maxPain.distanceFromSpotPct ?? null,
        available: !!flow && flow.maxPain.availability !== "UNAVAILABLE",
      },
      vix,
      underlying: "NIFTY",
      generatedAt,
    });

    const sources = [decision ? "LIVE" : null, gti?.source, gap?.source].filter(
      Boolean,
    ) as string[];
    let source: TerminalResponse["source"] = "UNAVAILABLE";
    if (sources.includes("LIVE")) source = "LIVE";
    else if (sources.includes("MIXED")) source = "MIXED";
    else if (sources.includes("RESEARCH_DEMO")) source = "RESEARCH_DEMO";

    // Phase 28 — Institutional Flow & Probability Engine (additive).
    const combinedPcrScore = decision?.capabilities.pcrCombined.combinedScore ?? null;
    const combinedPcrBias: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNAVAILABLE" =
      combinedPcrScore == null
        ? "UNAVAILABLE"
        : combinedPcrScore > 0.1
        ? "BULLISH"
        : combinedPcrScore < -0.1
        ? "BEARISH"
        : "NEUTRAL";
    const rawPcrOi = decision?.capabilities.pcrCombined.pcrOi ?? null;
    const flowBias: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNAVAILABLE" =
      flow?.summary.bias === "PUT_WRITERS_ACTIVE"
        ? "BULLISH"
        : flow?.summary.bias === "CALL_WRITERS_ACTIVE"
        ? "BEARISH"
        : flow?.summary.bias === "BALANCED"
        ? "NEUTRAL"
        : "UNAVAILABLE";
    const institutionalFlowEngine = computeInstitutionalFlow({
      pcrIndices: [
        {
          index: "NIFTY",
          pcr: rawPcrOi,
          weight: 0.6,
          available: !!pcrC?.present,
        },
        {
          index: "BANKNIFTY",
          pcr: null,
          weight: 0.4,
          available: !!pcrC?.present,
        },
        {
          index: "SENSEX",
          pcr: null,
          weight: 0,
          available: false,
        },
      ],
      combinedPcrValue: rawPcrOi,
      combinedPcrScore,
      combinedPcrBias,
      spot: flow?.spot ?? null,
      vwap: null, // canonical VWAP feed not wired yet — flagged Unavailable in checklist
      atmStrike: flow?.oi.atmStrike ?? null,
      highestCallOiStrike: flow?.oi.highestCallOiStrike ?? null,
      highestPutOiStrike: flow?.oi.highestPutOiStrike ?? null,
      maxPain: flow?.maxPain.currentMaxPain ?? null,
      oi: {
        totalCallChangeOi: flow?.oi.totalCallChangeOi ?? null,
        totalPutChangeOi: flow?.oi.totalPutChangeOi ?? null,
        priceChange: flow?.buildUp.underlyingPriceChange ?? null,
        buildUp: flow?.buildUp.overall ?? null,
        available: !!flow && flow.oi.availability !== "UNAVAILABLE",
      },
      breadthNet: flow?.internals.netBreadth ?? null,
      breadthAvailable:
        !!flow &&
        (flow.internals.availability !== "UNAVAILABLE" ||
          flow.internals.netBreadth != null),
      sectors: (flow?.sectorFlow.rows ?? []).map((r) => ({
        name: r.name,
        bias: r.bias,
      })),
      vix,
      vixRegime: decisionEngine.vixRegime,
      institutionalFlowBias: flowBias,
      institutionalFlowAvailable:
        !!flow && flow.summary.availability !== "UNAVAILABLE",
      decisionAction: decisionEngine.action,
      decisionConfidence: decisionEngine.confidence,
      strikeRecommended: {
        strike: decisionEngine.strike.strike,
        type: decisionEngine.strike.optionType,
        moneyness: decisionEngine.strike.moneyness,
        available: decisionEngine.strike.available,
      },
      dataFreshness: flow?.diagnostics.snapshotFreshness ?? "UNKNOWN",
      providerHealth: flow ? "OK" : "UNAVAILABLE",
      generatedAt,
    });

    return {
      signals,
      engine,
      decisionEngine,
      institutionalFlowEngine,
      evidence: {
        decision: {
          available: !!decision,
          action: decision?.decision.action ?? "UNAVAILABLE",
          regime: decision?.decision.regime ?? "UNAVAILABLE",
          confidence: decisionConfidence,
        },
        pcr: {
          available: !!pcrC?.present,
          state: decision?.capabilities.pcrCombined.direction ?? "UNAVAILABLE",
          direction: decision?.capabilities.pcrCombined.direction ?? "UNAVAILABLE",
          score: decision?.capabilities.pcrCombined.combinedScore ?? null,
        },
        gti: {
          available: !!gti,
          state: gti?.gti.state ?? "UNAVAILABLE",
          confidence: gti?.gti.confidence ?? 0,
        },
        breadth: {
          available: !!breadthC?.present,
          state: gti?.breadthState ?? "UNAVAILABLE",
        },
        astro: { available: !!astroC?.present, bias: astroBias },
        gann: { available: false, bias: "UNAVAILABLE" },
        gannGap: {
          available: !!gap && gap.lifecycle !== "PENDING",
          label: gap?.label ?? "UNAVAILABLE",
          source: gap?.source ?? "UNAVAILABLE",
        },
      },
      source,
      disclaimer:
        "RESEARCH ONLY — NOT INVESTMENT ADVICE. This terminal never places orders.",
      generatedAt,
    };
  });

export type OptionStrategyTerminalResponse = TerminalResponse;