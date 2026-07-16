// Phase 22 · Stage 1 — Volatility targeting. Deterministic scaling factor.

export type VolTargetInput = {
  readonly returns: readonly number[]; // per-period returns
  readonly targetAnnualVol: number; // e.g. 0.10
  readonly periodsPerYear?: number; // default 252
  readonly lookback?: number; // rolling window
  readonly minScale?: number; // default 0.25
  readonly maxScale?: number; // default 2.0
  readonly volFloor?: number; // default 1e-6
};

export type VolTargetResult = {
  readonly realizedVol: number;
  readonly annualizedVol: number;
  readonly scale: number;
  readonly formula: string;
};

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

export function computeVolTargetScale(input: VolTargetInput): VolTargetResult {
  const ppy = input.periodsPerYear ?? 252;
  const lb = input.lookback ?? input.returns.length;
  const slice = input.returns.slice(-Math.max(2, Math.min(lb, input.returns.length)));
  const realized = stdev(slice);
  const annual = realized * Math.sqrt(ppy);
  const floor = input.volFloor ?? 1e-6;
  const minS = input.minScale ?? 0.25;
  const maxS = input.maxScale ?? 2;
  const raw = annual > floor ? input.targetAnnualVol / annual : maxS;
  const scale = Math.max(minS, Math.min(maxS, raw));
  return {
    realizedVol: realized,
    annualizedVol: annual,
    scale,
    formula: "scale = clamp(targetVol / (stdev(returns)*sqrt(periodsPerYear)), minScale, maxScale)",
  };
}