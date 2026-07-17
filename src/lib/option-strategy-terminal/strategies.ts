// Phase 3A — Strategy catalogue + deterministic scoring.
// Pure. No formulas. Never invents signals — takes direction+regime as input.

import type {
  DirectionResult,
  ScoredStrategy,
  StrategyEngineInput,
  StrategyEngineOutput,
  StrategyProfile,
  VixRegime,
  StrikeRegime,
} from "./types";
import { classifyVixRegime, recommendStrikeRegime } from "./strike-regime";
import { mergeDirection } from "./direction";

export const STRATEGY_CATALOGUE: readonly StrategyProfile[] = [
  { key: "BUY_CE", label: "Buy Call (CE)", legs: 1, bias: "BULL", volatilityStance: "LONG_VOL", capital: "LOW", risk: "LOW", reward: "UNLIMITED", complexity: "SIMPLE", preferredVix: ["LOW", "MID"], preferredStrikeRegime: ["ITM", "ATM"], summary: "Long call, defined risk, unlimited upside." },
  { key: "BUY_PE", label: "Buy Put (PE)", legs: 1, bias: "BEAR", volatilityStance: "LONG_VOL", capital: "LOW", risk: "LOW", reward: "HIGH", complexity: "SIMPLE", preferredVix: ["LOW", "MID"], preferredStrikeRegime: ["ITM", "ATM"], summary: "Long put, defined risk, high downside profit potential." },
  { key: "SELL_CE", label: "Sell Call (CE)", legs: 1, bias: "BEAR", volatilityStance: "SHORT_VOL", capital: "HIGH", risk: "UNLIMITED", reward: "LOW", complexity: "MODERATE", preferredVix: ["MID", "HIGH"], preferredStrikeRegime: ["OTM"], summary: "Short call, premium collection, unlimited risk." },
  { key: "SELL_PE", label: "Sell Put (PE)", legs: 1, bias: "BULL", volatilityStance: "SHORT_VOL", capital: "HIGH", risk: "HIGH", reward: "LOW", complexity: "MODERATE", preferredVix: ["MID", "HIGH"], preferredStrikeRegime: ["OTM"], summary: "Short put, premium collection, defined-but-large risk." },
  { key: "BULL_CALL_SPREAD", label: "Bull Call Spread", legs: 2, bias: "BULL", volatilityStance: "LONG_VOL", capital: "LOW", risk: "LOW", reward: "MEDIUM", complexity: "MODERATE", preferredVix: ["LOW", "MID"], preferredStrikeRegime: ["ATM", "ITM"], summary: "Long CE + short higher CE; capped reward, low cost." },
  { key: "BEAR_PUT_SPREAD", label: "Bear Put Spread", legs: 2, bias: "BEAR", volatilityStance: "LONG_VOL", capital: "LOW", risk: "LOW", reward: "MEDIUM", complexity: "MODERATE", preferredVix: ["LOW", "MID"], preferredStrikeRegime: ["ATM", "ITM"], summary: "Long PE + short lower PE; capped reward, low cost." },
  { key: "BULL_PUT_SPREAD", label: "Bull Put Spread", legs: 2, bias: "BULL", volatilityStance: "SHORT_VOL", capital: "MEDIUM", risk: "MEDIUM", reward: "LOW", complexity: "MODERATE", preferredVix: ["MID", "HIGH"], preferredStrikeRegime: ["OTM"], summary: "Credit spread favouring an up/sideways move." },
  { key: "BEAR_CALL_SPREAD", label: "Bear Call Spread", legs: 2, bias: "BEAR", volatilityStance: "SHORT_VOL", capital: "MEDIUM", risk: "MEDIUM", reward: "LOW", complexity: "MODERATE", preferredVix: ["MID", "HIGH"], preferredStrikeRegime: ["OTM"], summary: "Credit spread favouring a down/sideways move." },
  { key: "LONG_STRADDLE", label: "Long Straddle", legs: 2, bias: "VOL_LONG", volatilityStance: "LONG_VOL", capital: "MEDIUM", risk: "MEDIUM", reward: "UNLIMITED", complexity: "MODERATE", preferredVix: ["LOW"], preferredStrikeRegime: ["ATM"], summary: "ATM CE + ATM PE; profits on a large move either way." },
  { key: "SHORT_STRADDLE", label: "Short Straddle", legs: 2, bias: "VOL_SHORT", volatilityStance: "SHORT_VOL", capital: "HIGH", risk: "UNLIMITED", reward: "MEDIUM", complexity: "ADVANCED", preferredVix: ["HIGH"], preferredStrikeRegime: ["ATM"], summary: "Sell ATM CE + PE; profits on range-bound expiry." },
  { key: "LONG_STRANGLE", label: "Long Strangle", legs: 2, bias: "VOL_LONG", volatilityStance: "LONG_VOL", capital: "LOW", risk: "LOW", reward: "UNLIMITED", complexity: "MODERATE", preferredVix: ["LOW"], preferredStrikeRegime: ["OTM"], summary: "OTM CE + OTM PE; cheap tail-event long-vol bet." },
  { key: "SHORT_STRANGLE", label: "Short Strangle", legs: 2, bias: "VOL_SHORT", volatilityStance: "SHORT_VOL", capital: "HIGH", risk: "UNLIMITED", reward: "MEDIUM", complexity: "ADVANCED", preferredVix: ["HIGH"], preferredStrikeRegime: ["OTM"], summary: "Short OTM CE + PE; range-bound premium harvest." },
  { key: "IRON_CONDOR", label: "Iron Condor", legs: 4, bias: "NEUTRAL", volatilityStance: "SHORT_VOL", capital: "MEDIUM", risk: "MEDIUM", reward: "LOW", complexity: "ADVANCED", preferredVix: ["MID", "HIGH"], preferredStrikeRegime: ["OTM"], summary: "Two vertical credit spreads; range-bound trades." },
  { key: "IRON_FLY", label: "Iron Fly", legs: 4, bias: "NEUTRAL", volatilityStance: "SHORT_VOL", capital: "MEDIUM", risk: "MEDIUM", reward: "MEDIUM", complexity: "ADVANCED", preferredVix: ["HIGH"], preferredStrikeRegime: ["ATM"], summary: "ATM short straddle + protective wings." },
  { key: "CALENDAR_SPREAD", label: "Calendar Spread", legs: 2, bias: "NEUTRAL", volatilityStance: "LONG_VOL", capital: "MEDIUM", risk: "MEDIUM", reward: "MEDIUM", complexity: "ADVANCED", preferredVix: ["LOW", "MID"], preferredStrikeRegime: ["ATM"], summary: "Sell near-expiry, buy far-expiry same strike." },
  { key: "DIAGONAL_SPREAD", label: "Diagonal Spread", legs: 2, bias: "BULL", volatilityStance: "LONG_VOL", capital: "MEDIUM", risk: "MEDIUM", reward: "MEDIUM", complexity: "ADVANCED", preferredVix: ["LOW", "MID"], preferredStrikeRegime: ["ATM", "OTM"], summary: "Different strike + different expiry; directional-vol tilt." },
  { key: "RATIO_SPREAD", label: "Ratio Spread", legs: 3, bias: "BULL", volatilityStance: "SHORT_VOL", capital: "HIGH", risk: "HIGH", reward: "MEDIUM", complexity: "ADVANCED", preferredVix: ["MID"], preferredStrikeRegime: ["OTM"], summary: "Unequal leg count; directional with vol overlay." },
  { key: "BUTTERFLY", label: "Butterfly", legs: 3, bias: "NEUTRAL", volatilityStance: "SHORT_VOL", capital: "LOW", risk: "LOW", reward: "MEDIUM", complexity: "ADVANCED", preferredVix: ["MID"], preferredStrikeRegime: ["ATM"], summary: "Cheap pin-strike, low-risk range bet." },
  { key: "BROKEN_WING_BUTTERFLY", label: "Broken-Wing Butterfly", legs: 3, bias: "BULL", volatilityStance: "SHORT_VOL", capital: "LOW", risk: "MEDIUM", reward: "MEDIUM", complexity: "ADVANCED", preferredVix: ["MID"], preferredStrikeRegime: ["ATM", "OTM"], summary: "Skewed butterfly with directional bias." },
  { key: "JADE_LIZARD", label: "Jade Lizard", legs: 3, bias: "BULL", volatilityStance: "SHORT_VOL", capital: "HIGH", risk: "HIGH", reward: "MEDIUM", complexity: "ADVANCED", preferredVix: ["MID", "HIGH"], preferredStrikeRegime: ["OTM"], summary: "Short put + short call spread; no upside risk." },
];

// Direction "propensity" per strategy — used to derive bullish/bearish/neutral scores.
function propensity(p: StrategyProfile): { bull: number; bear: number; neu: number } {
  switch (p.bias) {
    case "BULL": return { bull: 90, bear: 5, neu: 20 };
    case "BEAR": return { bull: 5, bear: 90, neu: 20 };
    case "NEUTRAL": return { bull: 30, bear: 30, neu: 90 };
    case "VOL_LONG": return { bull: 55, bear: 55, neu: 25 };
    case "VOL_SHORT": return { bull: 45, bear: 45, neu: 80 };
  }
}

function alignmentFor(profile: StrategyProfile, direction: DirectionResult): number {
  const p = propensity(profile);
  switch (direction.bias) {
    case "BULLISH": return p.bull;
    case "BEARISH": return p.bear;
    case "NEUTRAL": return p.neu;
    case "CONFLICT": return Math.min(p.bull, p.bear); // conservative
    case "UNAVAILABLE": return 0;
  }
}

function regimeBonus(profile: StrategyProfile, regime: VixRegime): number {
  if (regime === "UNKNOWN") return 0;
  return profile.preferredVix.includes(regime) ? 8 : -6;
}
function strikeBonus(profile: StrategyProfile, strike: StrikeRegime): number {
  if (strike === "UNKNOWN") return 0;
  return profile.preferredStrikeRegime.includes(strike) ? 4 : -2;
}

export function scoreStrategies(
  direction: DirectionResult,
  vixRegime: VixRegime,
  strikeRegime: StrikeRegime,
): readonly ScoredStrategy[] {
  const out: ScoredStrategy[] = [];
  for (const profile of STRATEGY_CATALOGUE) {
    const align = alignmentFor(profile, direction);
    const rBonus = regimeBonus(profile, vixRegime);
    const sBonus = strikeBonus(profile, strikeRegime);
    const alignmentPct = Math.max(0, Math.min(100, align + rBonus + sBonus));
    // Confidence penalty
    const confFactor = direction.confidence / 100;
    const overall = Math.round(alignmentPct * (0.5 + 0.5 * confFactor));
    const p = propensity(profile);
    const rationale: string[] = [];
    const warnings: string[] = [];
    if (direction.bias !== "UNAVAILABLE" && direction.bias !== "CONFLICT") {
      rationale.push(`Direction ${direction.bias.toLowerCase()} (confidence ${direction.confidence}%).`);
    } else {
      warnings.push(`Direction ${direction.bias.toLowerCase()} — recommendation suppressed.`);
    }
    if (vixRegime !== "UNKNOWN") {
      rationale.push(profile.preferredVix.includes(vixRegime)
        ? `Suits ${vixRegime}-VIX regime.`
        : `Not preferred in ${vixRegime}-VIX regime.`);
    }
    if (strikeRegime !== "UNKNOWN") {
      rationale.push(profile.preferredStrikeRegime.includes(strikeRegime)
        ? `Preferred strike regime ${strikeRegime} matches VIX rule.`
        : `Preferred strike regime ${strikeRegime} not ideal.`);
    }
    if (profile.risk === "UNLIMITED") warnings.push("Unlimited-risk profile — capital-heavy.");
    const recommended =
      direction.bias !== "UNAVAILABLE" &&
      direction.bias !== "CONFLICT" &&
      alignmentPct >= 60 &&
      direction.confidence >= 30;
    out.push({
      profile,
      alignmentPct: Math.round(alignmentPct),
      overallPct: overall,
      bullishScore: p.bull,
      bearishScore: p.bear,
      neutralScore: p.neu,
      rationale,
      warnings,
      recommended,
    });
  }
  return out.sort((a, b) => b.overallPct - a.overallPct);
}

export function runStrategyEngine(input: StrategyEngineInput): StrategyEngineOutput {
  const direction = mergeDirection(input.signals);
  const vixRegime = classifyVixRegime(input.vix);
  const strikeRegime = recommendStrikeRegime(input.vix);
  const strategies = scoreStrategies(direction, vixRegime, strikeRegime);
  const recommended = strategies.filter((s) => s.recommended).slice(0, 3);
  const reasons: string[] = [];
  if (direction.bias === "UNAVAILABLE") reasons.push("No canonical signals available — recommendations suppressed.");
  else if (direction.bias === "CONFLICT") reasons.push("Canonical signals conflict — recommendations suppressed.");
  if (vixRegime === "UNKNOWN") reasons.push("India VIX unavailable — strike-regime rule bypassed.");
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    direction,
    vix: input.vix,
    vixRegime,
    strikeRegime,
    strategies,
    recommended,
    explanation: "", // filled by explanation.ts
    researchOnly: true,
    reasons,
  };
}