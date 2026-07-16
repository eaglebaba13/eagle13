// Phase 22 · Stage 1 — Portfolio research engine. Pure, deterministic.
// Consumes existing historical results read-only. Never mutates trades.

import { computeAllocation } from "./allocation-methods";
import { computeCorrelations } from "./correlation";
import { computeKelly } from "./kelly-sizing";
import { computePortfolioMetrics } from "./portfolio-metrics";
import { computePortfolioRunId } from "./portfolio-run-id";
import { computeRiskContributions } from "./risk-contribution";
import { computeVolTargetScale } from "./vol-targeting";
import {
  PORTFOLIO_DISCLAIMER,
  type PortfolioAsset,
  type PortfolioConfig,
  type PortfolioEquityPoint,
  type PortfolioResearchResult,
  type PortfolioTrade,
  type PortfolioWarning,
  type StrategyAllocation,
} from "./portfolio-types";

export type PortfolioRunInput = {
  readonly candidates: readonly PortfolioAsset[];
  readonly config: PortfolioConfig;
  readonly now?: () => string;
};

function computeSizingScale(asset: PortfolioAsset, config: PortfolioConfig): number {
  const p = config.sizingPolicy;
  switch (p.method) {
    case "FIXED_QTY":
      return 1;
    case "FIXED_CAPITAL_PCT":
      return Math.max(0, Math.min(1, p.fixedCapitalPct ?? 1));
    case "FIXED_RISK_PCT": {
      const risk = p.fixedRiskPct ?? 0.01;
      // scale so avg loss ≈ risk% of starting capital
      const losses = asset.trades.filter((t) => t.pnl < 0).map((t) => -t.pnl);
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
      const target = risk * config.startingCapital;
      return avgLoss > 0 ? target / avgLoss : 1;
    }
    case "VOL_TARGETING": {
      const daily = new Map<string, number>();
      for (const t of asset.trades) daily.set(t.date, (daily.get(t.date) ?? 0) + t.pnl);
      const returns = [...daily.values()].map((v) => v / Math.max(1, config.startingCapital));
      return computeVolTargetScale({
        returns,
        targetAnnualVol: p.volTargetAnnual ?? 0.1,
        lookback: config.volLookbackDays,
      }).scale;
    }
    case "ATR_RISK": {
      const mult = p.atrMultiple ?? 1;
      return mult;
    }
    case "FRACTIONAL_KELLY": {
      const wins = asset.trades.filter((t) => t.pnl > 0);
      const losses = asset.trades.filter((t) => t.pnl < 0);
      const p_ = asset.trades.length > 0 ? wins.length / asset.trades.length : 0;
      const aw = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
      const al = losses.length > 0 ? -losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
      const k = computeKelly({
        winProbability: p_,
        averageWin: aw,
        averageLoss: al,
        tradeCount: asset.trades.length,
        fraction: p.kellyFraction ?? "QUARTER",
        custom: p.kellyCustom,
        maxAllocation: p.maxAllocationPerStrategy,
      });
      return k.fraction;
    }
    case "DRAWDOWN_ADJUSTED": {
      const dd = asset.maxDrawdown;
      const cap = config.startingCapital;
      return dd > 0 ? Math.min(1, (cap * 0.1) / dd) : 1;
    }
    case "CONFIDENCE_ADJUSTED": {
      return Math.max(0, Math.min(1, asset.recommendationConfidence ?? 0.5));
    }
  }
}

function buildEquityCurve(
  trades: readonly PortfolioTrade[],
  startingCapital: number,
): PortfolioEquityPoint[] {
  const byDate = new Map<string, number>();
  for (const t of trades) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.scaledPnl);
  const dates = [...byDate.keys()].sort();
  const out: PortfolioEquityPoint[] = [];
  let eq = startingCapital;
  let peak = startingCapital;
  for (const d of dates) {
    eq = Math.round((eq + (byDate.get(d) ?? 0)) * 100) / 100;
    peak = Math.max(peak, eq);
    out.push({ date: d, equity: eq, drawdown: peak - eq });
  }
  return out;
}

function checkSafetyGates(
  assets: readonly PortfolioAsset[],
  config: PortfolioConfig,
): { warnings: PortfolioWarning[]; blocking: string[] } {
  const warnings: PortfolioWarning[] = [];
  const blocking: string[] = [];

  if (assets.length === 0) blocking.push("NO_CANDIDATES");

  const reliabilityRank = { HIGH: 3, MEDIUM: 2, LOW: 1, POOR: 0, UNRELIABLE: 0 } as const;
  const qualityRank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

  for (const a of assets) {
    if (!a.runId) blocking.push(`CANDIDATE_RUNID_MISSING:${a.id}`);
    if (a.overfitStatus === "OVERFIT" || a.overfitStatus === "FAIL") {
      blocking.push(`OPTIMIZER_OVERFIT:${a.id}`);
    }
    if (a.reliability === "POOR" || a.reliability === "UNRELIABLE") {
      blocking.push(`RECOMMENDATION_UNRELIABLE:${a.id}`);
    }
    if (config.constraints.minResearchReliability && a.reliability) {
      const need = reliabilityRank[config.constraints.minResearchReliability];
      const got = reliabilityRank[a.reliability] ?? 0;
      if (got < need) blocking.push(`MIN_RELIABILITY:${a.id}`);
    }
    if (config.constraints.minDataQuality && a.dataQuality) {
      const need = qualityRank[config.constraints.minDataQuality];
      const got = qualityRank[a.dataQuality] ?? 0;
      if (got < need) blocking.push(`MIN_DATA_QUALITY:${a.id}`);
    }
    if (a.trades.length === 0) {
      warnings.push({ code: "EMPTY_TRADES", message: `${a.id} has no trades`, severity: "warn" });
    }
  }

  // formula-version consistency is informational (mixed portfolios OK)
  const formulas = new Set(assets.map((a) => a.formulaVersion));
  if (formulas.size > 1) {
    warnings.push({ code: "MULTIPLE_FORMULAS", message: `${formulas.size} formula versions mixed`, severity: "info" });
  }

  if (config.constraints.minDiversificationCount != null &&
      assets.length < config.constraints.minDiversificationCount) {
    blocking.push(`MIN_DIVERSIFICATION_COUNT<${config.constraints.minDiversificationCount}`);
  }

  return { warnings, blocking };
}

export function runPortfolioResearch(input: PortfolioRunInput): PortfolioResearchResult {
  const { candidates, config } = input;
  const now = input.now ?? (() => new Date().toISOString());

  const gates = checkSafetyGates(candidates, config);

  const alloc = computeAllocation(candidates, config.method, config);

  // Build scaled trades per allocation × sizing
  const trades: PortfolioTrade[] = [];
  const costCf = config.costs;
  for (let i = 0; i < candidates.length; i++) {
    const asset = candidates[i];
    const weight = alloc.allocations[i]?.weight ?? 0;
    if (weight <= 0) continue;
    const scale = computeSizingScale(asset, config) * weight;
    for (const t of asset.trades) {
      const gross = t.pnl * scale;
      const cost =
        costCf.brokerageFlat +
        Math.abs(gross) * (costCf.brokeragePct + costCf.slippagePct + costCf.taxesPct);
      trades.push({
        date: t.date,
        assetId: asset.id,
        pnl: t.pnl,
        scaledPnl: gross - cost,
      });
    }
  }
  trades.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const equityCurve = buildEquityCurve(trades, config.startingCapital);
  const drawdownCurve = equityCurve.map((p) => ({
    date: p.date,
    equity: p.drawdown,
    drawdown: p.drawdown,
  }));

  const correlations = computeCorrelations(candidates);
  const riskContributions = computeRiskContributions(candidates, alloc.allocations, correlations);
  const metrics = computePortfolioMetrics(candidates, alloc.allocations, config.startingCapital, equityCurve, trades);

  // Correlation constraint check
  if (config.constraints.maxCorrelatedExposure != null && correlations.assetIds.length >= 2) {
    const cap = config.constraints.maxCorrelatedExposure;
    for (let i = 0; i < correlations.assetIds.length; i++) {
      for (let j = i + 1; j < correlations.assetIds.length; j++) {
        const r = correlations.returns[i][j];
        const wi = alloc.allocations[i].weight;
        const wj = alloc.allocations[j].weight;
        if (r > cap && wi + wj > cap) {
          gates.warnings.push({
            code: "EXCESS_CORRELATION",
            message: `${correlations.assetIds[i]}↔${correlations.assetIds[j]} r=${r.toFixed(2)}`,
            severity: "warn",
          });
        }
      }
    }
  }

  if (config.constraints.maxPortfolioDrawdown != null &&
      metrics.maxDrawdownPct > config.constraints.maxPortfolioDrawdown) {
    gates.warnings.push({
      code: "PORTFOLIO_DRAWDOWN_EXCEEDED",
      message: `${(metrics.maxDrawdownPct * 100).toFixed(1)}% > ${(config.constraints.maxPortfolioDrawdown * 100).toFixed(1)}%`,
      severity: "warn",
    });
  }

  const runId = computePortfolioRunId(candidates, config, candidates.map((a) => a.dataHash ?? ""));

  const effectiveN = alloc.allocations.filter((a) => a.weight > 0).length;
  const instrumentWeights = new Map<string, number>();
  const tfWeights = new Map<string, number>();
  for (const a of alloc.allocations) {
    const asset = candidates.find((c) => c.id === a.assetId);
    if (!asset) continue;
    instrumentWeights.set(asset.instrument, (instrumentWeights.get(asset.instrument) ?? 0) + a.weight);
    tfWeights.set(asset.timeframe, (tfWeights.get(asset.timeframe) ?? 0) + a.weight);
  }
  const hhi = (arr: number[]) => {
    const s = arr.reduce((a, b) => a + b, 0) || 1;
    return arr.reduce((acc, w) => acc + (w / s) * (w / s), 0);
  };

  return {
    runId,
    generatedAt: now(),
    config,
    candidateRunIds: candidates.map((c) => c.runId),
    allocation: alloc,
    equityCurve,
    drawdownCurve,
    trades,
    metrics,
    correlations,
    riskContributions,
    concentration: {
      hhiStrategy: metrics.strategyConcentration,
      hhiInstrument: hhi([...instrumentWeights.values()]),
      hhiTimeframe: hhi([...tfWeights.values()]),
    },
    diversification: {
      effectiveN,
      diversificationRatio: metrics.diversificationRatio,
    },
    warnings: gates.warnings,
    blockingReasons: gates.blocking,
    disclaimer: PORTFOLIO_DISCLAIMER,
  };
}