// Phase 23 · Stage 1 — Shadow metrics (deterministic, pure).

import type {
  ShadowMetrics,
  ShadowObservation,
  ShadowPortfolioDecision,
} from "./shadow-types";

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

export function computeShadowMetrics(
  observations: readonly ShadowObservation[],
  portfolio: readonly ShadowPortfolioDecision[] = [],
): ShadowMetrics {
  const entered = observations.filter((o) => o.hypothetical !== null && o.outcome.resolved);
  const blocked = observations.filter((o) => o.hypothetical === null);
  const wins = entered.filter((o) => o.outcome.netAfterCosts > 0);
  const losses = entered.filter((o) => o.outcome.netAfterCosts < 0);
  const grossWin = wins.reduce((a, o) => a + o.outcome.netAfterCosts, 0);
  const grossLoss = Math.abs(losses.reduce((a, o) => a + o.outcome.netAfterCosts, 0));
  const totalPnl = entered.reduce((a, o) => a + o.outcome.netAfterCosts, 0);

  // Max drawdown across the sequence of net PnL.
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const o of entered) {
    equity += o.outcome.netAfterCosts;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }

  // Brier score & calibration: expected p = confidence; actual = 1 for win, 0 else.
  let brier = 0;
  let calibErr = 0;
  const highConf = entered.filter((o) => o.confidence >= 0.7);
  const lowConf = entered.filter((o) => o.confidence < 0.7);
  for (const o of entered) {
    const outcome = o.outcome.netAfterCosts > 0 ? 1 : 0;
    const p = o.confidence;
    brier += (p - outcome) ** 2;
    calibErr += Math.abs(p - outcome);
  }
  brier = safeDiv(brier, entered.length);
  calibErr = safeDiv(calibErr, entered.length);
  const highAcc = safeDiv(highConf.filter((o) => o.outcome.netAfterCosts > 0).length, highConf.length);
  const lowAcc = safeDiv(lowConf.filter((o) => o.outcome.netAfterCosts > 0).length, lowConf.length);

  const mfeAvg = safeDiv(entered.reduce((a, o) => a + o.outcome.mfe, 0), entered.length);
  const maeAvg = safeDiv(entered.reduce((a, o) => a + o.outcome.mae, 0), entered.length);
  const coverage = safeDiv(entered.length, observations.length);

  const capUtil = safeDiv(
    portfolio.reduce((a, p) => a + (p.included ? p.capitalUtilizationPct : 0), 0),
    portfolio.length,
  );
  const constraintBreaches = portfolio.reduce((a, p) => a + (p.hardGatePassed ? 0 : 1), 0);

  return {
    recommendationsObserved: observations.length,
    recommendationsBlocked: blocked.length,
    entries: entered.length,
    wins: wins.length,
    losses: losses.length,
    winRate: safeDiv(wins.length, entered.length),
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? Number.POSITIVE_INFINITY : 0) : grossWin / grossLoss,
    expectancy: safeDiv(totalPnl, entered.length),
    maxDrawdown: maxDd,
    mfeAvg,
    maeAvg,
    coverage,
    precision: safeDiv(wins.length, entered.length),
    recall: safeDiv(wins.length, observations.filter((o) => o.direction !== "WAIT").length),
    brier,
    calibrationError: calibErr,
    highConfidenceAccuracy: highAcc,
    lowConfidenceAccuracy: lowAcc,
    driftScore: 0,
    portfolioShadowReturn: totalPnl,
    portfolioShadowDrawdown: maxDd,
    capitalUtilization: capUtil,
    constraintBreaches,
  };
}

export function calibrationCurve(
  observations: readonly ShadowObservation[],
  buckets = 5,
): ReadonlyArray<{ bucket: number; expected: number; actual: number; count: number }> {
  const bins = Array.from({ length: buckets }, (_, i) => ({
    bucket: i,
    expected: 0,
    actual: 0,
    count: 0,
  }));
  const entered = observations.filter((o) => o.hypothetical !== null && o.outcome.resolved);
  for (const o of entered) {
    const idx = Math.min(buckets - 1, Math.floor(o.confidence * buckets));
    bins[idx].expected += o.confidence;
    bins[idx].actual += o.outcome.netAfterCosts > 0 ? 1 : 0;
    bins[idx].count += 1;
  }
  return bins.map((b) => ({
    bucket: b.bucket,
    expected: safeDiv(b.expected, b.count),
    actual: safeDiv(b.actual, b.count),
    count: b.count,
  }));
}