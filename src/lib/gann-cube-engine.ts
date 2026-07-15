// Phase 21.2 · Layer 4 — Cube Setup Engine.
//
// Deterministic multi-signal gate. Combines Astro level, star direction,
// pivot confluence, and optional confirmations (retrograde, aspect, price
// action, EMA, RSI, exact-360, Sun/Moon). Spec §23.

import type { RankedLevel } from "./gann-level-ranking";

export type StarBias = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";
export type BinaryBias = "ALIGNED" | "CONFLICT" | "UNKNOWN";

export type CubeInputs = {
  level: RankedLevel;
  starBias: StarBias;
  retrograde?: BinaryBias;
  aspect?: BinaryBias;
  priceAction?: BinaryBias;
  ema13?: BinaryBias;
  rsi14?: BinaryBias;
};

export type CubeGrade = "A" | "B" | "C" | "NONE";
export type CubeAction =
  | "BUY"
  | "SELL"
  | "WAIT"
  | "NO_TRADE_CONFLICT"
  | "MISSED_ENTRY";

export type CubeResult = {
  conditionsAvailable: number;
  conditionsAligned: number;
  conditionsConflicting: number;
  mandatoryPassed: boolean;
  cubeGrade: CubeGrade;
  action: CubeAction;
  reasons: string[];
};

function starAligns(level: RankedLevel, star: StarBias): BinaryBias {
  if (star === "UNKNOWN" || star === "NEUTRAL") return "UNKNOWN";
  if (level.tradeBias === "BUY") {
    return star === "BULLISH" ? "ALIGNED" : "CONFLICT";
  }
  if (level.tradeBias === "SELL") {
    return star === "BEARISH" ? "ALIGNED" : "CONFLICT";
  }
  return "UNKNOWN";
}

export function evaluateCube(inputs: CubeInputs): CubeResult {
  const reasons: string[] = [];
  const level = inputs.level;

  // Mandatory: Astro level confirmed (side + safety) + Star aligned + Pivot aligned.
  const astroOk = level.side !== "NEUTRAL";
  const star = starAligns(level, inputs.starBias);
  const pivotOk = level.pivotConfluence !== "NONE";
  const mandatoryPassed = astroOk && star === "ALIGNED" && pivotOk;

  if (!astroOk) reasons.push("Astro level is neutral");
  if (star !== "ALIGNED") reasons.push(`Star not aligned (${star})`);
  if (!pivotOk) reasons.push("Pivot confluence missing");

  const optional: Array<BinaryBias | undefined> = [
    inputs.retrograde,
    inputs.aspect,
    inputs.priceAction,
    inputs.ema13,
    inputs.rsi14,
  ];
  let available = 3; // mandatory three
  let aligned = 0;
  let conflicting = 0;
  if (astroOk) aligned++;
  if (star === "ALIGNED") aligned++;
  else if (star === "CONFLICT") conflicting++;
  if (pivotOk) aligned++;

  for (const o of optional) {
    if (!o || o === "UNKNOWN") continue;
    available++;
    if (o === "ALIGNED") aligned++;
    else conflicting++;
  }
  if (level.exact360Confluence) {
    available++;
    aligned++;
    reasons.push("Exact-360 confluence");
  }
  if (level.sunMoonPriority) {
    available++;
    aligned++;
    reasons.push("Sun/Moon priority");
  }

  let action: CubeAction;
  let cubeGrade: CubeGrade;
  if (!mandatoryPassed) {
    action = conflicting > 0 ? "NO_TRADE_CONFLICT" : "WAIT";
    cubeGrade = "NONE";
  } else if (aligned >= 5 && conflicting === 0) {
    action = level.tradeBias;
    cubeGrade = "A";
  } else if (aligned >= 4 && conflicting === 0) {
    action = level.tradeBias;
    cubeGrade = "B";
  } else if (aligned >= 3 && conflicting === 0) {
    action = level.tradeBias;
    cubeGrade = "C";
  } else {
    action = "NO_TRADE_CONFLICT";
    cubeGrade = "NONE";
  }

  return {
    conditionsAvailable: available,
    conditionsAligned: aligned,
    conditionsConflicting: conflicting,
    mandatoryPassed,
    cubeGrade,
    action,
    reasons,
  };
}