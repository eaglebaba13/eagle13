// Phase 21.5 · Stage 1B — Research Lab UI integration.
// UI + orchestration only. Reuses the existing runBacktest (Astro) server
// function and the completed walk-forward, stability, comparison, summary,
// run-id and export engines. No production formula, adapter, engine, cache
// or Run ID is modified.

import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";

import {
  runBacktest,
  BACKTEST_SYMBOLS,
  type BacktestResult,
  type BacktestSymbol,
  type BacktestTrade,
} from "@/lib/backtest.functions";
import { ApexChart } from "@/components/ApexChart";
import {
  estimateGridCells,
  validateSensitivityGrid,
  RESEARCH_UI_MAX_CELLS,
  SENSITIVITY_UI_ERROR_LABEL,
  type SensitivityUiErrorCode,
} from "@/lib/backtest/sensitivity-ui";
import {
  SMC_PARAMETER_KEYS,
  HYBRID_PARAMETER_KEYS,
  classifySensitivitySurface,
  computeSensitivityRunId,
  type ParameterSpec,
  type SensitivityCell,
  type SensitivitySurface,
} from "@/lib/backtest/parameter-sensitivity";
import {
  runSmcSensitivity,
  runHybridSensitivity,
  SensitivityExecutionError,
} from "@/lib/backtest/sensitivity-execution";
import { createComputeCounters } from "@/lib/backtest/research-payload";
import {
  useResearchPayload,
  type PublishedResearchPayload,
} from "@/lib/backtest/research-payload-store";
import {
  buildSensitivityCellsCsv,
  buildSensitivityMatrixCsv,
  buildSensitivityJson,
  buildResearchBundleJson,
  type SensitivityExportProvenance,
} from "@/lib/backtest/sensitivity-exports";
import {
  runWalkForward,
  type SplitMode,
  type WalkForwardResult,
  type WalkForwardWindow,
} from "@/lib/backtest/walk-forward";
import {
  buildStrategyRow,
  buildResearchComparison,
  generateResearchSummary,
  type StrategyResearchRow,
} from "@/lib/backtest/research-comparison";
import {
  createBatchOrchestrator,
  summarizeBatch,
  buildExecutionPlan,
  type BatchController,
  type BatchOrchestratorInput,
  type BatchOrchestratorState,
} from "@/lib/backtest/cross-asset-orchestrator";
import {
  buildBatchResultsCsv,
  buildBatchFailuresCsv,
  buildBatchCoverageCsv,
  buildBatchSummaryJson,
  buildBatchResultsJson,
} from "@/lib/backtest/batch-exports";
import { runUnifiedBacktest } from "@/lib/backtest/unified";
import type { DataGranularity } from "@/lib/backtest/result";
import {
  buildComparisonMatrixCsv,
  buildResearchJson,
} from "@/lib/backtest/research-exports";
import { computeResearchRunId } from "@/lib/backtest/research-run-id";
import {
  computeMonteCarloRunId,
  runMonteCarlo,
  type MonteCarloResult,
  type MonteCarloSamplingMode,
  type RuinThreshold,
} from "@/lib/backtest/monte-carlo";
import {
  computeRobustnessScore,
  computeRobustnessRunId,
  type RobustnessResult,
} from "@/lib/backtest/robustness";
import {
  buildMonteCarloCsv,
  buildMonteCarloJson,
  buildRobustnessCsv,
  buildRobustnessJson,
  type ExportProvenance,
} from "@/lib/backtest/robustness-exports";
import type { StrategyId } from "@/lib/backtest/strategy";
import type {
  HistoricalBacktestResult,
  HistoricalTrade,
  UnifiedFormulaId,
} from "@/lib/backtest/result";
import { downloadBlob } from "@/lib/download";
import { ASTRO_FORMULA_VERSIONS } from "@/lib/engine-version";

const C = {
  bg: "var(--eb-bg)",
  card: "var(--eb-card)",
  border: "var(--eb-border)",
  green: "var(--eb-bull)",
  red: "var(--eb-bear)",
  orange: "var(--eb-accent)",
  blue: "var(--eb-blue)",
  text: "var(--eb-text)",
  muted: "var(--eb-muted)",
};

const panel: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: 14,
  marginBottom: 14,
};
const lbl: React.CSSProperties = {
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
  color: C.muted,
  marginBottom: 4,
  letterSpacing: 1,
  textTransform: "uppercase",
};
const sel: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.border}`,
  color: C.text,
  padding: "6px 8px",
  borderRadius: 6,
  fontFamily: "var(--eb-mono)",
  fontSize: 12,
  width: "100%",
};
const chip: React.CSSProperties = {
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  cursor: "pointer",
  background: "transparent",
  color: C.text,
};
const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: `1px solid ${C.orange}`,
  background: C.orange,
  color: "#04140b",
  fontFamily: "var(--eb-mono)",
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 600,
};
const btnGhost: React.CSSProperties = {
  ...btn,
  background: "transparent",
  color: C.text,
  border: `1px solid ${C.border}`,
  fontWeight: 400,
};

type StrategyOption = {
  id: StrategyId;
  formula: UnifiedFormulaId;
  label: string;
  supported: boolean;
  note?: string;
};

const STRATEGY_OPTIONS: StrategyOption[] = [
  { id: "ASTRO", formula: "GANN_SIGN_DEGREE_TABLE_V1_1", label: "Sign-Degree Astro", supported: true },
  { id: "ASTRO", formula: ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1, label: "Legacy Cascade", supported: true },
  { id: "ASTRO", formula: "GANN_ASTRO_INTRADAY_ABSOLUTE_V1", label: "Absolute-Degree Intraday", supported: false, note: "Requires 5m provider payload · enable via CSV/provider selection" },
  { id: "SMC", formula: "SMC_V1", label: "SMC_V1", supported: false, note: "Requires 5m provider payload · enable via CSV/provider selection" },
  { id: "ASTRO_SMC_HYBRID", formula: "ASTRO_SMC_HYBRID_V1", label: "Astro + SMC Hybrid", supported: false, note: "Requires 5m provider payload · enable via CSV/provider selection" },
];

const SPLIT_MODES: readonly { id: SplitMode; label: string }[] = [
  { id: "70_30", label: "70 / 30" },
  { id: "60_40", label: "60 / 40" },
  { id: "80_20", label: "80 / 20" },
  { id: "ROLLING", label: "Rolling" },
  { id: "EXPANDING", label: "Expanding" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

// -- Trade shim: BacktestResult → HistoricalBacktestResult (only fields the
// walk-forward metrics consume). No math is duplicated: PnL/outcomes come
// straight from the source result.
function shimTrade(t: BacktestTrade, formula: UnifiedFormulaId): HistoricalTrade {
  const outcome =
    t.result === "WIN" || t.result === "LOSS" || t.result === "FLAT"
      ? t.result
      : t.result === "SKIP"
        ? "SKIP"
        : t.result === "AMBIGUOUS"
          ? "AMBIGUOUS"
          : t.result === "INVALID_SETUP"
            ? "INVALID_SETUP"
            : "SKIP";
  return {
    id: `${t.date}-${t.symbol}-${t.signal}`,
    date: t.date,
    side: t.signal === "BUY" ? "BUY" : t.signal === "SELL" ? "SELL" : "WAIT",
    entry: t.entry,
    stop: t.stop,
    target: t.target,
    exit: t.exit,
    outcome,
    pnl: t.pnl,
    mfe: null,
    mae: null,
    holdingTime: null,
    formulaVersion: formula,
    source: "backtest.functions",
    ambiguous: !!t.ambiguous,
    reasons: [],
    metadata: {},
  };
}

function shimResult(src: BacktestResult, formula: UnifiedFormulaId): HistoricalBacktestResult {
  const trades = src.trades
    .filter((t) => t.signal !== "WAIT")
    .map((t) => shimTrade(t, formula));
  const netPnl = trades.reduce((a, t) => a + t.pnl, 0);
  return {
    formulaVersion: formula,
    engineVersion: src.engineVersion,
    executionVersion: "n/a",
    cubeVersion: "n/a",
    policyVersion: "n/a",
    runId: src.runId,
    generatedAt: src.generatedAt,
    instrument: src.symbol,
    from: src.from,
    to: src.to,
    dataGranularity: "1d",
    source: src.executionMeta.dataSource,
    dataQuality: null,
    trades,
    stats: {},
    monthly: [],
    equityCurve: src.equityCurve.map((p) => ({ date: p.date, equity: p.cumulative })),
    drawdown: { max: src.summary.maxDrawdown, maxPct: 0 },
    benchmark: null,
    methodology: "shim",
    disclaimers: [],
    formulaMeta: { runId: src.runId, netPnl },
  };
}

// Slice a source BacktestResult by date range without recomputing anything.
function sliceResult(src: BacktestResult, from: string, to: string, formula: UnifiedFormulaId): HistoricalBacktestResult {
  const trades = src.trades.filter((t) => t.date >= from && t.date <= to && t.signal !== "WAIT").map((t) => shimTrade(t, formula));
  let eq = 0, peak = 0, dd = 0;
  for (const t of trades) { eq += t.pnl; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const netPnl = eq;
  return {
    formulaVersion: formula,
    engineVersion: src.engineVersion,
    executionVersion: "n/a",
    cubeVersion: "n/a",
    policyVersion: "n/a",
    runId: `${src.runId}:${from}:${to}`,
    generatedAt: src.generatedAt,
    instrument: src.symbol,
    from,
    to,
    dataGranularity: "1d",
    source: src.executionMeta.dataSource,
    dataQuality: null,
    trades,
    stats: {},
    monthly: [],
    equityCurve: src.equityCurve.filter((p) => p.date >= from && p.date <= to).map((p) => ({ date: p.date, equity: p.cumulative })),
    drawdown: { max: dd, maxPct: peak > 0 ? Math.round((dd / peak) * 10000) / 100 : 0 },
    benchmark: null,
    methodology: "shim-slice",
    disclaimers: [],
    formulaMeta: { runId: src.runId, netPnl, sliced: true },
  };
}

// -- Degradation classification (transparent thresholds).
export function classifyDegradation(pct: number, tradeCount: number):
  | "STABLE" | "MILD" | "MATERIAL" | "SEVERE" | "INSUFFICIENT_DATA" {
  if (tradeCount < 20) return "INSUFFICIENT_DATA";
  const a = Math.abs(pct);
  if (a <= 10) return "STABLE";
  if (a <= 25) return "MILD";
  if (a <= 50) return "MATERIAL";
  return "SEVERE";
}

type RunState = {
  selected: string[];
  splitMode: SplitMode;
  windowDays: number;
  stepDays: number;
  symbol: BacktestSymbol;
  from: string;
  to: string;
  minTrades: number;
};

type ProgressState = {
  strategy: string | null;
  windowIndex: number;
  windowTotal: number;
  strategyIndex: number;
  strategyTotal: number;
};

export default function ResearchPanel() {
  const call = useServerFn(runBacktest);

  const [cfg, setCfg] = useState<RunState>({
    selected: ["ASTRO::GANN_SIGN_DEGREE_TABLE_V1_1"],
    splitMode: "70_30",
    windowDays: 60,
    stepDays: 30,
    symbol: "NIFTY50",
    from: isoDaysAgo(365),
    to: todayIso(),
    minTrades: 20,
  });
  const [rows, setRows] = useState<StrategyResearchRow[] | null>(null);
  const [walkByStrategy, setWalkByStrategy] = useState<Record<string, WalkForwardResult>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [sortKey, setSortKey] = useState<"stability" | "vpf" | "vexp" | "dd" | "trades">("stability");
  const [tab, setTab] = useState<ResearchTab>("wf");

  const toggle = (key: string) => {
    setCfg((s) => ({
      ...s,
      selected: s.selected.includes(key)
        ? s.selected.filter((x) => x !== key)
        : [...s.selected, key],
    }));
  };

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setRows(null);
    setRunId(null);
    setWalkByStrategy({});
    try {
      const selected = STRATEGY_OPTIONS.filter(
        (o) => cfg.selected.includes(`${o.id}::${o.formula}`) && o.supported,
      );
      if (selected.length === 0) throw new Error("INSUFFICIENT_DATA · select at least one supported strategy.");
      const cache = new Map<UnifiedFormulaId, BacktestResult>();
      const newRows: StrategyResearchRow[] = [];
      const newWalks: Record<string, WalkForwardResult> = {};
      for (let i = 0; i < selected.length; i++) {
        const opt = selected[i];
        setProgress({ strategy: opt.label, windowIndex: 0, windowTotal: 0, strategyIndex: i, strategyTotal: selected.length });
        let src = cache.get(opt.formula);
        if (!src) {
          const isLegacy = opt.formula === ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1;
          const res = await call({
            data: isLegacy
              ? { symbol: cfg.symbol, from: cfg.from, to: cfg.to, astroFormulaVersion: ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1 }
              : { symbol: cfg.symbol, from: cfg.from, to: cfg.to },
          });
          src = res;
          cache.set(opt.formula, res);
        }
        const source: BacktestResult = src;
        const walk = await runWalkForward(
          { from: cfg.from, to: cfg.to, mode: cfg.splitMode, windowDays: cfg.windowDays, stepDays: cfg.stepDays },
          async (win, _phase, wi) => {
            setProgress((p) => p && { ...p, windowIndex: wi + 1, windowTotal: Math.max(p.windowTotal, wi + 1) });
            return sliceResult(source, win.from, win.to, opt.formula);
          },
        );
        const key = `${opt.id}::${opt.formula}`;
        newWalks[key] = walk;
        newRows.push(buildStrategyRow(opt.id, opt.label, walk));
      }
      const dataHash = `${cfg.symbol}:${cfg.from}:${cfg.to}`;
      const rid = computeResearchRunId({
        strategies: selected.map((s) => s.id),
        formula: selected[0].formula,
        splitMode: cfg.splitMode,
        trainingPct: cfg.splitMode === "70_30" ? 70 : cfg.splitMode === "60_40" ? 60 : cfg.splitMode === "80_20" ? 80 : 0,
        validationPct: cfg.splitMode === "70_30" ? 30 : cfg.splitMode === "60_40" ? 40 : cfg.splitMode === "80_20" ? 20 : 0,
        provider: "backtest.functions",
        dataHash,
        from: cfg.from,
        to: cfg.to,
      });
      setRunId(rid);
      setWalkByStrategy(newWalks);
      setRows(newRows);
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research run failed.");
    } finally {
      setRunning(false);
    }
  }, [running, cfg, call]);

  const comparison = useMemo(() => (rows ? buildResearchComparison(rows) : null), [rows]);
  const summary = useMemo(() => (comparison ? generateResearchSummary(comparison) : null), [comparison]);

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    const insufficient = rows.filter((r) => r.status === "INSUFFICIENT_DATA");
    const valid = rows.filter((r) => r.status !== "INSUFFICIENT_DATA");
    const cmp: Record<typeof sortKey, (a: StrategyResearchRow, b: StrategyResearchRow) => number> = {
      stability: (a, b) => b.stability.score - a.stability.score,
      vpf: (a, b) => (Number.isFinite(b.validation.profitFactor) ? b.validation.profitFactor : 1e9) - (Number.isFinite(a.validation.profitFactor) ? a.validation.profitFactor : 1e9),
      vexp: (a, b) => b.validation.expectancy - a.validation.expectancy,
      dd: (a, b) => b.validation.drawdown - a.validation.drawdown,
      trades: (a, b) => b.validation.tradeCount - a.validation.tradeCount,
    };
    return [...valid.sort(cmp[sortKey]), ...insufficient];
  }, [rows, sortKey]);

  const exportMatrixCsv = () => {
    if (!comparison) return;
    const csv = buildComparisonMatrixCsv(comparison);
    const header = `# Research Run ${runId} · ${cfg.symbol} · ${cfg.from} → ${cfg.to} · split=${cfg.splitMode}\n# RESEARCH ANALYSIS — NOT A LIVE TRADE RECOMMENDATION\n`;
    downloadBlob(header + csv, `research-matrix-${cfg.symbol}-${cfg.from}-${cfg.to}.csv`, "text/csv");
  };
  const exportJson = () => {
    if (!comparison || !summary || !runId) return;
    const payload = buildResearchJson({ version: "RESEARCH_V1", runId, comparison, summary });
    downloadBlob(payload, `research-${cfg.symbol}-${cfg.from}-${cfg.to}.json`, "application/json");
  };
  const exportWindowsCsv = () => {
    const lines: string[] = ["strategy,windowIndex,trainingFrom,trainingTo,validationFrom,validationTo,trainingTrades,validationTrades,trainingWR,validationWR,trainingPF,validationPF,trainingExpectancy,validationExpectancy,trainingDD,validationDD,pfDegradation,wrDegradation"];
    for (const [key, walk] of Object.entries(walkByStrategy)) {
      for (const w of walk.windows) {
        lines.push([
          key,
          w.window.index,
          w.window.training.from,
          w.window.training.to,
          w.window.validation.from,
          w.window.validation.to,
          w.trainingMetrics.tradeCount,
          w.validationMetrics.tradeCount,
          w.trainingMetrics.winRate,
          w.validationMetrics.winRate,
          Number.isFinite(w.trainingMetrics.profitFactor) ? w.trainingMetrics.profitFactor : "Infinity",
          Number.isFinite(w.validationMetrics.profitFactor) ? w.validationMetrics.profitFactor : "Infinity",
          w.trainingMetrics.expectancy,
          w.validationMetrics.expectancy,
          w.trainingMetrics.drawdown,
          w.validationMetrics.drawdown,
          Number.isFinite(w.degradation.profitFactor) ? w.degradation.profitFactor : "Infinity",
          Number.isFinite(w.degradation.winRate) ? w.degradation.winRate : "Infinity",
        ].join(","));
      }
    }
    downloadBlob(`# Research Run ${runId}\n` + lines.join("\n"), `research-windows-${cfg.from}-${cfg.to}.csv`, "text/csv");
  };

  return (
    <div>
      <section style={panel}>
        <div style={{ fontFamily: "var(--eb-head)", fontSize: 15, color: C.orange, marginBottom: 8, letterSpacing: 2 }}>
          🧪 RESEARCH LAB · WALK-FORWARD + OUT-OF-SAMPLE
        </div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginBottom: 12 }}>
          RESEARCH ANALYSIS — NOT A LIVE TRADE RECOMMENDATION
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={lbl}>Strategies</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {STRATEGY_OPTIONS.map((o) => {
                const key = `${o.id}::${o.formula}`;
                const active = cfg.selected.includes(key);
                return (
                  <button
                    key={key}
                    disabled={!o.supported}
                    onClick={() => toggle(key)}
                    title={o.note ?? ""}
                    style={{
                      ...chip,
                      background: active ? C.orange : "transparent",
                      color: active ? "#04140b" : o.supported ? C.text : C.muted,
                      opacity: o.supported ? 1 : 0.55,
                      cursor: o.supported ? "pointer" : "not-allowed",
                    }}
                  >
                    {o.label}{!o.supported ? " · unavailable" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={lbl}>Split Mode</div>
            <select value={cfg.splitMode} onChange={(e) => setCfg({ ...cfg, splitMode: e.target.value as SplitMode })} style={sel}>
              {SPLIT_MODES.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
            </select>
          </div>
          {(cfg.splitMode === "ROLLING" || cfg.splitMode === "EXPANDING") ? (
            <>
              <div>
                <div style={lbl}>Window (days)</div>
                <input type="number" min={5} value={cfg.windowDays} onChange={(e) => setCfg({ ...cfg, windowDays: Number(e.target.value) || 30 })} style={sel} />
              </div>
              <div>
                <div style={lbl}>Step (days)</div>
                <input type="number" min={1} value={cfg.stepDays} onChange={(e) => setCfg({ ...cfg, stepDays: Number(e.target.value) || 10 })} style={sel} />
              </div>
            </>
          ) : null}

          <div>
            <div style={lbl}>Instrument</div>
            <select value={cfg.symbol} onChange={(e) => setCfg({ ...cfg, symbol: e.target.value as BacktestSymbol })} style={sel}>
              {(Object.keys(BACKTEST_SYMBOLS) as BacktestSymbol[]).map((k) => (
                <option key={k} value={k}>{BACKTEST_SYMBOLS[k].label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={lbl}>From</div>
            <input type="date" value={cfg.from} onChange={(e) => setCfg({ ...cfg, from: e.target.value })} style={sel} />
          </div>
          <div>
            <div style={lbl}>To</div>
            <input type="date" value={cfg.to} onChange={(e) => setCfg({ ...cfg, to: e.target.value })} style={sel} />
          </div>
          <div>
            <div style={lbl}>Min Trades</div>
            <input type="number" min={5} value={cfg.minTrades} onChange={(e) => setCfg({ ...cfg, minTrades: Number(e.target.value) || 20 })} style={sel} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={run} disabled={running} style={{ ...btn, opacity: running ? 0.6 : 1, cursor: running ? "wait" : "pointer" }}>
              {running ? "Running Research…" : "▶ Run Research"}
            </button>
          </div>
        </div>

        {progress ? (
          <div style={{ marginTop: 10, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
            Strategy {progress.strategyIndex + 1}/{progress.strategyTotal} · {progress.strategy} · window {progress.windowIndex}/{progress.windowTotal} · {cfg.symbol} · {cfg.from} → {cfg.to}
          </div>
        ) : null}
        {error ? (
          <div style={{ marginTop: 10, color: C.red, fontFamily: "var(--eb-mono)", fontSize: 12 }}>{error}</div>
        ) : null}
      </section>

      {!rows && !running && !error ? (
        <section style={{ ...panel, textAlign: "center", color: C.muted, fontFamily: "var(--eb-mono)", fontSize: 13 }}>
          Select strategies and research settings, then run the Research Lab to validate walk-forward stability.
        </section>
      ) : null}

      {rows && comparison && summary ? (
        <>
          <ResearchTabs tab={tab} onChange={setTab} />
          {tab === "wf" ? (
          <>
          {/* Matrix */}
          <section style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange }}>RESEARCH MATRIX</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={lbl}>Sort</span>
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)} style={{ ...sel, width: "auto" }}>
                  <option value="stability">Stability</option>
                  <option value="vpf">Validation PF</option>
                  <option value="vexp">Validation Expectancy</option>
                  <option value="dd">Drawdown</option>
                  <option value="trades">Trade Count</option>
                </select>
                <button onClick={exportMatrixCsv} style={btnGhost}>Matrix CSV</button>
                <button onClick={exportJson} style={btnGhost}>Research JSON</button>
                <button onClick={exportWindowsCsv} style={btnGhost}>Windows CSV</button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: C.muted, textAlign: "left" }}>
                    {["Strategy","Formula","Train PF","Val PF","PF Δ","Train WR","Val WR","WR Δ","Train Exp","Val Exp","Max DD","Trades","Score","Status"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r, i) => (
                    <tr key={`${r.strategy}-${r.formula}-${i}`} style={{ borderBottom: `1px solid ${C.border}`, opacity: r.status === "INSUFFICIENT_DATA" ? 0.55 : 1 }}>
                      <td style={{ padding: "6px 8px" }}>{r.strategy}</td>
                      <td style={{ padding: "6px 8px" }}>{r.formula}</td>
                      <td style={{ padding: "6px 8px" }}>{fmt(r.training.profitFactor)}</td>
                      <td style={{ padding: "6px 8px" }}>{fmt(r.validation.profitFactor)}</td>
                      <td style={{ padding: "6px 8px", color: colorForPct(r.degradation.profitFactor) }}>{fmt(r.degradation.profitFactor)}%</td>
                      <td style={{ padding: "6px 8px" }}>{r.training.winRate}%</td>
                      <td style={{ padding: "6px 8px" }}>{r.validation.winRate}%</td>
                      <td style={{ padding: "6px 8px", color: colorForPct(r.degradation.winRate) }}>{fmt(r.degradation.winRate)}%</td>
                      <td style={{ padding: "6px 8px" }}>{r.training.expectancy}</td>
                      <td style={{ padding: "6px 8px" }}>{r.validation.expectancy}</td>
                      <td style={{ padding: "6px 8px", color: C.red }}>{r.validation.drawdown}</td>
                      <td style={{ padding: "6px 8px" }}>{r.validation.tradeCount}</td>
                      <td style={{ padding: "6px 8px", color: r.stability.score >= 65 ? C.green : r.stability.score >= 50 ? C.orange : C.red }}>{r.stability.score}</td>
                      <td style={{ padding: "6px 8px" }}>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Walk-forward windows */}
          <section style={panel}>
            <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>WALK-FORWARD WINDOWS</div>
            {Object.entries(walkByStrategy).map(([key, walk]) => (
              <WalkWindowsTable key={key} label={key} walk={walk} />
            ))}
          </section>

          {/* Stability breakdown */}
          <section style={panel}>
            <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>STABILITY BREAKDOWN</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
              {rows.map((r, i) => (
                <div key={`${r.strategy}-${i}`} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                  <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.text, marginBottom: 6 }}>{r.strategy} · {r.formula}</div>
                  <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginBottom: 6 }}>Score: <span style={{ color: C.orange }}>{r.stability.score}</span> · Status: {r.status}</div>
                  <table style={{ width: "100%", fontFamily: "var(--eb-mono)", fontSize: 10 }}>
                    <tbody>
                      {r.stability.factors.map((f) => (
                        <tr key={f.id}>
                          <td style={{ padding: "3px 4px", color: C.muted }}>{f.id}</td>
                          <td style={{ padding: "3px 4px", textAlign: "right" }}>{f.value}</td>
                          <td style={{ padding: "3px 4px", textAlign: "right", color: C.muted }}>×{f.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>

          {/* Degradation */}
          <section style={panel}>
            <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>DEGRADATION</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: C.muted, textAlign: "left" }}>
                    {["Strategy","PF Δ","WR Δ","Exp Δ","NetPnL Δ","DD Δ","Recovery Δ","Class"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const cls = classifyDegradation(r.degradation.netPnl, r.validation.tradeCount);
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "6px 8px" }}>{r.strategy}</td>
                        <td style={{ padding: "6px 8px" }}>{fmt(r.degradation.profitFactor)}%</td>
                        <td style={{ padding: "6px 8px" }}>{fmt(r.degradation.winRate)}%</td>
                        <td style={{ padding: "6px 8px" }}>{fmt(r.degradation.expectancy)}%</td>
                        <td style={{ padding: "6px 8px" }}>{fmt(r.degradation.netPnl)}%</td>
                        <td style={{ padding: "6px 8px" }}>{fmt(r.degradation.drawdown)}%</td>
                        <td style={{ padding: "6px 8px" }}>{fmt(r.degradation.recovery)}%</td>
                        <td style={{ padding: "6px 8px", color: cls === "STABLE" ? C.green : cls === "SEVERE" ? C.red : C.orange }}>{cls}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Summary */}
          <section style={panel}>
            <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>RESEARCH SUMMARY</div>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.text, display: "grid", gap: 6 }}>
              <div>Most stable: <span style={{ color: C.green }}>{summary.mostStable ?? "—"}</span></div>
              <div>Least stable: <span style={{ color: C.red }}>{summary.leastStable ?? "—"}</span></div>
              <div>Best validation expectancy: {summary.bestExpectancy ?? "—"}</div>
              <div>Worst validation drawdown: {summary.worstDrawdown ?? "—"}</div>
              <div>Largest degradation: {summary.largestDegradation ?? "—"}</div>
              <div>Highest consistency: {summary.highestConsistency ?? "—"}</div>
              {summary.strengths.length ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ color: C.muted }}>Strengths</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{summary.strengths.map((s, i) => (<li key={i}>{s}</li>))}</ul>
                </div>
              ) : null}
              {summary.weaknesses.length ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ color: C.muted }}>Weaknesses</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{summary.weaknesses.map((s, i) => (<li key={i}>{s}</li>))}</ul>
                </div>
              ) : null}
              <div style={{ marginTop: 8, color: C.muted, fontSize: 11 }}>
                RESEARCH ANALYSIS — NOT A LIVE TRADE RECOMMENDATION
              </div>
            </div>
          </section>

          {/* Run ID */}
          <section style={panel}>
            <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>RUN PROVENANCE</div>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.text, display: "grid", gap: 4 }}>
              <div>Research Run ID: <span style={{ color: C.blue }}>{runId}</span></div>
              <div>Split mode: {cfg.splitMode}</div>
              <div>Instrument: {cfg.symbol}</div>
              <div>Range: {cfg.from} → {cfg.to}</div>
              <div>Underlying Run IDs:</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {Object.entries(walkByStrategy).map(([k, w]) => (
                  <li key={k}>{k} · {w.windows[0]?.training.runId ?? "n/a"}</li>
                ))}
              </ul>
              <div>Generated: {new Date().toISOString()}</div>
            </div>
          </section>
          </>
          ) : null}

          <MonteCarloSection
            walkByStrategy={walkByStrategy}
            rows={rows}
            researchRunId={runId ?? "unknown"}
            instrument={cfg.symbol}
            from={cfg.from}
            to={cfg.to}
            tab={tab}
          />
        </>
      ) : null}
    </div>
  );
}

function WalkWindowsTable({ label, walk }: { label: string; walk: WalkForwardResult }) {
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const total = walk.windows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const view = walk.windows.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.text, marginBottom: 6 }}>{label} · {total} window{total === 1 ? "" : "s"}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
          <thead>
            <tr style={{ color: C.muted, textAlign: "left" }}>
              {["#","Training","Validation","Tr Trades","Val Trades","Tr WR","Val WR","Tr PF","Val PF","Tr Exp","Val Exp","Tr DD","Val DD","PF Δ"].map((h) => (
                <th key={h} style={{ padding: "4px 6px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((w) => (
              <tr key={w.window.index} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "4px 6px" }}>{w.window.index + 1}</td>
                <td style={{ padding: "4px 6px" }}>{w.window.training.from} → {w.window.training.to}</td>
                <td style={{ padding: "4px 6px" }}>{w.window.validation.from} → {w.window.validation.to}</td>
                <td style={{ padding: "4px 6px" }}>{w.trainingMetrics.tradeCount}</td>
                <td style={{ padding: "4px 6px" }}>{w.validationMetrics.tradeCount}</td>
                <td style={{ padding: "4px 6px" }}>{w.trainingMetrics.winRate}%</td>
                <td style={{ padding: "4px 6px" }}>{w.validationMetrics.winRate}%</td>
                <td style={{ padding: "4px 6px" }}>{fmt(w.trainingMetrics.profitFactor)}</td>
                <td style={{ padding: "4px 6px" }}>{fmt(w.validationMetrics.profitFactor)}</td>
                <td style={{ padding: "4px 6px" }}>{w.trainingMetrics.expectancy}</td>
                <td style={{ padding: "4px 6px" }}>{w.validationMetrics.expectancy}</td>
                <td style={{ padding: "4px 6px" }}>{w.trainingMetrics.drawdown}</td>
                <td style={{ padding: "4px 6px" }}>{w.validationMetrics.drawdown}</td>
                <td style={{ padding: "4px 6px", color: colorForPct(w.degradation.profitFactor) }}>{fmt(w.degradation.profitFactor)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
          <button style={btnGhost} onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Prev</button>
          <span style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>Page {page + 1} / {pages}</span>
          <button style={btnGhost} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>Next</button>
        </div>
      ) : null}
    </div>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  return n.toFixed(2);
}
function colorForPct(pct: number): string {
  if (!Number.isFinite(pct)) return C.muted;
  const a = Math.abs(pct);
  if (a <= 10) return C.green;
  if (a <= 25) return C.text;
  if (a <= 50) return C.orange;
  return C.red;
}

// Re-export a marker for tests to confirm lazy chunk boundary.
export const RESEARCH_PANEL_MARKER = "RESEARCH_V1_UI";

// ---------------------------------------------------------------------------
// Phase 21.6 · Stage 1 — Monte Carlo + Robustness section (additive UI only).

type MonteCarloUiConfig = {
  simulations: number;
  seed: number;
  samplingMode: MonteCarloSamplingMode;
  startingCapital: number;
  ruinDrawdownPct: number;
  blockSize: number;
};

// Exported for unit tests: caps simulation count to prevent runaway UI runs.
export const MONTE_CARLO_UI_MAX_SIMULATIONS = 2000;

export function MonteCarloSection({
  walkByStrategy,
  rows,
  researchRunId,
  instrument,
  from,
  to,
  tab = "mc",
}: {
  walkByStrategy: Record<string, WalkForwardResult>;
  rows: StrategyResearchRow[];
  researchRunId: string;
  instrument: string;
  from: string;
  to: string;
  tab?: ResearchTab;
}) {
  const [mcCfg, setMcCfg] = useState<MonteCarloUiConfig>({
    simulations: 500,
    seed: 42,
    samplingMode: "BOOTSTRAP",
    startingCapital: 100000,
    ruinDrawdownPct: 0.2,
    blockSize: 5,
  });
  const [selectedKey, setSelectedKey] = useState<string>(() => Object.keys(walkByStrategy)[0] ?? "");
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strategyKeys = Object.keys(walkByStrategy);

  const trades = useMemo(() => {
    const walk = walkByStrategy[selectedKey];
    if (!walk) return [] as { pnl: number }[];
    const out: { pnl: number }[] = [];
    for (const w of walk.windows) {
      for (const t of w.validation.trades) out.push({ pnl: t.pnl });
    }
    return out;
  }, [walkByStrategy, selectedKey]);

  const runMc = useCallback(() => {
    if (running) return;
    setRunning(true);
    setError(null);
    setMcResult(null);
    try {
      const sims = Math.min(MONTE_CARLO_UI_MAX_SIMULATIONS, Math.max(1, mcCfg.simulations));
      const ruin: RuinThreshold = { kind: "DRAWDOWN_PCT", value: mcCfg.ruinDrawdownPct };
      const r = runMonteCarlo(trades, {
        seed: mcCfg.seed,
        simulations: sims,
        startingCapital: mcCfg.startingCapital,
        samplingMode: mcCfg.samplingMode,
        blockSize: mcCfg.blockSize,
        ruin,
      });
      setMcResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Monte Carlo run failed.");
    } finally {
      setRunning(false);
    }
  }, [running, mcCfg, trades]);

  const mcRunId = useMemo(() => {
    if (!mcResult) return null;
    const baseRunId = walkByStrategy[selectedKey]?.windows[0]?.training.runId ?? "unknown";
    return computeMonteCarloRunId({
      baseRunId,
      researchRunId,
      seed: mcCfg.seed,
      simulations: mcResult.simulations,
      samplingMode: mcCfg.samplingMode,
      startingCapital: mcCfg.startingCapital,
      ruin: mcResult.ruin,
      tradeCount: mcResult.tradeCount,
    });
  }, [mcResult, walkByStrategy, selectedKey, researchRunId, mcCfg]);

  const robustness: RobustnessResult | null = useMemo(() => {
    if (!mcResult) return null;
    const row = rows.find((r) => `${r.strategy}::${r.formula}` === selectedKey);
    if (!row) return null;
    const dd = mcResult.maxDrawdown.p95 / Math.max(1, mcCfg.startingCapital);
    return computeRobustnessScore({
      walkForwardStability: row.stability.score / 100,
      oosConsistency: Math.max(0, 1 - Math.abs(row.degradation.profitFactor) / 100),
      monteCarloP5FinalEquity: mcResult.finalEquity.p5,
      monteCarloMedianFinalEquity: mcResult.finalEquity.p50,
      startingCapital: mcCfg.startingCapital,
      maxDrawdownPct: Math.min(1, dd),
      sensitivityClassification: "INSUFFICIENT_DATA",
      tradeCount: mcResult.tradeCount,
      profitFactorConsistency: Math.max(0, 1 - Math.abs(row.degradation.profitFactor) / 100),
    });
  }, [mcResult, rows, selectedKey, mcCfg.startingCapital]);

  const robustnessRunId = useMemo(() => {
    if (!robustness || !mcRunId) return null;
    return computeRobustnessRunId({ researchRunId, monteCarloRunId: mcRunId });
  }, [robustness, mcRunId, researchRunId]);

  const provenance: ExportProvenance = {
    researchRunId,
    monteCarloRunId: mcRunId ?? undefined,
    robustnessRunId: robustnessRunId ?? undefined,
    instrument,
    from,
    to,
    generatedAt: new Date().toISOString(),
  };

  const exportMcCsv = () => { if (mcResult) downloadBlob(buildMonteCarloCsv(mcResult, provenance), `monte-carlo-${instrument}-${from}-${to}.csv`, "text/csv"); };
  const exportMcJson = () => { if (mcResult) downloadBlob(buildMonteCarloJson(mcResult, provenance), `monte-carlo-${instrument}-${from}-${to}.json`, "application/json"); };
  const exportRobCsv = () => { if (robustness) downloadBlob(buildRobustnessCsv(robustness, provenance), `robustness-${instrument}-${from}-${to}.csv`, "text/csv"); };
  const exportRobJson = () => { if (robustness) downloadBlob(buildRobustnessJson(robustness, provenance), `robustness-${instrument}-${from}-${to}.json`, "application/json"); };

  const statusColor = !robustness ? C.muted
    : robustness.status === "ROBUST" ? C.green
      : robustness.status === "ACCEPTABLE" ? C.blue
        : robustness.status === "OVERFIT" ? C.orange
          : robustness.status === "FRAGILE" ? C.red : C.muted;

  return (
    <>
      {tab === "mc" ? (
      <section style={panel}>
        <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>MONTE CARLO ROBUSTNESS</div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginBottom: 10 }}>
          Resamples validation trades from the selected strategy. Deterministic for a given seed. RESEARCH ANALYSIS — NOT A LIVE TRADE RECOMMENDATION.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <div>
            <div style={lbl}>Strategy</div>
            <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} style={sel}>
              {strategyKeys.map((k) => (<option key={k} value={k}>{k}</option>))}
            </select>
          </div>
          <div>
            <div style={lbl}>Sampling</div>
            <select value={mcCfg.samplingMode} onChange={(e) => setMcCfg({ ...mcCfg, samplingMode: e.target.value as MonteCarloSamplingMode })} style={sel}>
              <option value="BOOTSTRAP">Bootstrap</option>
              <option value="SHUFFLE">Shuffle</option>
              <option value="BLOCK_BOOTSTRAP">Block bootstrap</option>
              <option value="PERTURB">Perturb</option>
            </select>
          </div>
          <div>
            <div style={lbl}>Simulations</div>
            <input type="number" min={10} max={MONTE_CARLO_UI_MAX_SIMULATIONS} value={mcCfg.simulations} onChange={(e) => setMcCfg({ ...mcCfg, simulations: Number(e.target.value) || 500 })} style={sel} />
          </div>
          <div>
            <div style={lbl}>Seed</div>
            <input type="number" value={mcCfg.seed} onChange={(e) => setMcCfg({ ...mcCfg, seed: Number(e.target.value) || 0 })} style={sel} />
          </div>
          <div>
            <div style={lbl}>Capital</div>
            <input type="number" min={1} value={mcCfg.startingCapital} onChange={(e) => setMcCfg({ ...mcCfg, startingCapital: Number(e.target.value) || 100000 })} style={sel} />
          </div>
          <div>
            <div style={lbl}>Ruin DD</div>
            <select value={mcCfg.ruinDrawdownPct} onChange={(e) => setMcCfg({ ...mcCfg, ruinDrawdownPct: Number(e.target.value) })} style={sel}>
              <option value={0.1}>10%</option>
              <option value={0.2}>20%</option>
              <option value={0.3}>30%</option>
              <option value={0.5}>50%</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={runMc} disabled={running || trades.length === 0} style={{ ...btn, opacity: running || trades.length === 0 ? 0.55 : 1 }}>
              {running ? "Running…" : "▶ Run Monte Carlo"}
            </button>
          </div>
        </div>
        {trades.length === 0 ? (
          <div style={{ marginTop: 8, color: C.muted, fontFamily: "var(--eb-mono)", fontSize: 11 }}>
            No validation trades available for the selected strategy.
          </div>
        ) : null}
        {error ? (<div style={{ marginTop: 8, color: C.red, fontFamily: "var(--eb-mono)", fontSize: 12 }}>{error}</div>) : null}

        {mcResult ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <McCard label="Probability of loss" value={`${(mcResult.probabilityOfLoss * 100).toFixed(1)}%`} accent={mcResult.probabilityOfLoss > 0.4 ? C.red : C.green} />
              <McCard label="Probability of ruin" value={`${(mcResult.probabilityOfRuin * 100).toFixed(1)}%`} accent={mcResult.probabilityOfRuin > 0.1 ? C.red : C.green} />
              <McCard label="Final equity · P5" value={mcResult.finalEquity.p5.toFixed(0)} />
              <McCard label="Final equity · P50" value={mcResult.finalEquity.p50.toFixed(0)} />
              <McCard label="Final equity · P95" value={mcResult.finalEquity.p95.toFixed(0)} />
              <McCard label="Max DD · P95" value={mcResult.maxDrawdown.p95.toFixed(0)} accent={C.red} />
            </div>
            <div style={{ marginTop: 10, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
              Ruin formula: {mcResult.ruinFormula} · Trades resampled: {mcResult.tradeCount}
            </div>
            <MonteCarloEquityFan result={mcResult} />
            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={exportMcCsv} style={btnGhost}>Monte Carlo CSV</button>
              <button onClick={exportMcJson} style={btnGhost}>Monte Carlo JSON</button>
            </div>
            <div style={{ marginTop: 12, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
              Monte Carlo Run ID: <span style={{ color: C.blue }}>{mcRunId}</span>
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {tab === "rob" && robustness ? (
        <section style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange }}>ROBUSTNESS SCORE</div>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12 }}>
              <span style={{ color: statusColor, marginRight: 8 }}>{robustness.status}</span>
              <span style={{ color: C.text }}>{(robustness.total * 100).toFixed(0)} / 100</span>
            </div>
          </div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginBottom: 8 }}>{robustness.reason}</div>
          {robustness.factors.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
                <thead>
                  <tr style={{ color: C.muted, textAlign: "left" }}>
                    {["Factor","Weight","Value","Score","Formula"].map((h) => (<th key={h} style={{ padding: "4px 6px", borderBottom: `1px solid ${C.border}` }}>{h}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {robustness.factors.map((f) => (
                    <tr key={f.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "4px 6px" }}>{f.key}</td>
                      <td style={{ padding: "4px 6px" }}>{f.weight}</td>
                      <td style={{ padding: "4px 6px" }}>{typeof f.value === "number" ? f.value.toFixed(2) : String(f.value)}</td>
                      <td style={{ padding: "4px 6px", color: f.score >= 0.7 ? C.green : f.score >= 0.4 ? C.orange : C.red }}>{f.score.toFixed(2)}</td>
                      <td style={{ padding: "4px 6px", color: C.muted }}>{f.formula}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={exportRobCsv} style={btnGhost}>Robustness CSV</button>
            <button onClick={exportRobJson} style={btnGhost}>Robustness JSON</button>
          </div>
          <div style={{ marginTop: 8, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
            Robustness Run ID: <span style={{ color: C.blue }}>{robustnessRunId}</span>
          </div>
        </section>
      ) : null}

      {tab === "rob" && !robustness ? (
        <section style={panel}>
          <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>ROBUSTNESS SCORE</div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.muted }}>
            Run Monte Carlo first to compute the composite robustness score for the selected strategy.
          </div>
        </section>
      ) : null}

      {tab === "sens" ? <SensitivitySection instrument={instrument} /> : null}
      {tab === "cx" ? (
        <CrossAssetSection
          rows={rows}
          researchRunId={researchRunId}
          instrument={instrument}
          from={from}
          to={to}
        />
      ) : null}
      {tab === "batch" ? <BatchSection /> : null}
    </>
  );
}

function McCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 16, color: accent ?? C.text, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 21.6 · Stage 3 — Research sub-tabs, Monte Carlo equity-fan chart,
// Sensitivity scaffold with typed empty state. UI only — no engine here.

type ResearchTab = "wf" | "mc" | "sens" | "rob" | "cx" | "batch";
const RESEARCH_TABS: readonly { id: ResearchTab; label: string }[] = [
  { id: "wf", label: "Walk-Forward" },
  { id: "mc", label: "Monte Carlo" },
  { id: "sens", label: "Sensitivity" },
  { id: "rob", label: "Robustness" },
  { id: "cx", label: "Cross-Asset" },
  { id: "batch", label: "Research Batch" },
];

export const RESEARCH_TABS_MARKER = "RESEARCH_TABS_V1";

function ResearchTabs({ tab, onChange }: { tab: ResearchTab; onChange: (t: ResearchTab) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Research sub-tabs"
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: 12,
        borderBottom: `1px solid ${C.border}`,
        paddingBottom: 8,
      }}
    >
      {RESEARCH_TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            style={{
              ...chip,
              background: active ? C.orange : "transparent",
              color: active ? "#04140b" : C.text,
              fontWeight: active ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function MonteCarloEquityFan({
  result,
}: {
  result: {
    readonly percentileEquityCurves: {
      readonly p5: readonly number[];
      readonly p50: readonly number[];
      readonly p95: readonly number[];
    };
    readonly worstPath: readonly number[];
    readonly medianPath: readonly number[];
    readonly bestPath: readonly number[];
  };
}) {
  const [pathSel, setPathSel] = useState<"none" | "worst" | "median" | "best">("none");
  const series = useMemo(() => {
    const base = [
      { name: "P95", data: [...result.percentileEquityCurves.p95] },
      { name: "P50", data: [...result.percentileEquityCurves.p50] },
      { name: "P5", data: [...result.percentileEquityCurves.p5] },
    ];
    if (pathSel === "worst") base.push({ name: "Worst path", data: [...result.worstPath] });
    else if (pathSel === "median") base.push({ name: "Median path", data: [...result.medianPath] });
    else if (pathSel === "best") base.push({ name: "Best path", data: [...result.bestPath] });
    return base;
  }, [result, pathSel]);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={lbl}>Equity Fan (P5 / P50 / P95)</span>
        <select
          value={pathSel}
          onChange={(e) => setPathSel(e.target.value as "none" | "worst" | "median" | "best")}
          style={{ ...sel, width: "auto" }}
          aria-label="Overlay path"
        >
          <option value="none">No overlay</option>
          <option value="worst">Worst path</option>
          <option value="median">Median path</option>
          <option value="best">Best path</option>
        </select>
      </div>
      <ApexChart
        type="line"
        series={series}
        options={{
          chart: { id: "mc-equity-fan", toolbar: { show: false }, animations: { enabled: false }, background: "transparent" },
          stroke: { curve: "smooth", width: 2 },
          xaxis: { labels: { show: false }, axisTicks: { show: false } },
          yaxis: { labels: { style: { colors: "var(--eb-muted)" } } },
          grid: { borderColor: "var(--eb-border)" },
          legend: { labels: { colors: "var(--eb-text)" } },
          tooltip: { theme: "dark" },
          dataLabels: { enabled: false },
        }}
        height={220}
      />
    </div>
  );
}

type SensitivityStrategy = "SMC_V1" | "ASTRO_SMC_HYBRID_V1";
type SensitivityMode = "1D" | "2D";

type SensitivityAxisState = { name: string; min: number; max: number; step: number };

type SensitivityRunOutcome = {
  readonly runId: string;
  readonly cells: readonly SensitivityCell[];
  readonly surface: SensitivitySurface | null;
  readonly partial: boolean;
  readonly grid: readonly ParameterSpec[];
  readonly counters: Readonly<Record<string, number>>;
  readonly strategy: SensitivityStrategy;
  readonly errorCode?: SensitivityUiErrorCode;
  readonly errorMessage?: string;
};

function buildCacheKey(input: {
  baseRunId: string;
  dataHash: string;
  strategy: string;
  grid: readonly ParameterSpec[];
  normalize: boolean;
  mc: boolean;
}): string {
  const g = input.grid.map((s) => `${s.name}:${s.min}:${s.max}:${s.step}`).join(",");
  return [input.strategy, input.baseRunId, input.dataHash, g, input.normalize ? "n" : "r", input.mc ? "1" : "0"].join("|");
}

function SensitivitySection({ instrument }: { instrument: string }) {
  const payload = useResearchPayload();
  const [strategy, setStrategy] = useState<SensitivityStrategy>("SMC_V1");
  const [mode, setMode] = useState<SensitivityMode>("1D");
  const [axisA, setAxisA] = useState<SensitivityAxisState>({ name: "minScore", min: 40, max: 80, step: 10 });
  const [axisB, setAxisB] = useState<SensitivityAxisState>({ name: "rr", min: 1, max: 3, step: 0.5 });
  const [normalizeWeights, setNormalizeWeights] = useState(true);
  const [includeMonteCarlo, setIncludeMonteCarlo] = useState(false);
  const [metric, setMetric] = useState<"profitFactor" | "expectancy" | "netPnl" | "maxDrawdown" | "stabilityScore">(
    "expectancy",
  );
  const [outcome, setOutcome] = useState<SensitivityRunOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; current: string; startedAt: number } | null>(null);
  const [selectedCellIdx, setSelectedCellIdx] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, SensitivityRunOutcome>>(new Map());

  // Auto-align strategy with published payload strategy for clarity.
  useEffect(() => {
    if (!payload) return;
    setStrategy((s) => (s === payload.strategy ? s : payload.strategy));
  }, [payload]);

  const allowedKeys: readonly string[] = useMemo(() => {
    const smc = SMC_PARAMETER_KEYS as readonly string[];
    if (strategy === "SMC_V1") return smc;
    return [...HYBRID_PARAMETER_KEYS, "smcMinScore"] as readonly string[];
  }, [strategy]);

  const specs: ParameterSpec[] = useMemo(() => {
    const list: ParameterSpec[] = [{ name: axisA.name, min: axisA.min, max: axisA.max, step: axisA.step }];
    if (mode === "2D") list.push({ name: axisB.name, min: axisB.min, max: axisB.max, step: axisB.step });
    return list;
  }, [axisA, axisB, mode]);

  const cells = estimateGridCells(specs);
  const validation = validateSensitivityGrid(specs);

  const canRun = !!payload && validation.ok && !running;

  const buildProvenance = useCallback(
    (o: SensitivityRunOutcome, p: PublishedResearchPayload): SensitivityExportProvenance => ({
      researchRunId: o.runId,
      baseRunId: p.baseRunId,
      sensitivityRunId: o.runId,
      strategy: o.strategy,
      formulaVersion: p.formulaVersion,
      provider: p.provider,
      dataHash: p.dataHash,
      requestedRange: p.requestedRange,
      actualRange: p.actualRange,
      timeframe: String(p.timeframe),
      timezone: p.timezone,
      costs: p.costs,
      grid: o.grid.map((g) => ({ name: g.name, min: g.min, max: g.max, step: g.step })),
      normalizeWeights: normalizeWeights && o.strategy === "ASTRO_SMC_HYBRID_V1",
      includeMonteCarlo,
      counters: o.counters,
      dataQuality: p.dataQuality,
      classification: o.surface?.classification ?? "INSUFFICIENT_DATA",
      partial: o.partial,
      generatedAt: new Date().toISOString(),
    }),
    [normalizeWeights, includeMonteCarlo],
  );

  const runNow = useCallback(async () => {
    if (!payload || !validation.ok || running) return;
    const cacheKey = buildCacheKey({
      baseRunId: payload.baseRunId,
      dataHash: payload.dataHash,
      strategy,
      grid: specs,
      normalize: normalizeWeights,
      mc: includeMonteCarlo,
    });
    const cached = cacheRef.current.get(cacheKey);
    if (cached && !cached.partial) {
      setOutcome(cached);
      return;
    }

    setRunning(true);
    setOutcome(null);
    setSelectedCellIdx(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const counters = createComputeCounters();
    const started = Date.now();
    const combos: { readonly [k: string]: number }[] = [];
    // Build combos deterministically (same as generateParameterGrid, minus classification).
    {
      const axes = specs.map((s) => {
        const vals: number[] = [];
        for (let v = s.min; v <= s.max + 1e-9; v += s.step) vals.push(Number(v.toFixed(6)));
        return { name: s.name, values: vals };
      });
      const cursor = new Array<number>(axes.length).fill(0);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const combo: Record<string, number> = {};
        for (let i = 0; i < axes.length; i++) combo[axes[i].name] = axes[i].values[cursor[i]];
        combos.push(combo);
        let k = axes.length - 1;
        while (k >= 0) {
          cursor[k]++;
          if (cursor[k] < axes[k].values.length) break;
          cursor[k] = 0;
          k--;
        }
        if (k < 0) break;
      }
    }

    setProgress({ completed: 0, total: combos.length, current: "", startedAt: started });

    try {
      const runId = computeSensitivityRunId({
        baseRunId: payload.baseRunId,
        strategy,
        formula: payload.formulaVersion,
        grid: specs,
        from: payload.actualRange.from,
        to: payload.actualRange.to,
        dataHash: payload.dataHash,
      });
      const onProgress = (completed: number, total: number, current: Record<string, number>) => {
        setProgress({ completed, total, current: JSON.stringify(current), startedAt: started });
      };

      let result: { cells: SensitivityCell[]; partial: boolean };
      if (strategy === "SMC_V1") {
        result = await runSmcSensitivity(payload, combos, counters, {
          signal: controller.signal,
          onProgress,
        });
      } else {
        if (!payload.astroByDate) {
          throw new SensitivityExecutionError(
            "INSUFFICIENT_DATA",
            "Hybrid sensitivity requires astro payload — run the Hybrid backtest first.",
          );
        }
        const hybridResult = await runHybridSensitivity(payload, combos, counters, {
          signal: controller.signal,
          onProgress,
          astroByDate: payload.astroByDate,
          astroFormulaVersion: payload.formulaVersion,
          normalizeWeights,
          dataQualityPct: payload.dataQuality.coveragePct,
        });
        result = hybridResult;
      }

      const partial = result.partial || controller.signal.aborted;
      const surface = classifySensitivitySurface(result.cells, metric === "stabilityScore" ? "stabilityScore" : metric);
      const outc: SensitivityRunOutcome = {
        runId,
        cells: result.cells,
        surface,
        partial,
        grid: specs,
        counters: {
          providerLoadCount: counters.providerLoadCount,
          dataQualityCount: counters.dataQualityCount,
          astroComputeCount: counters.astroComputeCount,
          smcStructureComputeCount: counters.smcStructureComputeCount,
          smcSignalComputeCount: counters.smcSignalComputeCount,
          executionCount: counters.executionCount,
        },
        strategy,
      };
      cacheRef.current.set(cacheKey + (partial ? ":partial" : ""), outc);
      setOutcome(outc);
    } catch (e) {
      const err = e instanceof SensitivityExecutionError ? e : null;
      setOutcome({
        runId: "",
        cells: [],
        surface: null,
        partial: false,
        grid: specs,
        counters: {},
        strategy,
        errorCode: (err?.code as SensitivityUiErrorCode | undefined) ?? "INVALID_PARAMETER_GRID",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
      setProgress(null);
      abortRef.current = null;
    }
  }, [payload, validation.ok, running, strategy, specs, normalizeWeights, includeMonteCarlo, metric]);

  const cancel = () => {
    abortRef.current?.abort();
  };

  // Re-classify with selected metric without rerunning.
  const classifiedSurface = useMemo(() => {
    if (!outcome || outcome.cells.length === 0) return null;
    return classifySensitivitySurface(outcome.cells, metric === "stabilityScore" ? "stabilityScore" : metric);
  }, [outcome, metric]);

  const chartSeries = useMemo(() => {
    if (!outcome) return [];
    if (outcome.grid.length === 1) {
      const name = outcome.grid[0].name;
      const data = outcome.cells.map((c) => ({
        x: c.params[name],
        y: c.metrics ? Number(c.metrics[metric]) : null,
      }));
      return [{ name: metric, data }];
    }
    // 2D → heatmap series (Y axis = axis B, each series = one Y value).
    const [ax, ay] = outcome.grid;
    const ys = new Set<number>();
    for (const c of outcome.cells) ys.add(c.params[ay.name]);
    const sortedY = [...ys].sort((a, b) => a - b);
    return sortedY.map((yv) => ({
      name: `${ay.name}=${yv}`,
      data: outcome.cells
        .filter((c) => c.params[ay.name] === yv)
        .sort((a, b) => a.params[ax.name] - b.params[ax.name])
        .map((c) => ({ x: String(c.params[ax.name]), y: c.metrics ? Number(c.metrics[metric]) : 0 })),
    }));
  }, [outcome, metric]);

  const exportCells = () => {
    if (!outcome || !payload) return;
    const prov = buildProvenance(outcome, payload);
    const csv = buildSensitivityCellsCsv(outcome.cells, prov);
    downloadBlob(csv, `sensitivity-cells-${instrument}-${payload.actualRange.from}-${payload.actualRange.to}.csv`, "text/csv");
  };
  const exportMatrix = () => {
    if (!outcome || !payload) return;
    const prov = buildProvenance(outcome, payload);
    const csv = buildSensitivityMatrixCsv(outcome.cells, prov, metric === "stabilityScore" ? "expectancy" : metric);
    downloadBlob(csv, `sensitivity-matrix-${instrument}-${payload.actualRange.from}-${payload.actualRange.to}.csv`, "text/csv");
  };
  const exportJson = () => {
    if (!outcome || !payload) return;
    const prov = buildProvenance(outcome, payload);
    const json = buildSensitivityJson(outcome.cells, classifiedSurface, prov);
    downloadBlob(json, `sensitivity-${instrument}-${payload.actualRange.from}-${payload.actualRange.to}.json`, "application/json");
  };
  const exportBundle = () => {
    if (!outcome || !payload) return;
    const bundle = buildResearchBundleJson({
      context: payload,
      researchRunId: outcome.runId,
      sensitivity: {
        runId: outcome.runId,
        cells: outcome.cells,
        surface: classifiedSurface,
        grid: outcome.grid.map((g) => ({ name: g.name, min: g.min, max: g.max, step: g.step })),
        partial: outcome.partial,
        counters: outcome.counters,
      },
    });
    downloadBlob(bundle, `research-bundle-${instrument}-${payload.actualRange.from}-${payload.actualRange.to}.json`, "application/json");
  };

  return (
    <section style={panel}>
      <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>
        PARAMETER SENSITIVITY · {instrument}
      </div>
      {!payload ? (
        <div
          style={{
            fontFamily: "var(--eb-mono)",
            fontSize: 11,
            color: C.orange,
            border: `1px solid ${C.orange}`,
            borderRadius: 6,
            padding: 10,
            marginBottom: 12,
          }}
          role="alert"
          aria-live="polite"
        >
          {SENSITIVITY_UI_ERROR_LABEL.RESEARCH_PAYLOAD_MISSING} — RESEARCH_PAYLOAD_MISSING. Open the SMC or Hybrid Backtest panel, run it once with valid data, and return here.
        </div>
      ) : (
        <PayloadSummary payload={payload} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <div>
          <div style={lbl}>Strategy</div>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as SensitivityStrategy)} style={sel}>
            <option value="SMC_V1">SMC_V1</option>
            <option value="ASTRO_SMC_HYBRID_V1">ASTRO_SMC_HYBRID_V1</option>
          </select>
        </div>
        <div>
          <div style={lbl}>Mode</div>
          <select value={mode} onChange={(e) => setMode(e.target.value as SensitivityMode)} style={sel}>
            <option value="1D">Single-parameter sweep</option>
            <option value="2D">Two-parameter grid</option>
          </select>
        </div>
        <AxisEditor label="Parameter A" axis={axisA} onChange={setAxisA} options={allowedKeys} />
        {mode === "2D" ? (
          <AxisEditor label="Parameter B" axis={axisB} onChange={setAxisB} options={allowedKeys} />
        ) : null}
        <div>
          <div style={lbl}>Normalize Hybrid Weights</div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={normalizeWeights}
              onChange={(e) => setNormalizeWeights(e.target.checked)}
              disabled={strategy !== "ASTRO_SMC_HYBRID_V1"}
            />
            <span style={{ color: strategy === "ASTRO_SMC_HYBRID_V1" ? C.text : C.muted }}>
              {normalizeWeights ? "normalized" : "raw weights"}
            </span>
          </label>
        </div>
        <div>
          <div style={lbl}>Include Monte Carlo</div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
            <input type="checkbox" checked={includeMonteCarlo} onChange={(e) => setIncludeMonteCarlo(e.target.checked)} />
            <span>{includeMonteCarlo ? "per-cell MC on" : "per-cell MC off"}</span>
          </label>
        </div>
        <div>
          <div style={lbl}>Metric</div>
          <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} style={sel}>
            <option value="expectancy">Expectancy</option>
            <option value="profitFactor">Profit Factor</option>
            <option value="netPnl">Net PnL</option>
            <option value="maxDrawdown">Max Drawdown</option>
            <option value="stabilityScore">Stability</option>
          </select>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
          fontFamily: "var(--eb-mono)",
          fontSize: 11,
        }}
      >
        <div>
          <div style={lbl}>Estimated Cells</div>
          <div style={{ color: cells > RESEARCH_UI_MAX_CELLS ? C.red : C.text }}>{cells} / {RESEARCH_UI_MAX_CELLS}</div>
        </div>
        <div>
          <div style={lbl}>Grid Status</div>
          <div style={{ color: validation.ok ? C.green : C.red }}>{validation.ok ? "OK" : validation.code}</div>
        </div>
        <div>
          <div style={lbl}>Effective A</div>
          <div style={{ color: C.muted }}>{axisA.name} · {axisA.min}→{axisA.max} step {axisA.step}</div>
        </div>
        {mode === "2D" ? (
          <div>
            <div style={lbl}>Effective B</div>
            <div style={{ color: C.muted }}>{axisB.name} · {axisB.min}→{axisB.max} step {axisB.step}</div>
          </div>
        ) : null}
      </div>

      {!validation.ok ? (
        <div style={{ marginTop: 10, color: C.red, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
          {validation.code}: {validation.message}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          onClick={runNow}
          disabled={!canRun}
          style={{ ...btn, opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }}
        >
          {running ? "Running…" : "▶ Run Sensitivity"}
        </button>
        <button onClick={cancel} disabled={!running} style={{ ...btnGhost, opacity: running ? 1 : 0.5 }}>
          Cancel
        </button>
      </div>

      {progress ? (
        <SensitivityProgress progress={progress} />
      ) : null}

      {outcome && outcome.errorCode ? (
        <div style={{ marginTop: 10, color: C.red, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
          {outcome.errorCode}: {outcome.errorMessage}
        </div>
      ) : null}

      {outcome && outcome.cells.length > 0 ? (
        <SensitivityResults
          outcome={outcome}
          surface={classifiedSurface}
          metric={metric}
          chartSeries={chartSeries}
          selectedCellIdx={selectedCellIdx}
          onSelectCell={setSelectedCellIdx}
          exportCells={exportCells}
          exportMatrix={exportMatrix}
          exportJson={exportJson}
          exportBundle={exportBundle}
        />
      ) : null}
    </section>
  );
}

function AxisEditor({
  label,
  axis,
  onChange,
  options,
}: {
  label: string;
  axis: SensitivityAxisState;
  onChange: (a: SensitivityAxisState) => void;
  options: readonly string[];
}) {
  return (
    <div>
      <div style={lbl}>{label}</div>
      <select value={axis.name} onChange={(e) => onChange({ ...axis, name: e.target.value })} style={sel} aria-label={`${label} parameter`}>
        {options.map((k) => (<option key={k} value={k}>{k}</option>))}
      </select>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginTop: 4 }}>
        <input type="number" value={axis.min} onChange={(e) => onChange({ ...axis, min: Number(e.target.value) })} style={sel} aria-label={`${label} min`} />
        <input type="number" value={axis.max} onChange={(e) => onChange({ ...axis, max: Number(e.target.value) })} style={sel} aria-label={`${label} max`} />
        <input type="number" value={axis.step} onChange={(e) => onChange({ ...axis, step: Number(e.target.value) })} style={sel} aria-label={`${label} step`} />
      </div>
    </div>
  );
}

function PayloadSummary({ payload }: { payload: PublishedResearchPayload }) {
  const bad = payload.dataQuality.status === "FAIL";
  return (
    <div
      style={{
        marginBottom: 12,
        border: `1px solid ${bad ? C.red : C.border}`,
        borderRadius: 6,
        padding: 10,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 6,
        fontFamily: "var(--eb-mono)",
        fontSize: 11,
      }}
    >
      <div><span style={{ color: C.muted }}>Instrument</span> {payload.instrument}</div>
      <div><span style={{ color: C.muted }}>Timeframe</span> {String(payload.timeframe)}</div>
      <div><span style={{ color: C.muted }}>Provider</span> {payload.provider}</div>
      <div><span style={{ color: C.muted }}>Range</span> {payload.actualRange.from} → {payload.actualRange.to}</div>
      <div><span style={{ color: C.muted }}>Candles</span> {payload.candles.length}</div>
      <div><span style={{ color: C.muted }}>Data Hash</span> {payload.dataHash}</div>
      <div>
        <span style={{ color: C.muted }}>Data Quality</span>{" "}
        <span style={{ color: bad ? C.red : payload.dataQuality.status === "DEGRADED" ? C.orange : C.green }}>
          {payload.dataQuality.status} · {payload.dataQuality.coveragePct}%
        </span>
      </div>
      <div style={{ gridColumn: "1 / -1", color: C.muted, wordBreak: "break-all" }}>
        Base Run ID: <span style={{ color: C.blue }}>{payload.baseRunId}</span> · Strategy: {payload.strategy}
      </div>
    </div>
  );
}

function SensitivityProgress({
  progress,
}: {
  progress: { completed: number; total: number; current: string; startedAt: number };
}) {
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const elapsedMs = Date.now() - progress.startedAt;
  const perCell = progress.completed > 0 ? elapsedMs / progress.completed : 0;
  const remainingMs = perCell > 0 ? (progress.total - progress.completed) * perCell : 0;
  return (
    <div style={{ marginTop: 10, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
      Cell {progress.completed}/{progress.total} · {pct}% · elapsed {Math.round(elapsedMs / 1000)}s · eta {Math.round(remainingMs / 1000)}s
      <div style={{ marginTop: 4, height: 4, background: C.border, borderRadius: 2 }}>
        <div style={{ height: "100%", background: C.orange, width: `${pct}%`, borderRadius: 2 }} />
      </div>
      <div style={{ marginTop: 4, wordBreak: "break-all" }}>current: {progress.current}</div>
    </div>
  );
}

function SensitivityResults({
  outcome,
  surface,
  metric,
  chartSeries,
  selectedCellIdx,
  onSelectCell,
  exportCells,
  exportMatrix,
  exportJson,
  exportBundle,
}: {
  outcome: SensitivityRunOutcome;
  surface: SensitivitySurface | null;
  metric: string;
  chartSeries: { name: string; data: { x: string | number; y: number | null }[] }[];
  selectedCellIdx: number | null;
  onSelectCell: (i: number | null) => void;
  exportCells: () => void;
  exportMatrix: () => void;
  exportJson: () => void;
  exportBundle: () => void;
}) {
  const valid = outcome.cells.filter((c) => c.metrics !== null);
  const invalid = outcome.cells.length - valid.length;
  const chartType: "line" | "heatmap" = outcome.grid.length === 1 ? "line" : "heatmap";
  const selected = selectedCellIdx !== null ? outcome.cells[selectedCellIdx] ?? null : null;

  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
          fontFamily: "var(--eb-mono)",
          fontSize: 11,
          marginBottom: 8,
        }}
      >
        <div><span style={{ color: C.muted }}>Cells</span> {outcome.cells.length}</div>
        <div><span style={{ color: C.muted }}>Valid</span> {valid.length}</div>
        <div><span style={{ color: C.muted }}>Insufficient</span> {invalid}</div>
        <div><span style={{ color: C.muted }}>Classification</span> {surface?.classification ?? "n/a"}</div>
        <div><span style={{ color: C.muted }}>Partial</span> {outcome.partial ? "YES" : "no"}</div>
        <div><span style={{ color: C.muted }}>Executions</span> {outcome.counters.executionCount ?? 0}</div>
        <div>
          <span style={{ color: C.muted }}>Provider fetches</span>{" "}
          <span style={{ color: (outcome.counters.providerLoadCount ?? 0) === 0 ? C.green : C.red }}>
            {outcome.counters.providerLoadCount ?? 0}
          </span>
        </div>
        <div>
          <span style={{ color: C.muted }}>DQ recomputes</span>{" "}
          <span style={{ color: (outcome.counters.dataQualityCount ?? 0) === 0 ? C.green : C.red }}>
            {outcome.counters.dataQualityCount ?? 0}
          </span>
        </div>
      </div>

      {surface?.reason ? (
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginBottom: 8 }}>{surface.reason}</div>
      ) : null}

      <ApexChart
        type={chartType}
        series={chartSeries}
        options={{
          chart: { id: "sensitivity", toolbar: { show: false }, animations: { enabled: false }, background: "transparent" },
          dataLabels: { enabled: chartType === "heatmap" },
          xaxis: { labels: { style: { colors: "var(--eb-muted)" } }, title: { text: outcome.grid[0]?.name ?? "" } },
          yaxis: { labels: { style: { colors: "var(--eb-muted)" } }, title: { text: chartType === "line" ? metric : outcome.grid[1]?.name ?? "" } },
          stroke: chartType === "line" ? { curve: "smooth", width: 2 } : undefined,
          markers: chartType === "line" ? { size: 4 } : undefined,
          legend: { labels: { colors: "var(--eb-text)" } },
          tooltip: { theme: "dark" },
          grid: { borderColor: "var(--eb-border)" },
          plotOptions: chartType === "heatmap" ? { heatmap: { shadeIntensity: 0.5, radius: 0, useFillColorAsStroke: false, colorScale: { ranges: [] } } } : undefined,
        }}
        height={280}
      />

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
          <thead>
            <tr style={{ color: C.muted, textAlign: "left" }}>
              {[...outcome.grid.map((g) => g.name), "trades", "PF", "Exp", "NetPnL", "DD", "Stability", "OOS", metric === "stabilityScore" ? "score" : metric, "status"].map((h) => (
                <th key={h} style={{ padding: "4px 6px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outcome.cells.map((c, i) => {
              const m = c.metrics;
              const isSel = i === selectedCellIdx;
              return (
                <tr
                  key={i}
                  onClick={() => onSelectCell(i)}
                  style={{ borderBottom: `1px solid ${C.border}`, background: isSel ? "rgba(255,140,0,0.08)" : "transparent", cursor: "pointer", opacity: m ? 1 : 0.55 }}
                >
                  {outcome.grid.map((g) => (
                    <td key={g.name} style={{ padding: "4px 6px" }}>{c.params[g.name]}</td>
                  ))}
                  <td style={{ padding: "4px 6px" }}>{m?.trades ?? "—"}</td>
                  <td style={{ padding: "4px 6px" }}>{m ? fmt(m.profitFactor) : "—"}</td>
                  <td style={{ padding: "4px 6px" }}>{m ? m.expectancy : "—"}</td>
                  <td style={{ padding: "4px 6px" }}>{m ? m.netPnl : "—"}</td>
                  <td style={{ padding: "4px 6px" }}>{m ? m.maxDrawdown : "—"}</td>
                  <td style={{ padding: "4px 6px" }}>{m?.stabilityScore ?? "—"}</td>
                  <td style={{ padding: "4px 6px" }}>{m?.oosScore ?? "—"}</td>
                  <td style={{ padding: "4px 6px" }}>{m ? String(m[metric as keyof typeof m] ?? "—") : "—"}</td>
                  <td style={{ padding: "4px 6px", color: m ? C.green : C.muted }}>{m ? "VALID" : c.reason ?? "INSUFFICIENT"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div style={{ marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.orange, marginBottom: 6 }}>Cell Details</div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6 }}>
            {Object.entries(selected.params).map(([k, v]) => (
              <div key={k}><span style={{ color: C.muted }}>{k}</span> {v}</div>
            ))}
            {selected.metrics ? (
              <>
                <div><span style={{ color: C.muted }}>Trades</span> {selected.metrics.trades}</div>
                <div><span style={{ color: C.muted }}>Win Rate</span> {(selected.metrics.winRate * 100).toFixed(1)}%</div>
                <div><span style={{ color: C.muted }}>PF</span> {fmt(selected.metrics.profitFactor)}</div>
                <div><span style={{ color: C.muted }}>Expectancy</span> {selected.metrics.expectancy}</div>
                <div><span style={{ color: C.muted }}>Net PnL</span> {selected.metrics.netPnl}</div>
                <div><span style={{ color: C.muted }}>Max DD</span> {selected.metrics.maxDrawdown}</div>
                <div><span style={{ color: C.muted }}>Recovery</span> {fmt(selected.metrics.recoveryFactor)}</div>
                <div><span style={{ color: C.muted }}>Stability</span> {selected.metrics.stabilityScore}</div>
                <div><span style={{ color: C.muted }}>OOS</span> {selected.metrics.oosScore}</div>
                <div><span style={{ color: C.muted }}>MC p5</span> {selected.metrics.monteCarloP5}</div>
              </>
            ) : (
              <div style={{ gridColumn: "1 / -1", color: C.red }}>{selected.reason ?? "INSUFFICIENT_DATA"}</div>
            )}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={exportCells} style={btnGhost}>Cells CSV</button>
        <button onClick={exportMatrix} style={btnGhost}>Matrix CSV</button>
        <button onClick={exportJson} style={btnGhost}>Sensitivity JSON</button>
        <button onClick={exportBundle} style={btnGhost}>Research Bundle JSON</button>
      </div>
      <div style={{ marginTop: 8, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, wordBreak: "break-all" }}>
        Sensitivity Run ID: <span style={{ color: C.blue }}>{outcome.runId}</span>{outcome.partial ? " · PARTIAL" : ""}
      </div>
    </div>
  );
}

export const SENSITIVITY_SECTION_MARKER = "SENSITIVITY_SECTION_V1";

// ---------------------------------------------------------------------------
// Phase 21.7 · Cross-Asset Validation Lab UI. This section reads whatever
// research rows the panel already produced (via walk-forward + comparison)
// and reformats them into the cross-asset envelope. No new provider fetch,
// no adapter change, no Run ID mutation.

import {
  buildCrossAssetRow as _buildCxRow,
  buildInstrumentStrategyMatrix,
  buildRegimeStrategyMatrix,
  buildLeaderboard,
  buildResearchSummary,
  computeConsistencyScore,
  buildCrossAssetCsv,
  buildCrossAssetJson,
  CROSS_ASSET_ENGINE_VERSION,
  type CrossAssetRow,
  type LeaderboardEntry,
} from "@/lib/backtest/cross-asset";

export const CROSS_ASSET_SECTION_MARKER = "CROSS_ASSET_SECTION_V1";

function toCxRows(rows: StrategyResearchRow[], instrument: string): CrossAssetRow[] {
  // Adapt the research-comparison row shape to CrossAssetRow without
  // touching any Historical result; validation trades supply the metrics.
  return rows.map((r) => {
    const decided = r.validation.tradeCount;
    return {
      instrument,
      timeframe: "1d",
      strategy: r.strategy,
      formula: r.formula,
      regime: null,
      runId: `${r.strategy}:${r.formula}`,
      trades: decided,
      wins: Math.round((r.validation.winRate / 100) * decided),
      losses: decided - Math.round((r.validation.winRate / 100) * decided),
      winRate: r.validation.winRate,
      profitFactor: r.validation.profitFactor,
      expectancy: r.validation.expectancy,
      netPnl: r.validation.expectancy * decided,
      maxDrawdown: r.validation.drawdown,
      recoveryFactor: r.validation.drawdown > 0 ? (r.validation.expectancy * decided) / r.validation.drawdown : null,
      stability: r.stability.score,
      robustness: null,
      monteCarloP5: null,
      walkForwardOos: r.validation.profitFactor,
      sufficient: r.status !== "INSUFFICIENT_DATA",
    };
  });
}

function CrossAssetSection({
  rows,
  researchRunId,
  instrument,
  from,
  to,
}: {
  rows: StrategyResearchRow[];
  researchRunId: string;
  instrument: string;
  from: string;
  to: string;
}) {
  const cxRows = useMemo(() => toCxRows(rows, instrument), [rows, instrument]);
  const matrix = useMemo(() => buildInstrumentStrategyMatrix(cxRows), [cxRows]);
  const regimeMatrix = useMemo(() => buildRegimeStrategyMatrix(cxRows), [cxRows]);
  const leaderboard = useMemo<LeaderboardEntry[]>(() => buildLeaderboard(cxRows), [cxRows]);
  const summary = useMemo(() => buildResearchSummary(cxRows), [cxRows]);
  const strategies = useMemo(() => Array.from(new Set(cxRows.map((r) => r.strategy))), [cxRows]);
  const consistency = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeConsistencyScore>> = {};
    for (const s of strategies) out[s] = computeConsistencyScore({ strategy: s, rows: cxRows });
    return out;
  }, [strategies, cxRows]);

  const provenance = {
    researchRunId,
    generatedAt: new Date().toISOString(),
    engineVersion: CROSS_ASSET_ENGINE_VERSION,
  };

  const exportCsv = useCallback(() => {
    const csv = buildCrossAssetCsv(cxRows, provenance);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `cross_asset_${instrument}_${from}_${to}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [cxRows, provenance, instrument, from, to]);

  const exportJson = useCallback(() => {
    const json = buildCrossAssetJson(cxRows, provenance, { leaderboard, summary, consistency });
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `cross_asset_${instrument}_${from}_${to}.json`;
    a.click(); URL.revokeObjectURL(url);
  }, [cxRows, provenance, leaderboard, summary, consistency, instrument, from, to]);

  return (
    <>
      <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange }}>CROSS-ASSET MATRIX</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={exportCsv} style={btnGhost}>Cross-Asset CSV</button>
            <button onClick={exportJson} style={btnGhost}>Cross-Asset JSON</button>
          </div>
        </div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginBottom: 10 }}>
          {cxRows.length === 0
            ? "No rows yet. Run the Research Lab above to populate the cross-asset matrix; run additional instruments to expand it."
            : `Adapting ${cxRows.length} research row(s) into the cross-asset envelope. Run additional instruments via the Astro / SMC / Hybrid panels to broaden coverage — no strategy formulas are altered.`}
        </div>
        {cxRows.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  {["Instrument","Strategy","Formula","Trades","Win %","PF","Expectancy","Net PnL","Max DD","Stability","Sufficient"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cxRows.map((r, i) => (
                  <tr key={`${r.instrument}-${r.strategy}-${i}`} style={{ borderBottom: `1px solid ${C.border}`, opacity: r.sufficient ? 1 : 0.55 }}>
                    <td style={{ padding: "6px 8px" }}>{r.instrument}</td>
                    <td style={{ padding: "6px 8px" }}>{r.strategy}</td>
                    <td style={{ padding: "6px 8px" }}>{r.formula}</td>
                    <td style={{ padding: "6px 8px" }}>{r.trades}</td>
                    <td style={{ padding: "6px 8px" }}>{r.winRate}%</td>
                    <td style={{ padding: "6px 8px" }}>{r.profitFactor}</td>
                    <td style={{ padding: "6px 8px" }}>{r.expectancy}</td>
                    <td style={{ padding: "6px 8px" }}>{r.netPnl.toFixed(2)}</td>
                    <td style={{ padding: "6px 8px", color: C.red }}>{r.maxDrawdown}</td>
                    <td style={{ padding: "6px 8px" }}>{r.stability ?? "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r.sufficient ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {cxRows.length > 0 ? (
        <section style={panel}>
          <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>LEADERBOARD</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            {leaderboard.map((e) => (
              <div key={e.category} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, letterSpacing: 1 }}>{e.category}</div>
                <div style={{ fontFamily: "var(--eb-mono)", fontSize: 14, marginTop: 4 }}>{e.winner ?? "—"}</div>
                <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 4 }}>
                  {e.metric}: <span style={{ color: C.text }}>{e.value ?? "—"}</span>
                </div>
                <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, marginTop: 4 }}>{e.reason}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {cxRows.length > 0 ? (
        <section style={panel}>
          <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>RESEARCH SUMMARY</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
            <div><span style={lbl}>Best Instrument</span><div>{summary.bestInstrument ?? "—"}</div><div style={{ color: C.muted, fontSize: 10 }}>{summary.reasons.bestInstrument}</div></div>
            <div><span style={lbl}>Weak Instrument</span><div>{summary.weakInstrument ?? "—"}</div><div style={{ color: C.muted, fontSize: 10 }}>{summary.reasons.weakInstrument}</div></div>
            <div><span style={lbl}>Best Timeframe</span><div>{summary.bestTimeframe ?? "—"}</div><div style={{ color: C.muted, fontSize: 10 }}>{summary.reasons.bestTimeframe}</div></div>
            <div><span style={lbl}>Weak Timeframe</span><div>{summary.weakTimeframe ?? "—"}</div><div style={{ color: C.muted, fontSize: 10 }}>{summary.reasons.weakTimeframe}</div></div>
            <div><span style={lbl}>Best Regime</span><div>{summary.bestRegime ?? "—"}</div><div style={{ color: C.muted, fontSize: 10 }}>{summary.reasons.bestRegime}</div></div>
            <div><span style={lbl}>Worst Regime</span><div>{summary.worstRegime ?? "—"}</div><div style={{ color: C.muted, fontSize: 10 }}>{summary.reasons.worstRegime}</div></div>
            <div><span style={lbl}>Highest Confidence</span><div>{summary.highestConfidenceStrategy ?? "—"}</div><div style={{ color: C.muted, fontSize: 10 }}>{summary.reasons.highestConfidenceStrategy}</div></div>
            <div><span style={lbl}>Least Stable</span><div>{summary.leastStableStrategy ?? "—"}</div><div style={{ color: C.muted, fontSize: 10 }}>{summary.reasons.leastStableStrategy}</div></div>
          </div>
        </section>
      ) : null}

      {cxRows.length > 0 ? (
        <section style={panel}>
          <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>CONSISTENCY SCORES</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            {strategies.map((s) => {
              const c = consistency[s];
              return (
                <div key={s} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                  <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.orange }}>{s}</div>
                  <div style={{ fontFamily: "var(--eb-mono)", fontSize: 24, marginTop: 6 }}>{c.score}</div>
                  <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, marginTop: 6 }}>{c.formula}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted }}>
            Matrix rows: {matrix.rowKeys.length} × {matrix.colKeys.length} · Regime rows: {regimeMatrix.rowKeys.length}
          </div>
        </section>
      ) : null}
    </>
  );
}
// ---------------------------------------------------------------------------
// Phase 21.7 · Stage 2 — Research Batch tab.
// Drives runUnifiedBacktest across a plan and surfaces progress, results,
// summary, coverage and exports. Never creates another runner.

const BATCH_STRATEGY_CHOICES: readonly StrategyId[] = ["ASTRO", "SMC", "ASTRO_SMC_HYBRID"];
const BATCH_INSTRUMENTS: readonly string[] = ["NIFTY50", "BANKNIFTY"];
const BATCH_TIMEFRAMES: readonly DataGranularity[] = ["1d", "5m"];
const BATCH_PERIODS: readonly { label: string; from: string; to: string }[] = [
  { label: "3M", from: isoDaysAgo(90), to: todayIso() },
  { label: "6M", from: isoDaysAgo(180), to: todayIso() },
  { label: "12M", from: isoDaysAgo(365), to: todayIso() },
];

function BatchSection() {
  const [selectedStrategies, setSelectedStrategies] = useState<Record<StrategyId, boolean>>({
    ASTRO: true, SMC: true, ASTRO_SMC_HYBRID: false, BASELINE: false,
  });
  const [selectedInstruments, setSelectedInstruments] = useState<Record<string, boolean>>({
    NIFTY50: true, BANKNIFTY: false,
  });
  const [selectedTf, setSelectedTf] = useState<Record<DataGranularity, boolean>>({
    "1d": true, "5m": false,
  });
  const [selectedPeriods, setSelectedPeriods] = useState<Record<string, boolean>>({
    "3M": true, "6M": false, "12M": false,
  });
  const [concurrency, setConcurrency] = useState<1 | 2 | 4 | 8>(2);
  const controllerRef = useRef<BatchController | null>(null);
  const [state, setState] = useState<BatchOrchestratorState | null>(null);
  const [running, setRunning] = useState(false);

  const formulas: Partial<Record<StrategyId, UnifiedFormulaId>> = useMemo(() => ({
    ASTRO: ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1 as UnifiedFormulaId,
    SMC: "SMC_V1" as UnifiedFormulaId,
    ASTRO_SMC_HYBRID: "ASTRO_SMC_HYBRID_V1" as UnifiedFormulaId,
  }), []);

  const input: BatchOrchestratorInput = useMemo(() => ({
    strategies: BATCH_STRATEGY_CHOICES.filter((s) => selectedStrategies[s]),
    formulas,
    instruments: BATCH_INSTRUMENTS.filter((i) => selectedInstruments[i]),
    timeframes: BATCH_TIMEFRAMES.filter((t) => selectedTf[t]),
    periods: BATCH_PERIODS.filter((p) => selectedPeriods[p.label]),
    concurrency,
  }), [selectedStrategies, selectedInstruments, selectedTf, selectedPeriods, concurrency, formulas]);

  const plan = useMemo(() => buildExecutionPlan(input), [input]);

  const start = useCallback(async () => {
    if (running || plan.length === 0) return;
    const ctrl = createBatchOrchestrator(input, {
      execute: async (job, ctx) => {
        void ctx;
        return runUnifiedBacktest({
          strategy: job.strategy,
          formula: job.formula,
          instrument: job.instrument,
          timeframe: job.timeframe,
          from: job.period.from,
          to: job.period.to,
        });
      },
    });
    controllerRef.current = ctrl;
    const unsub = ctrl.subscribe((s) => setState(s));
    setRunning(true);
    setState(ctrl.getState());
    try {
      await ctrl.start();
    } finally {
      setRunning(false);
      unsub();
      setState(ctrl.getState());
    }
  }, [running, plan.length, input]);

  const doExport = useCallback((kind: "results-csv" | "results-json" | "failures-csv" | "coverage-csv" | "summary-json") => {
    if (!state) return;
    const prov = { generatedAt: new Date().toISOString(), source: "research-batch-ui" };
    const map: Record<string, { name: string; mime: string; body: string }> = {
      "results-csv": { name: "batch-results.csv", mime: "text/csv", body: buildBatchResultsCsv(state, prov) },
      "results-json": { name: "batch-results.json", mime: "application/json", body: buildBatchResultsJson(state, prov) },
      "failures-csv": { name: "batch-failures.csv", mime: "text/csv", body: buildBatchFailuresCsv(state, prov) },
      "coverage-csv": { name: "batch-coverage.csv", mime: "text/csv", body: buildBatchCoverageCsv(state, prov) },
      "summary-json": { name: "batch-summary.json", mime: "application/json", body: buildBatchSummaryJson(state, prov) },
    };
    const spec = map[kind];
    downloadBlob(spec.name, spec.mime, spec.body);
  }, [state]);

  const summary = state ? summarizeBatch(state) : null;

  return (
    <section style={panel}>
      <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>
        RESEARCH BATCH · MULTI-ASSET EXECUTION
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={lbl}>Strategies</div>
          {BATCH_STRATEGY_CHOICES.map((s) => (
            <label key={s} style={{ display: "block", fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 4 }}>
              <input type="checkbox" checked={!!selectedStrategies[s]} onChange={(e) => setSelectedStrategies((x) => ({ ...x, [s]: e.target.checked }))} /> {s}
            </label>
          ))}
        </div>
        <div>
          <div style={lbl}>Instruments</div>
          {BATCH_INSTRUMENTS.map((i) => (
            <label key={i} style={{ display: "block", fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 4 }}>
              <input type="checkbox" checked={!!selectedInstruments[i]} onChange={(e) => setSelectedInstruments((x) => ({ ...x, [i]: e.target.checked }))} /> {i}
            </label>
          ))}
        </div>
        <div>
          <div style={lbl}>Timeframes</div>
          {BATCH_TIMEFRAMES.map((t) => (
            <label key={t} style={{ display: "block", fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 4 }}>
              <input type="checkbox" checked={!!selectedTf[t]} onChange={(e) => setSelectedTf((x) => ({ ...x, [t]: e.target.checked }))} /> {t}
            </label>
          ))}
        </div>
        <div>
          <div style={lbl}>Periods</div>
          {BATCH_PERIODS.map((p) => (
            <label key={p.label} style={{ display: "block", fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 4 }}>
              <input type="checkbox" checked={!!selectedPeriods[p.label]} onChange={(e) => setSelectedPeriods((x) => ({ ...x, [p.label]: e.target.checked }))} /> {p.label}
            </label>
          ))}
        </div>
        <div>
          <div style={lbl}>Concurrency</div>
          <select value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value) as 1 | 2 | 4 | 8)} style={{ ...sel, width: "auto" }}>
            {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <button onClick={start} disabled={running || plan.length === 0} style={{ ...chip, background: running ? C.border : C.orange, color: "#04140b" }}>
          Start ({plan.length} jobs)
        </button>
        <button onClick={() => controllerRef.current?.pause()} disabled={!running || state?.paused} style={chip}>Pause</button>
        <button onClick={() => controllerRef.current?.resume()} disabled={!running || !state?.paused} style={chip}>Resume</button>
        <button onClick={() => controllerRef.current?.cancel()} disabled={!running} style={chip}>Cancel</button>
        <button onClick={() => controllerRef.current?.restartFailed()} disabled={running || !state} style={chip}>Restart Failed</button>
        <button onClick={() => controllerRef.current?.restartAll()} disabled={running || !state} style={chip}>Restart All</button>
      </div>

      {state ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            <McCard label="Total" value={String(state.progress.total)} />
            <McCard label="Completed" value={String(state.progress.completed)} accent={C.green} />
            <McCard label="Running" value={String(state.progress.running)} accent={C.orange} />
            <McCard label="Queued" value={String(state.progress.queued)} />
            <McCard label="Failed" value={String(state.progress.failed)} accent={C.red} />
            <McCard label="Cancelled" value={String(state.progress.cancelled)} />
            <McCard label="ETA" value={state.progress.etaMs === null ? "—" : `${Math.round(state.progress.etaMs / 1000)}s`} />
          </div>

          {state.progress.currentJobs.length > 0 ? (
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, marginBottom: 8 }}>
              Running: {state.progress.currentJobs.map((j) => `${j.strategy}/${j.instrument}/${j.timeframe}/${j.period.label}`).join(", ")}
            </div>
          ) : null}

          <div style={{ overflowX: "auto", marginBottom: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left", borderBottom: `1px solid ${C.border}` }}>
                  {["Strategy", "Formula", "Instrument", "TF", "Period", "Status", "Trades", "Net PnL", "RunID"].map((h) => (
                    <th key={h} style={{ padding: "4px 6px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.records.map((r) => {
                  const pnl = r.result ? Math.round(r.result.trades.reduce((s, t) => s + t.pnl, 0) * 100) / 100 : null;
                  const color = r.status === "completed" ? C.green : r.status === "failed" ? C.red : r.status === "running" ? C.orange : C.muted;
                  return (
                    <tr key={r.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "4px 6px" }}>{r.job.strategy}</td>
                      <td style={{ padding: "4px 6px" }}>{r.job.formula}</td>
                      <td style={{ padding: "4px 6px" }}>{r.job.instrument}</td>
                      <td style={{ padding: "4px 6px" }}>{r.job.timeframe}</td>
                      <td style={{ padding: "4px 6px" }}>{r.job.period.label}</td>
                      <td style={{ padding: "4px 6px", color }}>{r.status}</td>
                      <td style={{ padding: "4px 6px" }}>{r.result?.trades.length ?? "—"}</td>
                      <td style={{ padding: "4px 6px" }}>{pnl === null ? "—" : pnl}</td>
                      <td style={{ padding: "4px 6px", color: C.muted, fontSize: 10 }}>{r.runId ?? (r.error?.code ?? "—")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {summary ? (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, marginBottom: 10 }}>
              <div style={{ fontFamily: "var(--eb-head)", fontSize: 12, letterSpacing: 2, color: C.orange, marginBottom: 6 }}>BATCH SUMMARY</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 6, fontFamily: "var(--eb-mono)", fontSize: 11 }}>
                <div><span style={lbl}>Coverage</span><div>{summary.coveragePct}%</div></div>
                <div><span style={lbl}>Best Strategy</span><div>{summary.bestStrategy ?? "—"}</div></div>
                <div><span style={lbl}>Best Instrument</span><div>{summary.bestInstrument ?? "—"}</div></div>
                <div><span style={lbl}>Best Timeframe</span><div>{summary.bestTimeframe ?? "—"}</div></div>
                <div><span style={lbl}>Best Period</span><div>{summary.bestPeriod ?? "—"}</div></div>
                <div><span style={lbl}>Highest Net PnL</span><div>{summary.highestNetPnl === null ? "—" : summary.highestNetPnl}</div></div>
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => doExport("results-csv")} style={chip}>Results CSV</button>
            <button onClick={() => doExport("results-json")} style={chip}>Results JSON</button>
            <button onClick={() => doExport("failures-csv")} style={chip}>Failures CSV</button>
            <button onClick={() => doExport("coverage-csv")} style={chip}>Coverage CSV</button>
            <button onClick={() => doExport("summary-json")} style={chip}>Summary JSON</button>
          </div>
        </>
      ) : (
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.muted, textAlign: "center", padding: 12 }}>
          Configure your batch above and press Start. Runs use the shared unified backtest engine — no new runner.
        </div>
      )}
    </section>
  );
}
