// Phase 44C — Institutional Probability Engine. Independent analytical layer.
// Does NOT replace the Decision Engine.
import type { ProbabilityInputs, ProbabilityResult } from "./types";

const WEIGHTS = {
  bias: 25, macro: 15, sector: 15, global: 15,
  vix: 10, breadth: 10, pcr: 5, news: 5,
};

export function computeInstitutionalProbability(input: ProbabilityInputs): ProbabilityResult {
  const reasons: string[] = [];
  const missing: string[] = [];
  const conflicts: string[] = [];
  let bull = 0;
  let bear = 0;

  if (input.institutionalBias) {
    const map: Record<string, number> = { STRONG_BUY: 1, BUY: 0.6, NEUTRAL: 0, SELL: -0.6, STRONG_SELL: -1 };
    const v = map[input.institutionalBias] ?? 0;
    if (v > 0) bull += WEIGHTS.bias * v; else if (v < 0) bear += WEIGHTS.bias * -v;
    reasons.push(`Institutional bias ${input.institutionalBias}`);
  } else missing.push("institutionalBias");

  if (input.macroRisk) {
    if (input.macroRisk === "HIGH") { bear += WEIGHTS.macro * 0.9; reasons.push("Macro risk HIGH"); }
    else if (input.macroRisk === "MEDIUM") bear += WEIGHTS.macro * 0.4;
    else bull += WEIGHTS.macro * 0.4;
  } else missing.push("macroRisk");

  if (input.sectorRotationScore != null) {
    const v = Math.max(-1, Math.min(1, input.sectorRotationScore / 100));
    if (v > 0) bull += WEIGHTS.sector * v; else if (v < 0) bear += WEIGHTS.sector * -v;
  } else missing.push("sectorRotationScore");

  if (input.globalCompositeBiasPct != null) {
    const v = Math.max(-1, Math.min(1, input.globalCompositeBiasPct));
    if (v > 0) bull += WEIGHTS.global * v; else if (v < 0) bear += WEIGHTS.global * -v;
  } else missing.push("globalCompositeBiasPct");

  if (input.vix != null) {
    if (input.vix >= 20) { bear += WEIGHTS.vix * 0.8; reasons.push(`VIX elevated (${input.vix.toFixed(1)})`); }
    else if (input.vix <= 12) bull += WEIGHTS.vix * 0.6;
  } else missing.push("vix");

  if (input.breadthAdvanceDeclinePct != null) {
    const v = Math.max(-1, Math.min(1, input.breadthAdvanceDeclinePct));
    if (v > 0) bull += WEIGHTS.breadth * v; else if (v < 0) bear += WEIGHTS.breadth * -v;
  } else missing.push("breadthAdvanceDeclinePct");

  if (input.pcr != null) {
    if (input.pcr >= 1.3) bull += WEIGHTS.pcr * 0.8;
    else if (input.pcr <= 0.7) bear += WEIGHTS.pcr * 0.8;
  } else missing.push("pcr");

  const posNews = input.highImpactPositiveNews ?? 0;
  const negNews = input.highImpactNegativeNews ?? 0;
  if (posNews || negNews) {
    const net = Math.max(-3, Math.min(3, posNews - negNews)) / 3;
    if (net > 0) bull += WEIGHTS.news * net; else if (net < 0) bear += WEIGHTS.news * -net;
  }

  if (input.institutionalBias?.includes("BUY") && input.macroRisk === "HIGH") {
    conflicts.push("Institutional buying against HIGH macro risk");
  }
  if (input.globalCompositeBiasPct != null && input.institutionalBias) {
    const dirBias = input.institutionalBias.includes("BUY") ? 1 : input.institutionalBias.includes("SELL") ? -1 : 0;
    if (dirBias && Math.sign(input.globalCompositeBiasPct) && dirBias !== Math.sign(input.globalCompositeBiasPct)) {
      conflicts.push("Institutional bias diverges from global markets");
    }
  }

  const total = bull + bear;
  const denom = Object.values(WEIGHTS).reduce((s, x) => s + x, 0);
  const usable = denom - missing.reduce((s, k) => {
    const w: Record<string, number> = {
      institutionalBias: WEIGHTS.bias, macroRisk: WEIGHTS.macro,
      sectorRotationScore: WEIGHTS.sector, globalCompositeBiasPct: WEIGHTS.global,
      vix: WEIGHTS.vix, breadthAdvanceDeclinePct: WEIGHTS.breadth, pcr: WEIGHTS.pcr,
    };
    return s + (w[k] ?? 0);
  }, 0);
  const bullishPct = total > 0 ? Math.round((bull / total) * 100) : 50;
  const bearishPct = 100 - bullishPct;
  const coverage = denom > 0 ? Math.max(0, usable) / denom : 0;
  const conflictPenalty = Math.min(0.3, conflicts.length * 0.15);
  const confidence = Math.max(0, Math.min(1, coverage * (1 - conflictPenalty)));
  return { bullishPct, bearishPct, confidence, reasons, missing, conflicts };
}