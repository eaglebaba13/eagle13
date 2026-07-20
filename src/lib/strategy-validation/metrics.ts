// Phase 29 · Performance & breakdown metrics — deterministic, pure.

import type {
  ConfidenceBucketRow,
  ContributionRow,
  DecisionBreakdownRow,
  FailureRow,
  JournalEntry,
  PerformanceMetrics,
  RegimeBreakdownRow,
  ReplayResult,
  StrikeBreakdownRow,
  VixBreakdownRow,
} from "./types";
import { CONFIDENCE_BUCKETS, MIN_SAMPLE_SIZE } from "./types";
import type { DecisionAction } from "@/lib/option-strategy-decision/types";

function r(x: number, d = 2): number {
  const m = 10 ** d;
  return Math.round(x * m) / m;
}

function isTrade(r: ReplayResult): boolean {
  return r.outcome === "WIN" || r.outcome === "LOSS";
}

function avg(nums: readonly number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdev(nums: readonly number[]): number {
  if (nums.length < 2) return 0;
  const m = avg(nums);
  const v = nums.reduce((a, b) => a + (b - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

export function computePerformance(results: readonly ReplayResult[]): PerformanceMetrics {
  const trades = results.filter(isTrade);
  const wins = trades.filter((t) => t.outcome === "WIN");
  const losses = trades.filter((t) => t.outcome === "LOSS");
  const skipped = results.length - trades.length;
  const winReturns = wins.map((w) => w.returnPct);
  const lossReturns = losses.map((l) => l.returnPct);
  const totalWins = winReturns.reduce((a, b) => a + b, 0);
  const totalLoss = Math.abs(lossReturns.reduce((a, b) => a + b, 0));
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const avgWinner = avg(winReturns);
  const avgLoser = avg(lossReturns);
  const profitFactor = totalLoss > 0 ? totalWins / totalLoss : totalWins > 0 ? Infinity : null;
  const expectancy = trades.length
    ? (winRate / 100) * avgWinner + (1 - winRate / 100) * avgLoser
    : 0;

  // Drawdown from cumulative return series (trades only)
  let peak = 0;
  let cum = 0;
  let maxDD = 0;
  for (const t of trades) {
    cum += t.returnPct;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  const totalReturn = trades.reduce((a, b) => a + b.returnPct, 0);
  const recoveryFactor = maxDD > 0 ? totalReturn / maxDD : null;
  const sd = stdev(trades.map((t) => t.returnPct));
  const sharpe = trades.length >= 2 && sd > 0 ? (avg(trades.map((t) => t.returnPct)) / sd) * Math.sqrt(trades.length) : null;

  return {
    totalTrades: trades.length,
    winning: wins.length,
    losing: losses.length,
    skipped,
    winRate: r(winRate),
    avgWinner: r(avgWinner, 3),
    avgLoser: r(avgLoser, 3),
    profitFactor: profitFactor == null ? null : Number.isFinite(profitFactor) ? r(profitFactor, 2) : profitFactor,
    expectancy: r(expectancy, 3),
    maxDrawdown: r(maxDD, 3),
    recoveryFactor: recoveryFactor == null ? null : r(recoveryFactor, 2),
    sharpe: sharpe == null ? null : r(sharpe, 2),
    sampleSize: results.length,
    lowSample: results.length < MIN_SAMPLE_SIZE,
  };
}

export function decisionBreakdown(results: readonly ReplayResult[]): DecisionBreakdownRow[] {
  const actions: DecisionAction[] = ["BUY_CALL", "BUY_PUT", "WAIT", "NO_TRADE"];
  return actions.map((a) => {
    const rows = results.filter((r) => r.action === a);
    const trades = rows.filter(isTrade);
    const wins = trades.filter((t) => t.outcome === "WIN").length;
    const rets = rows.map((r) => r.returnPct);
    return {
      action: a,
      trades: rows.length,
      winRate: trades.length ? r(( wins / trades.length) * 100) : 0,
      avgReturn: r(avg(rets), 3),
      maxGain: rets.length ? r(Math.max(...rets), 3) : 0,
      maxLoss: rets.length ? r(Math.min(...rets), 3) : 0,
    };
  });
}

export function regimeBreakdown(results: readonly ReplayResult[]): RegimeBreakdownRow[] {
  const map = new Map<string, ReplayResult[]>();
  for (const r of results) {
    if (!map.has(r.regime)) map.set(r.regime, []);
    map.get(r.regime)!.push(r);
  }
  const rows: RegimeBreakdownRow[] = [];
  for (const [regime, list] of map) {
    const trades = list.filter(isTrade);
    const wins = trades.filter((t) => t.outcome === "WIN").length;
    const losses = trades.filter((t) => t.outcome === "LOSS").length;
    rows.push({
      regime: regime as RegimeBreakdownRow["regime"],
      trades: trades.length,
      wins,
      losses,
      winRate: trades.length ? r((wins / trades.length) * 100) : 0,
      avgReturn: r(avg(list.map((x) => x.returnPct)), 3),
    });
  }
  return rows.sort((a, b) => b.trades - a.trades);
}

function vixBucketOf(v: number | null): VixBreakdownRow["bucket"] {
  if (v == null) return "UNKNOWN";
  if (v < 15) return "LT_15";
  if (v < 20) return "B15_20";
  if (v < 25) return "B20_25";
  return "GT_25";
}

export function vixBreakdown(results: readonly ReplayResult[]): VixBreakdownRow[] {
  const buckets: VixBreakdownRow["bucket"][] = ["LT_15", "B15_20", "B20_25", "GT_25", "UNKNOWN"];
  return buckets.map((b) => {
    const rows = results.filter((res) => vixBucketFromRegime(res) === b);
    const trades = rows.filter(isTrade);
    const wins = trades.filter((t) => t.outcome === "WIN").length;
    return {
      bucket: b,
      signals: rows.length,
      winRate: trades.length ? r((wins / trades.length) * 100) : 0,
      avgReturn: r(avg(rows.map((x) => x.returnPct)), 3),
      avgHoldingBars: r(avg(rows.map((x) => x.holdingBars)), 2),
    };
  });
}

// Helper kept intentionally simple; VIX is exposed via decision.vixRegime.
function vixBucketFromRegime(r: ReplayResult): VixBreakdownRow["bucket"] {
  switch (r.decision.vixRegime) {
    case "LOW":
      return "LT_15";
    case "MEDIUM":
      return "B15_20";
    case "ELEVATED":
      return "B20_25";
    case "HIGH":
      return "GT_25";
    default:
      return "UNKNOWN";
  }
}

function _unused_vixBucketOf(v: number | null): VixBreakdownRow["bucket"] {
  return vixBucketOf(v);
}

export function strikeBreakdown(results: readonly ReplayResult[]): StrikeBreakdownRow[] {
  const keys: StrikeBreakdownRow["moneyness"][] = ["ATM", "ITM", "OTM", "UNKNOWN"];
  return keys.map((k) => {
    const rows = results.filter((r) => (r.moneyness ?? "UNKNOWN") === k);
    const trades = rows.filter(isTrade);
    const wins = trades.filter((t) => t.outcome === "WIN").length;
    return {
      moneyness: k,
      trades: rows.length,
      winRate: trades.length ? r((wins / trades.length) * 100) : 0,
      avgPremiumMovePct: r(avg(rows.map((x) => x.returnPct)), 3),
      avgHoldingBars: r(avg(rows.map((x) => x.holdingBars)), 2),
    };
  });
}

export function confidenceCalibration(results: readonly ReplayResult[]): ConfidenceBucketRow[] {
  return CONFIDENCE_BUCKETS.map((b) => {
    const rows = results.filter((r) => r.confidence >= b.min && r.confidence < b.max);
    const trades = rows.filter(isTrade);
    const wins = trades.filter((t) => t.outcome === "WIN").length;
    return {
      bucket: b.label,
      min: b.min,
      max: b.max,
      trades: trades.length,
      actualWinRate: trades.length ? r((wins / trades.length) * 100) : 0,
      lowSample: trades.length < MIN_SAMPLE_SIZE,
    };
  });
}

/**
 * Engine contribution — for each indicator key, measures how often its bias
 * agreed with the final decision and the historical win-rate on those agreements.
 */
export function engineContribution(results: readonly ReplayResult[]): ContributionRow[] {
  const keys = ["pcr", "sector", "breadth", "oi", "vix", "maxPain"] as const;
  const trades = results.filter(isTrade);
  const rows: ContributionRow[] = [];
  for (const key of keys) {
    let agree = 0;
    let considered = 0;
    let contribSum = 0;
    let weightSum = 0;
    let agreeWins = 0;
    for (const t of trades) {
      const ind = t.decision.indicators.find((i) => i.key === key);
      if (!ind || !ind.available) continue;
      considered++;
      contribSum += Math.max(ind.bullContribution, ind.bearContribution);
      weightSum += ind.weight * 100;
      const bullDir = t.action === "BUY_CALL";
      const bearDir = t.action === "BUY_PUT";
      const agreed = (bullDir && ind.bias === "BULLISH") || (bearDir && ind.bias === "BEARISH");
      if (agreed) {
        agree++;
        if (t.outcome === "WIN") agreeWins++;
      }
    }
    rows.push({
      key,
      label: key.toUpperCase(),
      agreementPct: considered ? r((agree / considered) * 100) : 0,
      contributionPct: weightSum > 0 ? r((contribSum / weightSum) * 100) : 0,
      historicalWinRate: agree ? r((agreeWins / agree) * 100) : 0,
      sample: considered,
      lowSample: considered < MIN_SAMPLE_SIZE,
    });
  }
  // Non-scored engines (Institutional Flow, Price Confirmation, VWAP) — reported as UNAVAILABLE contribution.
  for (const extra of [
    { key: "institutionalFlow", label: "INSTITUTIONAL FLOW" },
    { key: "priceConfirmation", label: "PRICE CONFIRMATION" },
    { key: "vwap", label: "VWAP" },
  ]) {
    rows.push({
      key: extra.key,
      label: extra.label,
      agreementPct: 0,
      contributionPct: 0,
      historicalWinRate: 0,
      sample: 0,
      lowSample: true,
    });
  }
  return rows;
}

export function failureAnalysis(results: readonly ReplayResult[]): FailureRow[] {
  const losses = results.filter((r) => r.outcome === "LOSS");
  const counts = new Map<string, number>();
  for (const l of losses) {
    const c = l.failure ?? "UNKNOWN";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const total = losses.length;
  const rows: FailureRow[] = [];
  for (const [category, count] of counts) {
    rows.push({
      category: category as FailureRow["category"],
      count,
      frequencyPct: total ? r((count / total) * 100) : 0,
    });
  }
  return rows.sort((a, b) => b.count - a.count);
}

export function buildJournal(results: readonly ReplayResult[]): JournalEntry[] {
  return results.map((r) => ({
    timestamp: r.timestamp,
    action: r.action,
    confidence: r.confidence,
    bullScore: r.bullScore,
    bearScore: r.bearScore,
    checklist: r.decision.indicators.map(
      (i) => `${i.label}: ${i.available ? i.bias : "UNAVAILABLE"}`,
    ),
    reasoning: r.decision.reasoning,
    outcome: r.outcome,
    returnPct: r.returnPct,
    holdingBars: r.holdingBars,
  }));
}