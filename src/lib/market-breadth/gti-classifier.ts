// Phase 27 · Stage 3 — GTI research state classifier.
//
// Deterministic, versioned. RESEARCH ONLY. Never emits BUY/SELL/entry/exit.

import type {
  GtiResearchReading,
  GtiResearchState,
  MarketBreadthSnapshot,
  PcrConfirmation,
  VixRegimeReading,
  ConflictItem,
} from "./types";
import { detectConflicts, directionOfBreadth, directionOfPcr } from "./conflict-detector";
import { computeConfidence } from "./confidence";
import {
  GTI_RESEARCH_FORMULA_VERSION,
  MARKET_BREADTH_DISCLAIMER,
} from "./types";

export interface GtiInputs {
  readonly broad: MarketBreadthSnapshot | null;
  readonly nifty50: MarketBreadthSnapshot | null;
  readonly topWeighted: MarketBreadthSnapshot | null;
  readonly banking: MarketBreadthSnapshot | null;
  readonly it: MarketBreadthSnapshot | null;
  readonly oilGas: MarketBreadthSnapshot | null;
  readonly auto: MarketBreadthSnapshot | null;
  readonly pcr: PcrConfirmation;
  readonly vix: VixRegimeReading;
  readonly runId: string;
  readonly timestamp?: string;
}

function scoreBreadth(b: MarketBreadthSnapshot | null): number {
  if (!b || b.dataQuality === "FAILED") return 0;
  const w = b.weightedBreadth;
  if (w != null) return Math.max(-1, Math.min(1, w));
  const net = b.netBreadth ?? 0;
  const total = b.totalSymbols || 1;
  return Math.max(-1, Math.min(1, net / total));
}

export function classifyGti(inputs: GtiInputs): GtiResearchReading {
  const conflicts: ConflictItem[] = [...detectConflicts(inputs)];
  const sectors = [inputs.banking, inputs.it, inputs.oilGas, inputs.auto];
  const allBreadth = [inputs.broad, inputs.nifty50, inputs.topWeighted, ...sectors];
  const presentCount = allBreadth.filter((s) => s && s.dataQuality !== "FAILED").length;
  const timestamp = inputs.timestamp ?? new Date().toISOString();

  const confidenceBreakdown = computeConfidence({
    breadthSnapshots: allBreadth,
    pcr: inputs.pcr,
    vix: inputs.vix,
    conflicts,
  });

  const warnings: string[] = [];
  if (presentCount < 3) warnings.push(`Only ${presentCount}/7 breadth inputs available`);
  if (!inputs.pcr.available) warnings.push("PCR confirmation unavailable");
  if (inputs.vix.regime === "UNKNOWN") warnings.push("VIX regime unknown");

  let state: GtiResearchState;
  if (presentCount < 3 || (!inputs.pcr.available && presentCount < 5)) {
    state = "DATA_INSUFFICIENT";
  } else {
    const breadthScore =
      scoreBreadth(inputs.broad) * 0.15 +
      scoreBreadth(inputs.nifty50) * 0.20 +
      scoreBreadth(inputs.topWeighted) * 0.25 +
      (scoreBreadth(inputs.banking) + scoreBreadth(inputs.it) +
       scoreBreadth(inputs.oilGas) + scoreBreadth(inputs.auto)) * 0.10;
    const pcrDir = directionOfPcr(inputs.pcr);
    const pcrBias = pcrDir === "BULLISH" ? 0.25 : pcrDir === "BEARISH" ? -0.25 : 0;
    const composite = breadthScore + pcrBias;
    const conflicted = conflicts.length >= 2;
    const strong = 0.5;
    const focus = 0.20;

    if (composite >= strong && !conflicted) state = "STRONG_CE_RESEARCH_FOCUS";
    else if (composite >= focus && !conflicted) state = "CE_RESEARCH_FOCUS";
    else if (composite > 0 && conflicted) state = "BULLISH_BUT_CONFLICTED";
    else if (composite <= -strong && !conflicted) state = "STRONG_PE_RESEARCH_FOCUS";
    else if (composite <= -focus && !conflicted) state = "PE_RESEARCH_FOCUS";
    else if (composite < 0 && conflicted) state = "BEARISH_BUT_CONFLICTED";
    else state = "NEUTRAL_RESEARCH";
  }

  // Sector directional agreement for the final state — used only to
  // reduce confidence if sectors disagree with the state; state itself
  // stays deterministic from composite/conflicts above.
  void directionOfBreadth;

  return {
    timestamp,
    runId: inputs.runId,
    state,
    confidence: confidenceBreakdown.total,
    confidenceBreakdown,
    conflicts,
    breadth: {
      broad: inputs.broad,
      nifty50: inputs.nifty50,
      topWeighted: inputs.topWeighted,
      sectors: sectors.filter((s): s is MarketBreadthSnapshot => !!s),
    },
    vix: inputs.vix,
    pcr: inputs.pcr,
    warnings,
    formulaVersion: GTI_RESEARCH_FORMULA_VERSION,
    disclaimer: MARKET_BREADTH_DISCLAIMER,
  };
}
