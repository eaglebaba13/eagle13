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
    const [decisionRes, gtiRes, gapRes] = await Promise.allSettled([
      getDecisionSnapshot(),
      getGtiSummary(),
      getGannGapOutlook(),
    ]);

    const decision = decisionRes.status === "fulfilled" ? decisionRes.value : null;
    const gti = gtiRes.status === "fulfilled" ? gtiRes.value : null;
    const gap = gapRes.status === "fulfilled" ? gapRes.value : null;

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

    const sources = [decision ? "LIVE" : null, gti?.source, gap?.source].filter(
      Boolean,
    ) as string[];
    let source: TerminalResponse["source"] = "UNAVAILABLE";
    if (sources.includes("LIVE")) source = "LIVE";
    else if (sources.includes("MIXED")) source = "MIXED";
    else if (sources.includes("RESEARCH_DEMO")) source = "RESEARCH_DEMO";

    return {
      signals,
      engine,
      evidence: {
        decision: {
          available: !!decision,
          action: decision?.decision.action ?? "UNAVAILABLE",
          regime: decision?.decision.regime ?? "UNAVAILABLE",
          confidence: decisionConfidence,
        },
        pcr: {
          available: !!pcrC?.present,
          state: decision?.inputs.pcrCombined.direction ?? "UNAVAILABLE",
          direction: decision?.inputs.pcrCombined.direction ?? "UNAVAILABLE",
          score: decision?.inputs.pcrCombined.combinedScore ?? null,
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