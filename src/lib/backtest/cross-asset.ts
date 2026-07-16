// Phase 21.7 · Cross-Asset Validation Lab — pure aggregation over
// HistoricalBacktestResult snapshots. Consumes results produced by the
// existing runUnifiedBacktest / runHistoricalCore pipeline. Never fetches
// data, never mutates inputs, never changes Run IDs or exports.

import type { HistoricalBacktestResult, HistoricalTrade } from "./result";

export type CrossAssetMetric =
  | "trades"
  | "winRate"
  | "profitFactor"
  | "expectancy"
  | "netPnl"
  | "maxDrawdown"
  | "recoveryFactor"
  | "stability"
  | "robustness"
  | "monteCarloP5"
  | "walkForwardOos"
  | "consistency";

export const CROSS_ASSET_INSTRUMENTS = [
  "NIFTY50",
  "BANKNIFTY",
  "XAUUSD",
  "BTC",
  "CRUDEOIL",
  "NATURALGAS",
] as const;

export const CROSS_ASSET_TIMEFRAMES = ["1m", "3m", "5m", "15m", "1d"] as const;

export type CrossAssetInstrument = (typeof CROSS_ASSET_INSTRUMENTS)[number];
export type CrossAssetTimeframe = (typeof CROSS_ASSET_TIMEFRAMES)[number];

export const MIN_SAMPLE_FOR_RANKING = 30;

export type CrossAssetInput = {
  readonly instrument: string;
  readonly timeframe: string;
  readonly strategy: string;
  readonly formula: string;
  readonly regime?: string;
  readonly result: HistoricalBacktestResult;
  /** Optional extras — never fabricated when absent. */
  readonly stabilityScore?: number;
  readonly robustnessScore?: number;
  readonly monteCarloP5?: number;
  readonly walkForwardOos?: number;
  readonly recoveryFactor?: number;
};

export type CrossAssetRow = {
  readonly instrument: string;
  readonly timeframe: string;
  readonly strategy: string;
  readonly formula: string;
  readonly regime: string | null;
  readonly runId: string;
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly profitFactor: number;
  readonly expectancy: number;
  readonly netPnl: number;
  readonly maxDrawdown: number;
  readonly recoveryFactor: number | null;
  readonly stability: number | null;
  readonly robustness: number | null;
  readonly monteCarloP5: number | null;
  readonly walkForwardOos: number | null;
  readonly sufficient: boolean;
};

function decided(trades: readonly HistoricalTrade[]): HistoricalTrade[] {
  return trades.filter((t) => t.outcome === "WIN" || t.outcome === "LOSS" || t.outcome === "FLAT");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildCrossAssetRow(input: CrossAssetInput): CrossAssetRow {
  const t = input.result.trades;
  const d = decided(t);
  const wins = d.filter((x) => x.pnl > 0);
  const losses = d.filter((x) => x.pnl < 0);
  const grossWin = wins.reduce((a, b) => a + b.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b.pnl, 0));
  const netPnl = d.reduce((a, b) => a + b.pnl, 0);
  const winRate = d.length ? (wins.length / d.length) * 100 : 0;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const expectancy = round2(((wins.length / Math.max(d.length, 1))) * avgWin -
    ((losses.length / Math.max(d.length, 1))) * avgLoss);
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;
  const maxDd = input.result.drawdown?.max ?? 0;
  const recovery = input.recoveryFactor ?? (maxDd > 0 ? netPnl / maxDd : netPnl > 0 ? 999 : 0);
  return {
    instrument: input.instrument,
    timeframe: input.timeframe,
    strategy: input.strategy,
    formula: input.formula,
    regime: input.regime ?? null,
    runId: input.result.runId,
    trades: t.length,
    wins: wins.length,
    losses: losses.length,
    winRate: round2(winRate),
    profitFactor: round2(pf),
    expectancy,
    netPnl: round2(netPnl),
    maxDrawdown: round2(maxDd),
    recoveryFactor: round2(recovery),
    stability: input.stabilityScore ?? null,
    robustness: input.robustnessScore ?? null,
    monteCarloP5: input.monteCarloP5 ?? null,
    walkForwardOos: input.walkForwardOos ?? null,
    sufficient: d.length >= MIN_SAMPLE_FOR_RANKING,
  };
}

// -------------------------------------------------------------------------
// Matrix builders

export type Matrix<TKey extends string = string> = {
  readonly rowKeys: readonly string[];
  readonly colKeys: readonly string[];
  readonly cells: Readonly<Record<string, Readonly<Record<string, CrossAssetRow | null>>>>;
  readonly metric: CrossAssetMetric | null;
  readonly kind: TKey;
};

function emptyGrid(rowKeys: string[], colKeys: string[]): Record<string, Record<string, CrossAssetRow | null>> {
  const out: Record<string, Record<string, CrossAssetRow | null>> = {};
  for (const r of rowKeys) {
    out[r] = {};
    for (const c of colKeys) out[r][c] = null;
  }
  return out;
}

export function buildInstrumentStrategyMatrix(rows: readonly CrossAssetRow[]): Matrix<"instrument-x-strategy"> {
  const instruments = Array.from(new Set(rows.map((r) => r.instrument))).sort();
  const strategies = Array.from(new Set(rows.map((r) => r.strategy))).sort();
  const cells = emptyGrid(instruments, strategies);
  for (const r of rows) cells[r.instrument][r.strategy] = r;
  return { rowKeys: instruments, colKeys: strategies, cells, metric: null, kind: "instrument-x-strategy" };
}

export function buildInstrumentTimeframeMatrix(rows: readonly CrossAssetRow[]): Matrix<"instrument-x-timeframe"> {
  const instruments = Array.from(new Set(rows.map((r) => r.instrument))).sort();
  const timeframes = Array.from(new Set(rows.map((r) => r.timeframe))).sort();
  const cells = emptyGrid(instruments, timeframes);
  for (const r of rows) cells[r.instrument][r.timeframe] = r;
  return { rowKeys: instruments, colKeys: timeframes, cells, metric: null, kind: "instrument-x-timeframe" };
}

export function buildRegimeStrategyMatrix(rows: readonly CrossAssetRow[]): Matrix<"regime-x-strategy"> {
  const regimes = Array.from(new Set(rows.map((r) => r.regime ?? "UNKNOWN"))).sort();
  const strategies = Array.from(new Set(rows.map((r) => r.strategy))).sort();
  const cells = emptyGrid(regimes, strategies);
  for (const r of rows) cells[r.regime ?? "UNKNOWN"][r.strategy] = r;
  return { rowKeys: regimes, colKeys: strategies, cells, metric: null, kind: "regime-x-strategy" };
}

export function buildRegimeTimeframeMatrix(rows: readonly CrossAssetRow[]): Matrix<"regime-x-timeframe"> {
  const regimes = Array.from(new Set(rows.map((r) => r.regime ?? "UNKNOWN"))).sort();
  const timeframes = Array.from(new Set(rows.map((r) => r.timeframe))).sort();
  const cells = emptyGrid(regimes, timeframes);
  for (const r of rows) cells[r.regime ?? "UNKNOWN"][r.timeframe] = r;
  return { rowKeys: regimes, colKeys: timeframes, cells, metric: null, kind: "regime-x-timeframe" };
}

// -------------------------------------------------------------------------
// Consistency score

export type ConsistencyBreakdown = {
  readonly crossAsset: number;
  readonly crossTimeframe: number;
  readonly crossRegime: number;
  readonly walkForward: number;
  readonly monteCarlo: number;
  readonly sensitivity: number;
  readonly robustness: number;
  readonly sample: number;
  readonly recovery: number;
  readonly drawdown: number;
};

export type ConsistencyScore = {
  readonly score: number;
  readonly breakdown: ConsistencyBreakdown;
  readonly weights: Readonly<Record<keyof ConsistencyBreakdown, number>>;
  readonly formula: string;
};

const CONSISTENCY_WEIGHTS: Readonly<Record<keyof ConsistencyBreakdown, number>> = Object.freeze({
  crossAsset: 0.15,
  crossTimeframe: 0.10,
  crossRegime: 0.15,
  walkForward: 0.15,
  monteCarlo: 0.10,
  sensitivity: 0.10,
  robustness: 0.10,
  sample: 0.05,
  recovery: 0.05,
  drawdown: 0.05,
});

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Score 0..100 from a list of scalar values — higher agreement → higher score. */
function agreementScore(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return clean.length === 1 ? 50 : 0;
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  if (mean === 0) return 0;
  const sd = stdev(clean);
  const cv = Math.abs(sd / (Math.abs(mean) || 1));
  return Math.max(0, Math.min(100, 100 - cv * 100));
}

export function computeConsistencyScore(input: {
  readonly strategy: string;
  readonly rows: readonly CrossAssetRow[];
  readonly walkForwardOos?: number | null;
  readonly monteCarloP5?: number | null;
  readonly sensitivityStability?: number | null;
  readonly robustness?: number | null;
}): ConsistencyScore {
  const same = input.rows.filter((r) => r.strategy === input.strategy && r.sufficient);
  const pfByInstrument = new Map<string, number[]>();
  const pfByTimeframe = new Map<string, number[]>();
  const pfByRegime = new Map<string, number[]>();
  for (const r of same) {
    if (!pfByInstrument.has(r.instrument)) pfByInstrument.set(r.instrument, []);
    pfByInstrument.get(r.instrument)!.push(r.profitFactor);
    if (!pfByTimeframe.has(r.timeframe)) pfByTimeframe.set(r.timeframe, []);
    pfByTimeframe.get(r.timeframe)!.push(r.profitFactor);
    const rk = r.regime ?? "UNKNOWN";
    if (!pfByRegime.has(rk)) pfByRegime.set(rk, []);
    pfByRegime.get(rk)!.push(r.profitFactor);
  }
  const crossAsset = agreementScore([...pfByInstrument.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length));
  const crossTimeframe = agreementScore([...pfByTimeframe.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length));
  const crossRegime = agreementScore([...pfByRegime.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length));

  const walkForward = input.walkForwardOos == null ? 0 : Math.max(0, Math.min(100, input.walkForwardOos));
  const monteCarlo = input.monteCarloP5 == null ? 0
    : input.monteCarloP5 > 0 ? Math.min(100, 50 + input.monteCarloP5 / 10) : Math.max(0, 50 + input.monteCarloP5 / 10);
  const sensitivity = input.sensitivityStability == null ? 0 : Math.max(0, Math.min(100, input.sensitivityStability));
  const robustness = input.robustness == null ? 0 : Math.max(0, Math.min(100, input.robustness));

  const totalTrades = same.reduce((a, r) => a + r.trades, 0);
  const sample = totalTrades >= 500 ? 100 : totalTrades >= 200 ? 80 : totalTrades >= 100 ? 60 : totalTrades >= 30 ? 40 : 0;

  const meanRecovery = same.length
    ? same.reduce((a, r) => a + (r.recoveryFactor ?? 0), 0) / same.length
    : 0;
  const recovery = Math.max(0, Math.min(100, meanRecovery * 20));

  const meanDd = same.length ? same.reduce((a, r) => a + r.maxDrawdown, 0) / same.length : 0;
  const meanPnl = same.length ? same.reduce((a, r) => a + r.netPnl, 0) / same.length : 0;
  const ddRatio = meanPnl > 0 && meanDd > 0 ? Math.min(1, meanPnl / (meanDd * 3)) : 0;
  const drawdown = Math.max(0, Math.min(100, ddRatio * 100));

  const breakdown: ConsistencyBreakdown = {
    crossAsset: round2(crossAsset),
    crossTimeframe: round2(crossTimeframe),
    crossRegime: round2(crossRegime),
    walkForward: round2(walkForward),
    monteCarlo: round2(monteCarlo),
    sensitivity: round2(sensitivity),
    robustness: round2(robustness),
    sample: round2(sample),
    recovery: round2(recovery),
    drawdown: round2(drawdown),
  };
  const score = round2(
    (Object.keys(CONSISTENCY_WEIGHTS) as (keyof ConsistencyBreakdown)[])
      .reduce((a, k) => a + breakdown[k] * CONSISTENCY_WEIGHTS[k], 0),
  );
  const formula =
    "score = Σ weight_k × factor_k where factors ∈ {crossAsset,crossTimeframe,crossRegime,walkForward,monteCarlo,sensitivity,robustness,sample,recovery,drawdown} and weights sum to 1.00.";
  return { score, breakdown, weights: CONSISTENCY_WEIGHTS, formula };
}

// -------------------------------------------------------------------------
// Leaderboard

export type LeaderboardCategory =
  | "BEST_STRATEGY"
  | "BEST_FORMULA"
  | "BEST_INSTRUMENT"
  | "BEST_TIMEFRAME"
  | "BEST_REGIME"
  | "BEST_STABILITY"
  | "BEST_ROBUSTNESS"
  | "BEST_WALK_FORWARD"
  | "BEST_MONTE_CARLO"
  | "BEST_RECOVERY"
  | "WORST_DRAWDOWN"
  | "LARGEST_SAMPLE";

export type LeaderboardEntry = {
  readonly category: LeaderboardCategory;
  readonly winner: string | null;
  readonly value: number | null;
  readonly metric: string;
  readonly reason: string;
};

function groupBy<K extends string>(rows: readonly CrossAssetRow[], pick: (r: CrossAssetRow) => K): Map<K, CrossAssetRow[]> {
  const out = new Map<K, CrossAssetRow[]>();
  for (const r of rows) {
    const k = pick(r);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(r);
  }
  return out;
}

function pickBest<T>(items: readonly T[], score: (t: T) => number | null): { winner: T; value: number } | null {
  let best: { winner: T; value: number } | null = null;
  for (const it of items) {
    const s = score(it);
    if (s == null || !Number.isFinite(s)) continue;
    if (best == null || s > best.value) best = { winner: it, value: s };
  }
  return best;
}

function pickWorst<T>(items: readonly T[], score: (t: T) => number | null): { winner: T; value: number } | null {
  let worst: { winner: T; value: number } | null = null;
  for (const it of items) {
    const s = score(it);
    if (s == null || !Number.isFinite(s)) continue;
    if (worst == null || s > worst.value) worst = { winner: it, value: s };
  }
  return worst;
}

function meanBy<T>(xs: readonly T[], f: (t: T) => number): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + f(b), 0) / xs.length;
}

export function buildLeaderboard(rows: readonly CrossAssetRow[]): LeaderboardEntry[] {
  const eligible = rows.filter((r) => r.sufficient);
  const out: LeaderboardEntry[] = [];

  const byStrategy = groupBy(eligible, (r) => r.strategy);
  const bestStrategy = pickBest([...byStrategy.entries()], ([, rs]) => meanBy(rs, (r) => r.profitFactor));
  out.push({
    category: "BEST_STRATEGY",
    winner: bestStrategy?.winner[0] ?? null,
    value: bestStrategy ? round2(bestStrategy.value) : null,
    metric: "mean profitFactor across instruments",
    reason: bestStrategy ? `highest mean PF ${round2(bestStrategy.value)}` : "insufficient sample",
  });

  const byFormula = groupBy(eligible, (r) => r.formula);
  const bestFormula = pickBest([...byFormula.entries()], ([, rs]) => meanBy(rs, (r) => r.expectancy));
  out.push({
    category: "BEST_FORMULA",
    winner: bestFormula?.winner[0] ?? null,
    value: bestFormula ? round2(bestFormula.value) : null,
    metric: "mean expectancy",
    reason: bestFormula ? `highest mean expectancy ${round2(bestFormula.value)}` : "insufficient sample",
  });

  const byInstrument = groupBy(eligible, (r) => r.instrument);
  const bestInstrument = pickBest([...byInstrument.entries()], ([, rs]) => meanBy(rs, (r) => r.netPnl));
  out.push({
    category: "BEST_INSTRUMENT",
    winner: bestInstrument?.winner[0] ?? null,
    value: bestInstrument ? round2(bestInstrument.value) : null,
    metric: "mean netPnl",
    reason: bestInstrument ? `highest mean net PnL ${round2(bestInstrument.value)}` : "insufficient sample",
  });

  const byTimeframe = groupBy(eligible, (r) => r.timeframe);
  const bestTimeframe = pickBest([...byTimeframe.entries()], ([, rs]) => meanBy(rs, (r) => r.profitFactor));
  out.push({
    category: "BEST_TIMEFRAME",
    winner: bestTimeframe?.winner[0] ?? null,
    value: bestTimeframe ? round2(bestTimeframe.value) : null,
    metric: "mean profitFactor",
    reason: bestTimeframe ? `highest mean PF ${round2(bestTimeframe.value)}` : "insufficient sample",
  });

  const byRegime = groupBy(eligible.filter((r) => r.regime), (r) => r.regime as string);
  const bestRegime = pickBest([...byRegime.entries()], ([, rs]) => meanBy(rs, (r) => r.expectancy));
  out.push({
    category: "BEST_REGIME",
    winner: bestRegime?.winner[0] ?? null,
    value: bestRegime ? round2(bestRegime.value) : null,
    metric: "mean expectancy per regime",
    reason: bestRegime ? `regime with best expectancy ${round2(bestRegime.value)}` : "no regime-tagged rows",
  });

  const bestStab = pickBest(eligible, (r) => r.stability);
  out.push({
    category: "BEST_STABILITY",
    winner: bestStab ? `${bestStab.winner.strategy}/${bestStab.winner.instrument}` : null,
    value: bestStab ? round2(bestStab.value) : null,
    metric: "stability score",
    reason: bestStab ? "highest stability score" : "no stability data",
  });

  const bestRob = pickBest(eligible, (r) => r.robustness);
  out.push({
    category: "BEST_ROBUSTNESS",
    winner: bestRob ? `${bestRob.winner.strategy}/${bestRob.winner.instrument}` : null,
    value: bestRob ? round2(bestRob.value) : null,
    metric: "robustness score",
    reason: bestRob ? "highest robustness score" : "no robustness data",
  });

  const bestWf = pickBest(eligible, (r) => r.walkForwardOos);
  out.push({
    category: "BEST_WALK_FORWARD",
    winner: bestWf ? `${bestWf.winner.strategy}/${bestWf.winner.instrument}` : null,
    value: bestWf ? round2(bestWf.value) : null,
    metric: "walk-forward OOS",
    reason: bestWf ? "highest walk-forward OOS" : "no walk-forward data",
  });

  const bestMc = pickBest(eligible, (r) => r.monteCarloP5);
  out.push({
    category: "BEST_MONTE_CARLO",
    winner: bestMc ? `${bestMc.winner.strategy}/${bestMc.winner.instrument}` : null,
    value: bestMc ? round2(bestMc.value) : null,
    metric: "Monte Carlo P5",
    reason: bestMc ? "highest MC P5 (least tail risk)" : "no Monte Carlo data",
  });

  const bestRec = pickBest(eligible, (r) => r.recoveryFactor);
  out.push({
    category: "BEST_RECOVERY",
    winner: bestRec ? `${bestRec.winner.strategy}/${bestRec.winner.instrument}` : null,
    value: bestRec ? round2(bestRec.value) : null,
    metric: "recovery factor",
    reason: bestRec ? "highest recovery factor" : "insufficient data",
  });

  const worstDd = pickWorst(eligible, (r) => r.maxDrawdown);
  out.push({
    category: "WORST_DRAWDOWN",
    winner: worstDd ? `${worstDd.winner.strategy}/${worstDd.winner.instrument}` : null,
    value: worstDd ? round2(worstDd.value) : null,
    metric: "max drawdown",
    reason: worstDd ? "largest observed drawdown" : "no eligible rows",
  });

  const largest = pickBest(rows, (r) => r.trades);
  out.push({
    category: "LARGEST_SAMPLE",
    winner: largest ? `${largest.winner.strategy}/${largest.winner.instrument}` : null,
    value: largest ? largest.value : null,
    metric: "trade count",
    reason: largest ? "largest sample size" : "no rows",
  });

  return out;
}

// -------------------------------------------------------------------------
// Research summary

export type CrossAssetSummary = {
  readonly bestEnvironment: string | null;
  readonly worstEnvironment: string | null;
  readonly bestInstrument: string | null;
  readonly weakInstrument: string | null;
  readonly bestTimeframe: string | null;
  readonly weakTimeframe: string | null;
  readonly bestRegime: string | null;
  readonly worstRegime: string | null;
  readonly highestConfidenceStrategy: string | null;
  readonly leastStableStrategy: string | null;
  readonly reasons: Readonly<Record<string, string>>;
};

export function buildResearchSummary(rows: readonly CrossAssetRow[]): CrossAssetSummary {
  const eligible = rows.filter((r) => r.sufficient);
  const reasons: Record<string, string> = {};
  const rank = (
    groupKey: (r: CrossAssetRow) => string,
    metric: (r: CrossAssetRow) => number,
  ): { best: string | null; worst: string | null; bestVal: number; worstVal: number } => {
    const g = groupBy(eligible, groupKey);
    let best: [string, number] | null = null;
    let worst: [string, number] | null = null;
    for (const [k, rs] of g) {
      const v = meanBy(rs, metric);
      if (best == null || v > best[1]) best = [k, v];
      if (worst == null || v < worst[1]) worst = [k, v];
    }
    return {
      best: best?.[0] ?? null,
      worst: worst?.[0] ?? null,
      bestVal: best?.[1] ?? 0,
      worstVal: worst?.[1] ?? 0,
    };
  };

  const inst = rank((r) => r.instrument, (r) => r.expectancy);
  reasons.bestInstrument = `highest mean expectancy ${round2(inst.bestVal)}`;
  reasons.weakInstrument = `lowest mean expectancy ${round2(inst.worstVal)}`;

  const tf = rank((r) => r.timeframe, (r) => r.profitFactor);
  reasons.bestTimeframe = `highest mean profitFactor ${round2(tf.bestVal)}`;
  reasons.weakTimeframe = `lowest mean profitFactor ${round2(tf.worstVal)}`;

  const reg = rank((r) => r.regime ?? "UNKNOWN", (r) => r.expectancy);
  reasons.bestRegime = `regime with best mean expectancy ${round2(reg.bestVal)}`;
  reasons.worstRegime = `regime with worst mean expectancy ${round2(reg.worstVal)}`;

  // Environment = instrument/timeframe/regime tuple
  const envKey = (r: CrossAssetRow) => `${r.instrument}·${r.timeframe}·${r.regime ?? "UNKNOWN"}`;
  const env = rank(envKey, (r) => r.expectancy);
  reasons.bestEnvironment = `env highest mean expectancy ${round2(env.bestVal)}`;
  reasons.worstEnvironment = `env lowest mean expectancy ${round2(env.worstVal)}`;

  const byStrategy = groupBy(eligible, (r) => r.strategy);
  let highConf: [string, number] | null = null;
  let leastStable: [string, number] | null = null;
  for (const [k, rs] of byStrategy) {
    const meanRob = meanBy(rs.filter((r) => r.robustness != null), (r) => r.robustness ?? 0);
    const meanStab = meanBy(rs.filter((r) => r.stability != null), (r) => r.stability ?? 0);
    const confidence = meanRob + meanStab;
    if (highConf == null || confidence > highConf[1]) highConf = [k, confidence];
    // "least stable" = lowest stability score
    if (leastStable == null || meanStab < leastStable[1]) leastStable = [k, meanStab];
  }
  reasons.highestConfidenceStrategy = highConf ? `robustness+stability=${round2(highConf[1])}` : "insufficient signals";
  reasons.leastStableStrategy = leastStable ? `mean stability=${round2(leastStable[1])}` : "insufficient signals";

  return {
    bestEnvironment: env.best,
    worstEnvironment: env.worst,
    bestInstrument: inst.best,
    weakInstrument: inst.worst,
    bestTimeframe: tf.best,
    weakTimeframe: tf.worst,
    bestRegime: reg.best,
    worstRegime: reg.worst,
    highestConfidenceStrategy: highConf?.[0] ?? null,
    leastStableStrategy: leastStable?.[0] ?? null,
    reasons,
  };
}

// -------------------------------------------------------------------------
// Heatmap builder

export type HeatmapCell = { readonly row: string; readonly col: string; readonly value: number | null };
export type Heatmap = {
  readonly metric: CrossAssetMetric;
  readonly rowKeys: readonly string[];
  readonly colKeys: readonly string[];
  readonly cells: readonly HeatmapCell[];
  readonly min: number;
  readonly max: number;
};

function metricOf(row: CrossAssetRow, metric: CrossAssetMetric): number | null {
  switch (metric) {
    case "trades": return row.trades;
    case "winRate": return row.winRate;
    case "profitFactor": return row.profitFactor;
    case "expectancy": return row.expectancy;
    case "netPnl": return row.netPnl;
    case "maxDrawdown": return row.maxDrawdown;
    case "recoveryFactor": return row.recoveryFactor;
    case "stability": return row.stability;
    case "robustness": return row.robustness;
    case "monteCarloP5": return row.monteCarloP5;
    case "walkForwardOos": return row.walkForwardOos;
    case "consistency": return null; // computed separately
  }
}

export function buildHeatmap<K extends string>(
  matrix: Matrix<K>,
  metric: CrossAssetMetric,
): Heatmap {
  const cells: HeatmapCell[] = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const r of matrix.rowKeys) {
    for (const c of matrix.colKeys) {
      const row = matrix.cells[r][c];
      const v = row ? metricOf(row, metric) : null;
      if (v != null && Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      cells.push({ row: r, col: c, value: v == null || !Number.isFinite(v) ? null : v });
    }
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return { metric, rowKeys: matrix.rowKeys, colKeys: matrix.colKeys, cells, min, max };
}

// -------------------------------------------------------------------------
// Exports

function csvEscape(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type CrossAssetExportProvenance = {
  readonly researchRunId: string;
  readonly generatedAt: string;
  readonly engineVersion: string;
};

export function buildCrossAssetCsv(
  rows: readonly CrossAssetRow[],
  provenance: CrossAssetExportProvenance,
): string {
  const header = [
    "researchRunId", "generatedAt", "engineVersion",
    "instrument", "timeframe", "strategy", "formula", "regime", "runId",
    "trades", "wins", "losses", "winRate", "profitFactor", "expectancy",
    "netPnl", "maxDrawdown", "recoveryFactor",
    "stability", "robustness", "monteCarloP5", "walkForwardOos", "sufficient",
  ].join(",");
  const body = rows.map((r) => [
    csvEscape(provenance.researchRunId),
    csvEscape(provenance.generatedAt),
    csvEscape(provenance.engineVersion),
    csvEscape(r.instrument), csvEscape(r.timeframe), csvEscape(r.strategy),
    csvEscape(r.formula), csvEscape(r.regime), csvEscape(r.runId),
    r.trades, r.wins, r.losses, r.winRate, r.profitFactor, r.expectancy,
    r.netPnl, r.maxDrawdown, r.recoveryFactor ?? "",
    r.stability ?? "", r.robustness ?? "", r.monteCarloP5 ?? "", r.walkForwardOos ?? "",
    r.sufficient ? "yes" : "no",
  ].join(","));
  return [header, ...body].join("\n");
}

export function buildCrossAssetJson(
  rows: readonly CrossAssetRow[],
  provenance: CrossAssetExportProvenance,
  extras?: {
    leaderboard?: readonly LeaderboardEntry[];
    summary?: CrossAssetSummary;
    consistency?: Readonly<Record<string, ConsistencyScore>>;
  },
): string {
  return JSON.stringify({
    provenance,
    rows,
    leaderboard: extras?.leaderboard ?? null,
    summary: extras?.summary ?? null,
    consistency: extras?.consistency ?? null,
  }, null, 2);
}

export const CROSS_ASSET_ENGINE_VERSION = "CROSS_ASSET_V1";