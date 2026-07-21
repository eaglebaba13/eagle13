// Phase 44B — Deterministic daily market-bias aggregator.
// Read-only. Never modifies or replaces the Decision Engine.

import type { BriefInstrument } from "./instruments";
import type { LevelBundle } from "./level-bundle";
import type { MacroRatioResult } from "./macro-ratio";

export type MarketBias =
  | "STRONG_BULLISH" | "BULLISH" | "NEUTRAL" | "BEARISH" | "STRONG_BEARISH" | "UNAVAILABLE";

export interface BiasInput {
  readonly instrument: BriefInstrument;
  readonly bundle: LevelBundle;
  readonly livePrice: number | null;
  readonly macro?: MacroRatioResult | null;
}

export interface BiasResult {
  readonly bias: MarketBias;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly conflictingInputs: readonly string[];
  readonly missingInputs: readonly string[];
  readonly dataCompleteness: number;
  readonly generatedAt: string;
}

export function computeMarketBias(input: BiasInput, now: number = Date.now()): BiasResult {
  const reasons: string[] = [];
  const missing: string[] = [];
  const conflicts: string[] = [];
  let score = 0;
  let checked = 0;
  let available = 0;

  const { bundle, livePrice, macro } = input;

  checked++;
  if (livePrice != null && bundle.freshness !== "UNAVAILABLE") {
    available++;
    if (livePrice > bundle.pivot.r1) { score += 2; reasons.push("Price above R1"); }
    else if (livePrice > bundle.pivot.pp) { score += 1; reasons.push("Price above PP"); }
    else if (livePrice < bundle.pivot.s1) { score -= 2; reasons.push("Price below S1"); }
    else if (livePrice < bundle.pivot.pp) { score -= 1; reasons.push("Price below PP"); }
    else reasons.push("Price at PP");
  } else {
    missing.push("live_price_vs_pivot");
  }

  checked++;
  if (bundle.gann.status !== "UNAVAILABLE" && livePrice != null && bundle.gann.up != null && bundle.gann.down != null) {
    available++;
    const mid = (bundle.gann.up + bundle.gann.down) / 2;
    if (livePrice > mid) { score += 1; reasons.push("Above Gann midline"); }
    else if (livePrice < mid) { score -= 1; reasons.push("Below Gann midline"); }
  } else {
    missing.push("gann_direction");
  }

  checked++;
  if (bundle.astro.status !== "UNAVAILABLE" && bundle.astro.levels.length > 0) {
    available++;
    const ups = bundle.astro.levels.filter((l) => l.direction === "UP").length;
    const downs = bundle.astro.levels.filter((l) => l.direction === "DOWN").length;
    if (ups > downs) { score += 1; reasons.push("Astro bias UP"); }
    else if (downs > ups) { score -= 1; reasons.push("Astro bias DOWN"); }
  } else {
    missing.push("astro_direction");
  }

  if (input.instrument.id === "XAUUSD" || input.instrument.id === "XAGUSD") {
    checked++;
    if (macro && macro.macroBias !== "UNAVAILABLE") {
      available++;
      const gold = macro.macroBias === "BUY_GOLD";
      const silver = macro.macroBias === "BUY_SILVER";
      if (input.instrument.id === "XAUUSD") {
        if (gold) { score += 1; reasons.push("Macro ratio favours gold"); }
        else if (silver) { score -= 1; reasons.push("Macro ratio favours silver"); }
      } else {
        if (silver) { score += 1; reasons.push("Macro ratio favours silver"); }
        else if (gold) { score -= 1; reasons.push("Macro ratio favours gold"); }
      }
    } else {
      missing.push("macro_ratio");
    }
  }

  const dataCompleteness = checked === 0 ? 0 : available / checked;
  const generatedAt = new Date(now).toISOString();

  if (dataCompleteness < 0.5 || bundle.freshness === "UNAVAILABLE") {
    return {
      bias: "UNAVAILABLE",
      confidence: 0,
      reasons: reasons.length ? reasons : ["Insufficient inputs for a directional bias."],
      conflictingInputs: conflicts,
      missingInputs: missing,
      dataCompleteness,
      generatedAt,
    };
  }

  let bias: MarketBias;
  if (score >= 3) bias = "STRONG_BULLISH";
  else if (score >= 1) bias = "BULLISH";
  else if (score <= -3) bias = "STRONG_BEARISH";
  else if (score <= -1) bias = "BEARISH";
  else bias = "NEUTRAL";

  const confidence = Math.round(Math.min(1, Math.max(0, Math.abs(score) / 5) * dataCompleteness) * 100);

  return { bias, confidence, reasons, conflictingInputs: conflicts, missingInputs: missing, dataCompleteness, generatedAt };
}