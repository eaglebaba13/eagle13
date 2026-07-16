// Phase 22 · Stage 1 — Correlation engine. Uses only aligned timestamps.
// Never fabricates missing observations.

import type { PortfolioAsset, CorrelationMatrix } from "./portfolio-types";

type Series = Map<string, number>; // date -> pnl (per-asset per-day)

function buildDailyPnl(asset: PortfolioAsset): Series {
  const m = new Map<string, number>();
  for (const t of asset.trades) {
    m.set(t.date, (m.get(t.date) ?? 0) + t.pnl);
  }
  return m;
}

function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i];
    sxx += xs[i] * xs[i]; syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  if (den === 0) return 0;
  const r = num / den;
  return Math.max(-1, Math.min(1, r));
}

export function computeCorrelations(assets: readonly PortfolioAsset[]): CorrelationMatrix {
  const series = assets.map(buildDailyPnl);
  const ids = assets.map((a) => a.id);

  // aligned dates = intersection of all keys
  let common: Set<string> | null = null;
  for (const s of series) {
    const keys = new Set<string>(s.keys());
    if (common == null) common = keys;
    else {
      const next = new Set<string>();
      for (const k of common) if (keys.has(k)) next.add(k);
      common = next;
    }
  }
  const dates = [...(common ?? new Set<string>())].sort();

  const n = ids.length;
  const pnl: number[][] = series.map((s) => dates.map((d) => s.get(d) ?? 0));

  const returns: number[][] = Array.from({ length: n }, () => new Array(n).fill(1));
  const dd: number[][] = Array.from({ length: n }, () => new Array(n).fill(1));
  const winLoss: number[][] = Array.from({ length: n }, () => new Array(n).fill(1));

  // running drawdown per asset
  const ddSeries: number[][] = pnl.map((row) => {
    let peak = 0, eq = 0;
    return row.map((v) => {
      eq += v;
      peak = Math.max(peak, eq);
      return peak - eq;
    });
  });
  const wlSeries: number[][] = pnl.map((row) => row.map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0)));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      returns[i][j] = pearson(pnl[i], pnl[j]);
      dd[i][j] = pearson(ddSeries[i], ddSeries[j]);
      winLoss[i][j] = pearson(wlSeries[i], wlSeries[j]);
    }
  }

  // simultaneous loss rate across observations
  let simDays = 0;
  for (let d = 0; d < dates.length; d++) {
    let anyLoss = false, allLoss = n > 0;
    for (let i = 0; i < n; i++) {
      if (pnl[i][d] < 0) anyLoss = true;
      else allLoss = false;
    }
    if (n >= 2 && allLoss && anyLoss) simDays++;
  }
  const simRate = dates.length > 0 ? simDays / dates.length : 0;

  return {
    assetIds: ids,
    returns,
    drawdown: dd,
    winLoss,
    simultaneousLossRate: simRate,
    alignedObservations: dates.length,
  };
}