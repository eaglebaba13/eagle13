// Phase 21.5 · Stage 1B — Research Lab UI integration.
// UI + orchestration only. Reuses the existing runBacktest (Astro) server
// function and the completed walk-forward, stability, comparison, summary,
// run-id and export engines. No production formula, adapter, engine, cache
// or Run ID is modified.

import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useCallback } from "react";

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
  type ParameterSpec,
} from "@/lib/backtest/parameter-sensitivity";
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

          <MonteCarloSection
            walkByStrategy={walkByStrategy}
            rows={rows}
            researchRunId={runId ?? "unknown"}
            instrument={cfg.symbol}
            from={cfg.from}
            to={cfg.to}
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
}: {
  walkByStrategy: Record<string, WalkForwardResult>;
  rows: StrategyResearchRow[];
  researchRunId: string;
  instrument: string;
  from: string;
  to: string;
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

      {robustness ? (
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

      <section style={panel}>
        <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>PARAMETER SENSITIVITY</div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.muted }}>
          Sensitivity grids for SMC (minScore, structureWindow, fvgValidityBars, obValidityBars, cooldownBars, ATR stop multiplier, RR) and Hybrid
          (Astro/SMC/agreement/data-quality weights, hybrid threshold) run through the existing unified backtest without touching production defaults.
          Available once an intraday provider payload is wired for SMC / Hybrid. INSUFFICIENT_DATA cells are hidden from the surface, never highlighted as optimal.
        </div>
      </section>
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