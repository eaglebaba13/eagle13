// Phase 22 · Stage 1 — Risk contribution decomposition. Deterministic.

import type {
  PortfolioAsset,
  StrategyAllocation,
  RiskContribution,
  CorrelationMatrix,
} from "./portfolio-types";

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function assetDailyPnl(a: PortfolioAsset): number[] {
  const m = new Map<string, number>();
  for (const t of a.trades) m.set(t.date, (m.get(t.date) ?? 0) + t.pnl);
  return [...m.values()];
}

export function computeRiskContributions(
  assets: readonly PortfolioAsset[],
  allocations: readonly StrategyAllocation[],
  correlations: CorrelationMatrix,
): readonly RiskContribution[] {
  const idx = new Map(allocations.map((a) => [a.assetId, a.weight]));
  const vols = assets.map((a) => stdev(assetDailyPnl(a)));
  const totalVol = vols.reduce(
    (acc, v, i) => acc + v * (idx.get(assets[i].id) ?? 0),
    0,
  );
  const losses = assets.map((a) => a.trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const totalLoss = losses.reduce((a, b) => a + b, 0) || -1;
  const dds = assets.map((a) => a.maxDrawdown);
  const totalDD = dds.reduce((a, b) => a + b, 0) || 1;
  const totalWeight = allocations.reduce((s, a) => s + a.weight, 0) || 1;

  // Tail losses (bottom 5% of daily pnl per asset)
  const tails = assets.map((a) => {
    const daily = assetDailyPnl(a).sort((x, y) => x - y);
    const n = Math.max(1, Math.ceil(daily.length * 0.05));
    return daily.slice(0, n).reduce((s, v) => s + v, 0);
  });
  const totalTail = tails.reduce((a, b) => a + b, 0) || -1;

  // Correlation contribution = sum of pairwise correlations weighted
  const corrContribRaw = assets.map((_a, i) => {
    let s = 0;
    for (let j = 0; j < assets.length; j++) {
      if (i === j) continue;
      s += (correlations.returns[i]?.[j] ?? 0) * (idx.get(assets[j].id) ?? 0);
    }
    return Math.max(0, s);
  });
  const corrTotal = corrContribRaw.reduce((a, b) => a + b, 0) || 1;

  return assets.map((a, i) => {
    const w = idx.get(a.id) ?? 0;
    return {
      assetId: a.id,
      capitalPct: w / totalWeight,
      volPct: totalVol > 0 ? (w * vols[i]) / totalVol : 0,
      drawdownPct: dds[i] / totalDD,
      lossPct: losses[i] / totalLoss,
      tailPct: tails[i] / totalTail,
      correlationPct: corrContribRaw[i] / corrTotal,
    };
  });
}