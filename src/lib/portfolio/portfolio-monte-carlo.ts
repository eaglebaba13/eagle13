// Phase 22 · Stage 1 — Portfolio Monte Carlo. Uses a local mulberry32 RNG
// so the existing Monte Carlo engine is NOT modified. Deterministic per seed.

import type { PortfolioResearchResult, PortfolioTrade } from "./portfolio-types";

export type PortfolioMcMode =
  | "SHUFFLE"
  | "CORRELATED_BOOTSTRAP"
  | "BLOCK_BOOTSTRAP"
  | "STRATEGY_OUTAGE"
  | "SINGLE_FAILURE"
  | "CORRELATION_SPIKE"
  | "VOL_SHOCK";

export type PortfolioMcInput = {
  readonly result: PortfolioResearchResult;
  readonly startingCapital: number;
  readonly simulations: number;
  readonly seed: number;
  readonly mode: PortfolioMcMode;
  readonly blockSize?: number;
  readonly ruinDrawdownPct?: number; // default 0.30
  readonly volShockMultiplier?: number; // default 2
  readonly correlationSpike?: number; // 0..1
};

export type PortfolioMcResult = {
  readonly finalEquity: { p5: number; p50: number; p95: number };
  readonly maxDrawdown: { p5: number; p50: number; p95: number };
  readonly probabilityOfRuin: number;
  readonly worstCase: number;
  readonly strategyFailureImpact: Readonly<Record<string, number>>;
  readonly mode: PortfolioMcMode;
  readonly simulations: number;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
  return sorted[idx];
}

function simulateOnce(
  trades: readonly PortfolioTrade[],
  rng: () => number,
  mode: PortfolioMcMode,
  blockSize: number,
  volShock: number,
  excludedAsset: string | null,
): { final: number; maxDD: number } {
  const pool = excludedAsset ? trades.filter((t) => t.assetId !== excludedAsset) : trades;
  const n = pool.length;
  if (n === 0) return { final: 0, maxDD: 0 };

  const seq: number[] = [];
  if (mode === "SHUFFLE") {
    const idx = [...pool.keys()];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    for (const k of idx) seq.push(pool[k].scaledPnl);
  } else if (mode === "BLOCK_BOOTSTRAP") {
    while (seq.length < n) {
      const start = Math.floor(rng() * n);
      for (let k = 0; k < blockSize && seq.length < n; k++) {
        seq.push(pool[(start + k) % n].scaledPnl);
      }
    }
  } else if (mode === "VOL_SHOCK") {
    for (let i = 0; i < n; i++) {
      seq.push(pool[Math.floor(rng() * n)].scaledPnl * volShock);
    }
  } else {
    // CORRELATED_BOOTSTRAP / CORRELATION_SPIKE / STRATEGY_OUTAGE / SINGLE_FAILURE — plain bootstrap
    for (let i = 0; i < n; i++) seq.push(pool[Math.floor(rng() * n)].scaledPnl);
  }

  let eq = 0, peak = 0, maxDD = 0;
  for (const v of seq) {
    eq += v;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
  }
  return { final: eq, maxDD };
}

export function runPortfolioMonteCarlo(input: PortfolioMcInput): PortfolioMcResult {
  const rng = mulberry32(input.seed);
  const trades = input.result.trades;
  const blockSize = input.blockSize ?? 20;
  const volShock = input.volShockMultiplier ?? 2;
  const ruinDD = (input.ruinDrawdownPct ?? 0.3) * input.startingCapital;

  const finals: number[] = [];
  const drawdowns: number[] = [];
  let ruinCount = 0;
  let worst = Infinity;

  const assetIds = [...new Set(trades.map((t) => t.assetId))];
  const strategyImpact: Record<string, number> = {};

  for (let s = 0; s < input.simulations; s++) {
    let excluded: string | null = null;
    if (input.mode === "STRATEGY_OUTAGE" || input.mode === "SINGLE_FAILURE") {
      excluded = assetIds[Math.floor(rng() * assetIds.length)] ?? null;
    }
    const { final, maxDD } = simulateOnce(trades, rng, input.mode, blockSize, volShock, excluded);
    finals.push(final);
    drawdowns.push(maxDD);
    if (maxDD >= ruinDD) ruinCount++;
    if (final < worst) worst = final;
    if (excluded) {
      strategyImpact[excluded] = (strategyImpact[excluded] ?? 0) + final;
    }
  }

  finals.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);

  const sc = input.startingCapital;
  const avgImpact: Record<string, number> = {};
  for (const [k, sum] of Object.entries(strategyImpact)) avgImpact[k] = sum / input.simulations;

  return {
    finalEquity: {
      p5: sc + percentile(finals, 0.05),
      p50: sc + percentile(finals, 0.5),
      p95: sc + percentile(finals, 0.95),
    },
    maxDrawdown: {
      p5: percentile(drawdowns, 0.05),
      p50: percentile(drawdowns, 0.5),
      p95: percentile(drawdowns, 0.95),
    },
    probabilityOfRuin: input.simulations > 0 ? ruinCount / input.simulations : 0,
    worstCase: sc + (worst === Infinity ? 0 : worst),
    strategyFailureImpact: avgImpact,
    mode: input.mode,
    simulations: input.simulations,
  };
}