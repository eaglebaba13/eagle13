// Phase 21.3 · Shared historical runner. Adapters own all formula math; this
// function owns iteration, causality assertion (via adapter-declared mode),
// aggregation, deterministic Run-ID, and result envelope construction.

import { computeUnifiedRunId } from "./run-id";
import { buildUnifiedStats } from "./stats";
import type {
  AdapterConfig,
  HistoricalFormulaAdapter,
} from "./adapter";
import type {
  DataQualitySummary,
  EquityPoint,
  HistoricalBacktestResult,
  HistoricalTrade,
  MonthlyRow,
} from "./result";

export type RunHistoricalArgs = AdapterConfig & {
  formula: HistoricalFormulaAdapter;
  dataQuality?: DataQualitySummary | null;
  ingestVersion?: string;
};

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function buildMonthly(trades: readonly HistoricalTrade[]): MonthlyRow[] {
  const byMonth = new Map<string, MonthlyRow>();
  for (const t of trades) {
    const m = monthOf(t.date);
    const row = byMonth.get(m) ?? {
      month: m,
      trades: 0,
      wins: 0,
      losses: 0,
      netPnl: 0,
    };
    row.trades += 1;
    if (t.outcome === "WIN") row.wins += 1;
    if (t.outcome === "LOSS") row.losses += 1;
    row.netPnl = Math.round((row.netPnl + t.pnl) * 100) / 100;
    byMonth.set(m, row);
  }
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

function buildEquity(trades: readonly HistoricalTrade[]): {
  curve: EquityPoint[];
  netPnl: number;
  maxDD: number;
  maxDDPct: number;
} {
  const curve: EquityPoint[] = [];
  let eq = 0;
  let peak = 0;
  let maxDD = 0;
  for (const t of trades) {
    eq = Math.round((eq + t.pnl) * 100) / 100;
    peak = Math.max(peak, eq);
    const dd = peak - eq;
    if (dd > maxDD) maxDD = dd;
    curve.push({ date: t.date, equity: eq });
  }
  const maxDDPct = peak > 0 ? Math.round((maxDD / peak) * 10000) / 100 : 0;
  return { curve, netPnl: eq, maxDD, maxDDPct };
}

export async function runHistoricalCore(
  args: RunHistoricalArgs,
): Promise<HistoricalBacktestResult> {
  const { formula, dataQuality, ingestVersion, ...cfg } = args;
  formula.validateConfig(cfg);
  if (!formula.supportedInstruments.includes(cfg.instrument)) {
    throw new Error(
      `Formula ${formula.id} does not support instrument ${cfg.instrument}`,
    );
  }

  const plan = await formula.planSessions(cfg);
  if (plan.causality !== formula.causality) {
    throw new Error(
      `Causality mismatch: adapter declares ${formula.causality} but plan returned ${plan.causality}`,
    );
  }

  const allTrades: HistoricalTrade[] = [];
  for (const date of plan.dates) {
    const evaluation = await formula.evaluateSession(cfg, date);
    for (const t of evaluation.trades) allTrades.push(t);
  }

  const monthly = buildMonthly(allTrades);
  const { curve, netPnl, maxDD, maxDDPct } = buildEquity(allTrades);
  const stats = buildUnifiedStats(allTrades, netPnl, maxDD);

  const costs = cfg.costs ?? {
    slippagePct: 0,
    brokerageFlat: 0,
    brokeragePct: 0,
    taxesPct: 0,
  };

  const runId = computeUnifiedRunId({
    formulaVersion: formula.id,
    instrument: cfg.instrument,
    from: cfg.from,
    to: cfg.to,
    policy: cfg.policy ?? "conservative",
    ambiguousPolicy: cfg.ambiguousPolicy ?? "conservative",
    costs,
    source: cfg.source ?? "n/a",
    dataGranularity: formula.dataGranularity,
    engineVersion: formula.versions.engineVersion,
    executionVersion: formula.versions.executionVersion,
    cubeVersion: formula.versions.cubeVersion,
    policyVersion: formula.versions.policyVersion,
    ingestVersion,
  });

  return {
    formulaVersion: formula.id,
    engineVersion: formula.versions.engineVersion,
    executionVersion: formula.versions.executionVersion,
    cubeVersion: formula.versions.cubeVersion,
    policyVersion: formula.versions.policyVersion,
    runId,
    generatedAt: new Date().toISOString(),
    instrument: cfg.instrument,
    from: cfg.from,
    to: cfg.to,
    dataGranularity: formula.dataGranularity,
    source: cfg.source ?? "n/a",
    dataQuality: dataQuality ?? null,
    trades: allTrades,
    stats: stats as unknown as Record<string, unknown>,
    monthly,
    equityCurve: curve,
    drawdown: { max: maxDD, maxPct: maxDDPct },
    benchmark: null,
    methodology: formula.methodology,
    disclaimers: formula.disclaimers,
    formulaMeta: formula.buildMetadata(cfg, allTrades),
  };
}
