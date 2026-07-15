// Phase 21.6 · Stage 1 — Monte Carlo robustness engine.
// Pure & deterministic: same seed + same trades ⇒ same output. Never mutates
// input trades, never touches production formulas, adapters, cache keys,
// engines, run-ids, or exports.

export type MonteCarloSamplingMode =
  | "SHUFFLE"
  | "BOOTSTRAP"
  | "BLOCK_BOOTSTRAP"
  | "PERTURB";

export type MonteCarloTrade = { readonly pnl: number };

export type RuinThreshold =
  | { kind: "DRAWDOWN_PCT"; value: number } // 0..1
  | { kind: "CAPITAL_FLOOR"; value: number };

export type MonteCarloConfig = {
  readonly seed: number;
  readonly simulations: number;
  readonly startingCapital: number;
  readonly samplingMode: MonteCarloSamplingMode;
  readonly blockSize?: number; // BLOCK_BOOTSTRAP; default 5
  readonly perturbPct?: number; // PERTURB fraction 0..1; default 0.1
  readonly ruin?: RuinThreshold; // default 20% drawdown
};

export type MonteCarloPercentiles = {
  readonly p5: number;
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly p95: number;
};

export type MonteCarloResult = {
  readonly version: "MONTE_CARLO_V1";
  readonly seed: number;
  readonly simulations: number;
  readonly samplingMode: MonteCarloSamplingMode;
  readonly startingCapital: number;
  readonly ruin: RuinThreshold;
  readonly ruinFormula: string;
  readonly probabilityOfLoss: number; // finalEquity < startingCapital
  readonly probabilityOfRuin: number;
  readonly finalEquity: MonteCarloPercentiles;
  readonly maxDrawdown: MonteCarloPercentiles;
  readonly profitFactor: MonteCarloPercentiles;
  readonly expectancy: MonteCarloPercentiles;
  readonly percentileEquityCurves: {
    readonly p5: readonly number[];
    readonly p50: readonly number[];
    readonly p95: readonly number[];
  };
  readonly worstPath: readonly number[];
  readonly medianPath: readonly number[];
  readonly bestPath: readonly number[];
  readonly tradeCount: number;
  readonly assumptions: readonly string[];
};

// -- Deterministic PRNG (mulberry32). Pure function of seed state.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx];
}
function pctile5(values: number[]): MonteCarloPercentiles {
  const s = [...values].sort((a, b) => a - b);
  return { p5: percentile(s, 0.05), p25: percentile(s, 0.25), p50: percentile(s, 0.5), p75: percentile(s, 0.75), p95: percentile(s, 0.95) };
}

function samplePath(trades: readonly MonteCarloTrade[], rng: () => number, mode: MonteCarloSamplingMode, blockSize: number, perturbPct: number): number[] {
  const n = trades.length;
  const out = new Array<number>(n);
  if (mode === "SHUFFLE") {
    const idx = trades.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    for (let i = 0; i < n; i++) out[i] = trades[idx[i]].pnl;
    return out;
  }
  if (mode === "BOOTSTRAP") {
    for (let i = 0; i < n; i++) out[i] = trades[Math.floor(rng() * n)].pnl;
    return out;
  }
  if (mode === "BLOCK_BOOTSTRAP") {
    const bs = Math.max(1, blockSize);
    let i = 0;
    while (i < n) {
      const start = Math.floor(rng() * n);
      for (let k = 0; k < bs && i < n; k++, i++) out[i] = trades[(start + k) % n].pnl;
    }
    return out;
  }
  // PERTURB — keep magnitudes, flip sign of a random fraction.
  const flips = Math.floor(n * perturbPct);
  for (let i = 0; i < n; i++) out[i] = trades[i].pnl;
  for (let k = 0; k < flips; k++) {
    const j = Math.floor(rng() * n);
    out[j] = -out[j];
  }
  return out;
}

function pathMetrics(startingCapital: number, pnls: readonly number[]) {
  const path = new Array<number>(pnls.length + 1);
  path[0] = startingCapital;
  let eq = startingCapital;
  let peak = startingCapital;
  let maxDD = 0;
  let maxDDPct = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  for (let i = 0; i < pnls.length; i++) {
    eq += pnls[i];
    path[i + 1] = eq;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDD) maxDD = dd;
    const ddPct = peak > 0 ? dd / peak : 0;
    if (ddPct > maxDDPct) maxDDPct = ddPct;
    if (pnls[i] > 0) { grossWin += pnls[i]; wins++; }
    else if (pnls[i] < 0) { grossLoss += -pnls[i]; losses++; }
  }
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Number.POSITIVE_INFINITY : 0;
  const total = wins + losses;
  const expectancy = total > 0 ? (eq - startingCapital) / total : 0;
  return { path, finalEquity: eq, maxDD, maxDDPct, profitFactor, expectancy };
}

function ruinFormulaText(ruin: RuinThreshold): string {
  if (ruin.kind === "DRAWDOWN_PCT") return `path.maxDrawdownPct >= ${(ruin.value * 100).toFixed(1)}%`;
  return `min(path.equity) <= ${ruin.value}`;
}

export function runMonteCarlo(trades: readonly MonteCarloTrade[], cfg: MonteCarloConfig): MonteCarloResult {
  const ruin: RuinThreshold = cfg.ruin ?? { kind: "DRAWDOWN_PCT", value: 0.2 };
  const startingCapital = cfg.startingCapital;
  const n = trades.length;
  if (n === 0 || cfg.simulations <= 0) {
    const zero = { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 };
    return {
      version: "MONTE_CARLO_V1",
      seed: cfg.seed, simulations: cfg.simulations, samplingMode: cfg.samplingMode,
      startingCapital, ruin, ruinFormula: ruinFormulaText(ruin),
      probabilityOfLoss: 0, probabilityOfRuin: 0,
      finalEquity: zero, maxDrawdown: zero, profitFactor: zero, expectancy: zero,
      percentileEquityCurves: { p5: [startingCapital], p50: [startingCapital], p95: [startingCapital] },
      worstPath: [startingCapital], medianPath: [startingCapital], bestPath: [startingCapital],
      tradeCount: 0,
      assumptions: ["INSUFFICIENT_DATA: no trades supplied"],
    };
  }
  const rng = mulberry32(cfg.seed);
  const bs = cfg.blockSize ?? 5;
  const pp = cfg.perturbPct ?? 0.1;
  const paths: number[][] = [];
  const finals: number[] = [];
  const dds: number[] = [];
  const pfs: number[] = [];
  const exps: number[] = [];
  let losses = 0;
  let ruins = 0;
  for (let s = 0; s < cfg.simulations; s++) {
    const pnls = samplePath(trades, rng, cfg.samplingMode, bs, pp);
    const m = pathMetrics(startingCapital, pnls);
    paths.push(m.path);
    finals.push(m.finalEquity);
    dds.push(m.maxDD);
    pfs.push(Number.isFinite(m.profitFactor) ? m.profitFactor : 1e9);
    exps.push(m.expectancy);
    if (m.finalEquity < startingCapital) losses++;
    if (ruin.kind === "DRAWDOWN_PCT" ? m.maxDDPct >= ruin.value : Math.min(...m.path) <= ruin.value) ruins++;
  }
  // Percentile equity curves (per-step p5/p50/p95).
  const steps = paths[0].length;
  const p5c = new Array<number>(steps);
  const p50c = new Array<number>(steps);
  const p95c = new Array<number>(steps);
  for (let i = 0; i < steps; i++) {
    const col = paths.map((p) => p[i]).sort((a, b) => a - b);
    p5c[i] = percentile(col, 0.05);
    p50c[i] = percentile(col, 0.5);
    p95c[i] = percentile(col, 0.95);
  }
  // Rank by final equity for worst/median/best paths.
  const ranked = paths.map((p, i) => ({ p, f: finals[i] })).sort((a, b) => a.f - b.f);
  const worst = ranked[0].p;
  const best = ranked[ranked.length - 1].p;
  const median = ranked[Math.floor(ranked.length / 2)].p;
  return {
    version: "MONTE_CARLO_V1",
    seed: cfg.seed,
    simulations: cfg.simulations,
    samplingMode: cfg.samplingMode,
    startingCapital,
    ruin,
    ruinFormula: ruinFormulaText(ruin),
    probabilityOfLoss: losses / cfg.simulations,
    probabilityOfRuin: ruins / cfg.simulations,
    finalEquity: pctile5(finals),
    maxDrawdown: pctile5(dds),
    profitFactor: pctile5(pfs),
    expectancy: pctile5(exps),
    percentileEquityCurves: { p5: p5c, p50: p50c, p95: p95c },
    worstPath: worst,
    medianPath: median,
    bestPath: best,
    tradeCount: n,
    assumptions: [
      `sampling=${cfg.samplingMode}`,
      cfg.samplingMode === "BLOCK_BOOTSTRAP" ? `blockSize=${bs}` : "",
      cfg.samplingMode === "PERTURB" ? `perturbPct=${pp}` : "",
      `startingCapital=${startingCapital}`,
      `ruin=${ruinFormulaText(ruin)}`,
      "path independence assumption — trade PnLs treated as exchangeable samples",
    ].filter(Boolean),
  };
}

// Deterministic Run ID.
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computeMonteCarloRunId(input: {
  baseRunId: string;
  researchRunId?: string;
  seed: number;
  simulations: number;
  samplingMode: MonteCarloSamplingMode;
  startingCapital: number;
  ruin: RuinThreshold;
  tradeCount: number;
}): string {
  const key = [
    input.baseRunId,
    input.researchRunId ?? "",
    input.seed,
    input.simulations,
    input.samplingMode,
    input.startingCapital,
    `${input.ruin.kind}:${input.ruin.value}`,
    input.tradeCount,
  ].join("|");
  return `MONTE_CARLO_V1:${fnv1a(key)}`;
}

export const MONTE_CARLO_VERSION = "MONTE_CARLO_V1";
