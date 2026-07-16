// Phase 22 · Stage 2 — Deterministic candidate discovery. Converts an
// existing HistoricalBacktestResult (and optional research metadata) into a
// PortfolioAsset. NEVER re-runs strategies. NEVER mutates source trades.

import type { HistoricalBacktestResult } from "@/lib/backtest/result";
import type { PortfolioAsset } from "./portfolio-types";

export type CandidateMeta = {
  readonly robustnessScore?: number | null;
  readonly oosExpectancy?: number | null;
  readonly recommendationConfidence?: number | null;
  readonly overfitStatus?: PortfolioAsset["overfitStatus"];
  readonly reliability?: PortfolioAsset["reliability"];
  readonly dataQuality?: PortfolioAsset["dataQuality"];
  readonly regime?: string | null;
  readonly dataHash?: string | null;
  readonly startingCapital?: number;
  readonly label?: string;
  readonly strategy?: string;
};

export type CandidateRow = {
  readonly assetId: string;
  readonly runId: string;
  readonly strategy: string;
  readonly formulaVersion: string;
  readonly instrument: string;
  readonly timeframe: string;
  readonly from: string;
  readonly to: string;
  readonly trades: number;
  readonly winRate: number;
  readonly profitFactor: number;
  readonly expectancy: number;
  readonly maxDrawdown: number;
  readonly netPnl: number;
  readonly robustness: number | null;
  readonly recommendation: number | null;
  readonly optimizerStatus: string;
  readonly reliability: string;
  readonly selectable: boolean;
  readonly blockReason: string | null;
};

function inferStrategy(formulaVersion: string): string {
  if (formulaVersion.startsWith("ASTRO_SMC_HYBRID")) return "Hybrid";
  if (formulaVersion.startsWith("SMC")) return "SMC";
  if (formulaVersion.startsWith("ASTRO")) return "Astro";
  if (formulaVersion.startsWith("ABSOLUTE")) return "Absolute";
  if (formulaVersion.startsWith("LEGACY")) return "Legacy";
  return formulaVersion;
}

export function candidateFromResult(
  result: HistoricalBacktestResult,
  meta: CandidateMeta = {},
): PortfolioAsset {
  const startingCapital = meta.startingCapital ?? 100000;
  const netPnl = result.trades.reduce((s, t) => s + t.pnl, 0);
  const maxDrawdown = result.drawdown?.max ?? 0;

  const id = `${result.formulaVersion}:${result.instrument}:${result.from}:${result.to}`;
  return {
    id,
    label: meta.label ?? `${inferStrategy(result.formulaVersion)} · ${result.instrument} · ${result.dataGranularity}`,
    strategy: meta.strategy ?? inferStrategy(result.formulaVersion),
    formulaVersion: result.formulaVersion,
    instrument: result.instrument,
    timeframe: result.dataGranularity,
    regime: meta.regime ?? null,
    runId: result.runId,
    dataHash: meta.dataHash ?? null,
    from: result.from,
    to: result.to,
    startingCapital,
    trades: result.trades,
    equityCurve: result.equityCurve,
    maxDrawdown,
    netPnl,
    robustnessScore: meta.robustnessScore ?? null,
    oosExpectancy: meta.oosExpectancy ?? null,
    recommendationConfidence: meta.recommendationConfidence ?? null,
    overfitStatus: meta.overfitStatus ?? null,
    reliability: meta.reliability ?? null,
    dataQuality: meta.dataQuality ?? null,
  };
}

function computeRow(asset: PortfolioAsset): CandidateRow {
  const decided = asset.trades.filter((t) => t.outcome === "WIN" || t.outcome === "LOSS");
  const wins = decided.filter((t) => t.outcome === "WIN");
  const losses = decided.filter((t) => t.outcome === "LOSS");
  const winPnl = wins.reduce((s, t) => s + t.pnl, 0);
  const lossPnl = -losses.reduce((s, t) => s + t.pnl, 0);
  const winRate = decided.length > 0 ? wins.length / decided.length : 0;
  const pf = lossPnl > 0 ? winPnl / lossPnl : winPnl > 0 ? Infinity : 0;
  const expectancy = asset.trades.length > 0 ? asset.netPnl / asset.trades.length : 0;

  const overfit = asset.overfitStatus === "OVERFIT" || asset.overfitStatus === "FAIL";
  const unreliable = asset.reliability === "POOR" || asset.reliability === "UNRELIABLE";
  const blockReason = overfit ? "OVERFIT" : unreliable ? "UNRELIABLE" : null;

  return {
    assetId: asset.id,
    runId: asset.runId,
    strategy: asset.strategy,
    formulaVersion: String(asset.formulaVersion),
    instrument: asset.instrument,
    timeframe: asset.timeframe,
    from: asset.from,
    to: asset.to,
    trades: asset.trades.length,
    winRate,
    profitFactor: pf,
    expectancy,
    maxDrawdown: asset.maxDrawdown,
    netPnl: asset.netPnl,
    robustness: asset.robustnessScore ?? null,
    recommendation: asset.recommendationConfidence ?? null,
    optimizerStatus: asset.overfitStatus ?? "—",
    reliability: asset.reliability ?? "—",
    selectable: !blockReason,
    blockReason,
  };
}

export function buildCandidateRows(assets: readonly PortfolioAsset[]): readonly CandidateRow[] {
  return assets.map(computeRow);
}

/** Deterministic in-memory registry, research-only. Never persists or writes production state. */
export class CandidateRegistry {
  private items = new Map<string, PortfolioAsset>();

  register(asset: PortfolioAsset): PortfolioAsset {
    this.items.set(asset.id, asset);
    return asset;
  }
  unregister(id: string): void {
    this.items.delete(id);
  }
  clear(): void {
    this.items.clear();
  }
  list(): readonly PortfolioAsset[] {
    return [...this.items.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  get(id: string): PortfolioAsset | undefined {
    return this.items.get(id);
  }
  size(): number {
    return this.items.size;
  }
  filter(query: {
    strategy?: string;
    instrument?: string;
    timeframe?: string;
    minTrades?: number;
  }): readonly PortfolioAsset[] {
    return this.list().filter((a) => {
      if (query.strategy && a.strategy !== query.strategy) return false;
      if (query.instrument && a.instrument !== query.instrument) return false;
      if (query.timeframe && a.timeframe !== query.timeframe) return false;
      if (query.minTrades != null && a.trades.length < query.minTrades) return false;
      return true;
    });
  }
}

/** Shared, module-scoped registry so any research surface can push candidates. */
export const globalCandidateRegistry = new CandidateRegistry();