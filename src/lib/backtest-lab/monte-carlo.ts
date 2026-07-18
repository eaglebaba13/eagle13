// Phase 3G — Deterministic Monte Carlo trade-sequence reshuffle.
// Does NOT fabricate trades or alter outcomes. Seeded PRNG for
// reproducibility. Bounded iterations.

import type { MonteCarloSummary, SimulatedTrade } from "./types";
import { buildEquityCurve } from "./performance";

const MAX_ITERATIONS = 5_000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

export function runMonteCarlo(
  trades: readonly SimulatedTrade[],
  startingCapital: number,
  opts: { iterations: number; seed: number; drawdownThreshold?: number | null } = { iterations: 500, seed: 1 },
): MonteCarloSummary {
  const iterations = Math.min(Math.max(1, opts.iterations | 0), MAX_ITERATIONS);
  const seed = opts.seed | 0 || 1;
  const rng = mulberry32(seed);
  const n = trades.length;
  const finals: number[] = [];
  const maxDds: number[] = [];
  let lossCount = 0;
  let exceedsCount = 0;
  const threshold = opts.drawdownThreshold ?? null;

  if (n === 0) {
    return {
      iterations, seed,
      finalEquityP05: startingCapital, finalEquityP50: startingCapital, finalEquityP95: startingCapital,
      maxDrawdownP05: 0, maxDrawdownP50: 0, maxDrawdownP95: 0,
      probLoss: 0, probExceedsDrawdown: threshold != null ? 0 : null,
      drawdownThreshold: threshold,
    };
  }

  const pnls = trades.map((t) => t.netPnl);
  for (let it = 0; it < iterations; it++) {
    const order = pnls.slice();
    // Fisher-Yates with seeded RNG.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    let equity = startingCapital;
    let peak = startingCapital;
    let maxDd = 0;
    for (const p of order) {
      equity += p;
      peak = Math.max(peak, equity);
      maxDd = Math.max(maxDd, peak - equity);
    }
    finals.push(equity);
    maxDds.push(maxDd);
    if (equity < startingCapital) lossCount++;
    if (threshold != null && maxDd >= threshold) exceedsCount++;
  }
  finals.sort((a, b) => a - b);
  maxDds.sort((a, b) => a - b);
  return {
    iterations, seed,
    finalEquityP05: percentile(finals, 0.05),
    finalEquityP50: percentile(finals, 0.5),
    finalEquityP95: percentile(finals, 0.95),
    maxDrawdownP05: percentile(maxDds, 0.05),
    maxDrawdownP50: percentile(maxDds, 0.5),
    maxDrawdownP95: percentile(maxDds, 0.95),
    probLoss: lossCount / iterations,
    probExceedsDrawdown: threshold != null ? exceedsCount / iterations : null,
    drawdownThreshold: threshold,
  };
}

// Kept exported for tests / audits.
export { buildEquityCurve as _buildEquityCurve };