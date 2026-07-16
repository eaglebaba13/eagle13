// Phase 22 · Stage 1 — Allocation algorithms. All deterministic and pure.

import type {
  AllocationMethod,
  AllocationResult,
  PortfolioAsset,
  PortfolioConfig,
  PortfolioConstraints,
  StrategyAllocation,
} from "./portfolio-types";

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1));
}

function dailyPnl(a: PortfolioAsset): number[] {
  const m = new Map<string, number>();
  for (const t of a.trades) m.set(t.date, (m.get(t.date) ?? 0) + t.pnl);
  return [...m.values()];
}

export function applyConstraints(
  weights: number[],
  assets: readonly PortfolioAsset[],
  constraints: PortfolioConstraints,
): { weights: number[]; rejected: { assetId: string; reason: string }[] } {
  const rejected: { assetId: string; reason: string }[] = [];
  const out = [...weights];

  // trade count filter
  for (let i = 0; i < assets.length; i++) {
    if (constraints.minTradeCount != null && assets[i].trades.length < constraints.minTradeCount) {
      rejected.push({ assetId: assets[i].id, reason: `MIN_TRADE_COUNT<${constraints.minTradeCount}` });
      out[i] = 0;
    }
  }

  // per-strategy cap
  if (constraints.maxWeightPerStrategy != null) {
    for (let i = 0; i < out.length; i++) {
      if (out[i] > constraints.maxWeightPerStrategy) out[i] = constraints.maxWeightPerStrategy;
    }
  }

  // per-instrument aggregate cap
  if (constraints.maxWeightPerInstrument != null) {
    const byInstr = new Map<string, number>();
    for (let i = 0; i < assets.length; i++) {
      byInstr.set(assets[i].instrument, (byInstr.get(assets[i].instrument) ?? 0) + out[i]);
    }
    for (const [instr, total] of byInstr) {
      if (total > constraints.maxWeightPerInstrument && total > 0) {
        const scale = constraints.maxWeightPerInstrument / total;
        for (let i = 0; i < assets.length; i++) {
          if (assets[i].instrument === instr) out[i] *= scale;
        }
      }
    }
  }

  // normalize to <= max leverage (default 1)
  const max = constraints.maxLeverage ?? 1;
  const sum = out.reduce((a, b) => a + b, 0);
  if (sum > max && sum > 0) {
    const scale = max / sum;
    for (let i = 0; i < out.length; i++) out[i] *= scale;
  }

  return { weights: out, rejected };
}

function normalize(weights: number[]): number[] {
  const s = weights.reduce((a, b) => a + b, 0);
  if (s <= 0) return weights.map(() => 0);
  return weights.map((w) => w / s);
}

export function computeAllocation(
  assets: readonly PortfolioAsset[],
  method: AllocationMethod,
  config: PortfolioConfig,
): AllocationResult {
  const n = assets.length;
  let raw: number[] = new Array(n).fill(0);
  const rationales: string[] = new Array(n).fill("");

  switch (method) {
    case "EQUAL_WEIGHT": {
      raw = raw.map(() => (n > 0 ? 1 / n : 0));
      rationales.fill("Equal weight 1/N");
      break;
    }
    case "FIXED_CUSTOM": {
      const cw = config.customWeights ?? {};
      raw = assets.map((a) => Math.max(0, cw[a.id] ?? 0));
      rationales.fill("Custom weight");
      break;
    }
    case "VOL_INVERSE": {
      const vols = assets.map((a) => stdev(dailyPnl(a)));
      const invs = vols.map((v) => (v > 0 ? 1 / v : 0));
      raw = normalize(invs);
      rationales.fill("Inverse volatility");
      break;
    }
    case "RISK_PARITY": {
      // simplified: 1/vol normalized (same as inverse-vol for uncorrelated)
      const vols = assets.map((a) => stdev(dailyPnl(a)));
      const invs = vols.map((v) => (v > 0 ? 1 / v : 0));
      raw = normalize(invs);
      rationales.fill("Risk parity (diagonal, uncorrelated approximation)");
      break;
    }
    case "MAX_DIVERSIFICATION": {
      // weight proportional to vol / avg-correlation-contribution proxy
      const vols = assets.map((a) => stdev(dailyPnl(a)));
      const totalVol = vols.reduce((a, b) => a + b, 0) || 1;
      raw = vols.map((v) => v / totalVol);
      rationales.fill("Maximum diversification (vol-weighted proxy)");
      break;
    }
    case "MIN_VARIANCE": {
      // minimize sum(w^2 * var) analytically for diagonal case: w_i ∝ 1/var_i
      const vars_ = assets.map((a) => {
        const s = stdev(dailyPnl(a));
        return s * s;
      });
      const invs = vars_.map((v) => (v > 0 ? 1 / v : 0));
      raw = normalize(invs);
      rationales.fill("Minimum variance (diagonal covariance approximation)");
      break;
    }
    case "ROBUSTNESS_WEIGHTED": {
      const scores = assets.map((a) => Math.max(0, a.robustnessScore ?? 0));
      raw = normalize(scores);
      rationales.fill("Robustness score weighted");
      break;
    }
    case "OOS_EXPECTANCY_WEIGHTED": {
      const scores = assets.map((a) => Math.max(0, a.oosExpectancy ?? 0));
      raw = normalize(scores);
      rationales.fill("OOS expectancy weighted");
      break;
    }
    case "RECOMMENDATION_WEIGHTED": {
      const scores = assets.map((a) => Math.max(0, a.recommendationConfidence ?? 0));
      raw = normalize(scores);
      rationales.fill("Recommendation confidence weighted");
      break;
    }
  }

  const { weights: constrained, rejected } = applyConstraints(raw, assets, config.constraints);
  const finalWeights = constrained;

  const allocations: StrategyAllocation[] = assets.map((a, i) => ({
    assetId: a.id,
    weight: finalWeights[i],
    rationale: rationales[i],
  }));

  return {
    method,
    allocations,
    rejected,
    normalized: true,
  };
}