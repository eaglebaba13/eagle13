// Phase 21.4 · Stage 4C — Hybrid quality analytics.
// Pure. Combines hybrid adapter diagnostics with three-way attribution
// buckets to produce transparent quality rates. Every formula is exported
// as a human-readable string for the UI.

import type { ThreeWayAttribution } from "./attribution";

export type HybridDecisionCounters = {
  BUY: number;
  SELL: number;
  WAIT: number;
  CONFLICT: number;
  DATA_INCOMPLETE: number;
  FORMULA_MISMATCH: number;
};

export type HybridQualityMetrics = {
  totalDecisions: number;
  agreementRate: number;
  conflictRate: number;
  waitRate: number;
  dataIncompleteRate: number;
  formulaMismatchRate: number;
  hybridConversionRate: number;
  winnerRetentionRate: number;
  loserFilteringRate: number;
  missedWinnerRate: number;
  falseAgreementRate: number;
};

export const HYBRID_QUALITY_FORMULAS = Object.freeze({
  agreementRate: "(BUY + SELL) / totalDecisions",
  conflictRate: "CONFLICT / totalDecisions",
  waitRate: "WAIT / totalDecisions",
  dataIncompleteRate: "DATA_INCOMPLETE / totalDecisions",
  formulaMismatchRate: "FORMULA_MISMATCH / totalDecisions",
  hybridConversionRate: "hybridTradeCount / (BUY + SELL)",
  winnerRetentionRate:
    "keptWinners / (keptWinners + missedWinners)",
  loserFilteringRate:
    "filteredLosers / (filteredLosers + keptLosers)",
  missedWinnerRate:
    "missedWinners / (keptWinners + missedWinners)",
  falseAgreementRate:
    "keptLosers / (keptWinners + keptLosers)",
});

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 10000) / 100;
}

export function computeHybridQuality(
  counters: HybridDecisionCounters,
  hybridTradeCount: number,
  attribution: ThreeWayAttribution,
): HybridQualityMetrics {
  const total =
    counters.BUY +
    counters.SELL +
    counters.WAIT +
    counters.CONFLICT +
    counters.DATA_INCOMPLETE +
    counters.FORMULA_MISMATCH;
  const agreements = counters.BUY + counters.SELL;

  const keptWinners =
    attribution.HYBRID_KEPT_ASTRO_WINNER.count +
    attribution.HYBRID_KEPT_SMC_WINNER.count;
  const keptLosers =
    attribution.HYBRID_KEPT_ASTRO_LOSER.count +
    attribution.HYBRID_KEPT_SMC_LOSER.count;
  const filteredLosers =
    attribution.HYBRID_FILTERED_ASTRO_LOSER.count +
    attribution.HYBRID_FILTERED_SMC_LOSER.count;
  const missedWinners =
    attribution.HYBRID_MISSED_ASTRO_WINNER.count +
    attribution.HYBRID_MISSED_SMC_WINNER.count;

  return {
    totalDecisions: total,
    agreementRate: pct(agreements, total),
    conflictRate: pct(counters.CONFLICT, total),
    waitRate: pct(counters.WAIT, total),
    dataIncompleteRate: pct(counters.DATA_INCOMPLETE, total),
    formulaMismatchRate: pct(counters.FORMULA_MISMATCH, total),
    hybridConversionRate: pct(hybridTradeCount, agreements),
    winnerRetentionRate: pct(keptWinners, keptWinners + missedWinners),
    loserFilteringRate: pct(filteredLosers, filteredLosers + keptLosers),
    missedWinnerRate: pct(missedWinners, keptWinners + missedWinners),
    falseAgreementRate: pct(keptLosers, keptWinners + keptLosers),
  };
}