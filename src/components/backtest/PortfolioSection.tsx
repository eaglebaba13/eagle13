// Phase 22 · Stage 2 — Portfolio Research Workspace. Lazy-loaded. Uses only
// existing design tokens. No new route. Purely research — never mutates
// production. Consumes the global candidate registry so any other Research
// surface can push completed backtests here without re-running strategies.

import { useMemo, useState } from "react";
import {
  runPortfolioResearch,
  type PortfolioRunInput,
} from "@/lib/portfolio/portfolio-engine";
import {
  runPortfolioMonteCarlo,
  type PortfolioMcMode,
} from "@/lib/portfolio/portfolio-monte-carlo";
import {
  defaultConstraints,
  defaultCostModel,
  defaultSizingPolicy,
  PORTFOLIO_DISCLAIMER,
  type AllocationMethod,
  type PortfolioAsset,
  type PortfolioConfig,
  type PositionSizingMethod,
  type RebalancePolicy,
  type PortfolioResearchResult,
} from "@/lib/portfolio/portfolio-types";
import {
  buildAllocationCsv,
  buildCorrelationCsv,
  buildPortfolioJson,
  buildPortfolioSummaryCsv,
  buildRiskContributionCsv,
  buildStressTestCsv,
} from "@/lib/portfolio/portfolio-exports";
import {
  buildCandidateRows,
  globalCandidateRegistry,
  type CandidateRow,
} from "@/lib/portfolio/candidate-discovery";
import { PortfolioHistory } from "@/lib/portfolio/portfolio-history";
import { compareResults } from "@/lib/portfolio/preset-comparison";
import {
  buildCandidatesCsv,
  buildComparisonCsv,
  buildHistoryCsv,
  buildResearchBundleJson,
} from "@/lib/portfolio/bundle-exports";
import { buildMonthlyHeatmap } from "@/lib/portfolio/rolling-metrics";
import { computeEfficientFrontier, type FrontierResult } from "@/lib/portfolio/efficient-frontier";
import { computeRiskBudget, type RiskBudgetResult } from "@/lib/portfolio/risk-budget";
import {
  computePortfolioRecommendation,
  type PortfolioRecommendationResult,
} from "@/lib/portfolio/portfolio-recommendation";
import { compareScenarios } from "@/lib/portfolio/scenario-comparison";
import {
  buildAllocationTreemapCsv,
  buildFrontierCsv,
  buildInstitutionalBundleJson,
  buildRecommendationCsv,
  buildRecommendationJson,
  buildRiskBudgetCsv,
  buildScenarioComparisonCsv,
} from "@/lib/portfolio/stage3-exports";

const C = {
  border: "hsl(var(--border))",
  muted: "hsl(var(--muted-foreground))",
  text: "hsl(var(--foreground))",
  panel: "hsl(var(--card))",
  orange: "hsl(var(--primary))",
};

const ALLOC_METHODS: readonly { id: AllocationMethod; label: string }[] = [
  { id: "EQUAL_WEIGHT", label: "Equal Weight" },
  { id: "FIXED_CUSTOM", label: "Fixed Custom" },
  { id: "VOL_INVERSE", label: "Volatility Inverse" },
  { id: "RISK_PARITY", label: "Risk Parity" },
  { id: "MAX_DIVERSIFICATION", label: "Max Diversification" },
  { id: "MIN_VARIANCE", label: "Min Variance" },
  { id: "ROBUSTNESS_WEIGHTED", label: "Robustness Weighted" },
  { id: "OOS_EXPECTANCY_WEIGHTED", label: "OOS Expectancy" },
  { id: "RECOMMENDATION_WEIGHTED", label: "Recommendation Confidence" },
];

const SIZING_METHODS: readonly { id: PositionSizingMethod; label: string }[] = [
  { id: "FIXED_RISK_PCT", label: "Fixed Risk %" },
  { id: "FIXED_CAPITAL_PCT", label: "Fixed Capital %" },
  { id: "VOL_TARGETING", label: "Vol Targeting" },
  { id: "FRACTIONAL_KELLY", label: "Fractional Kelly" },
  { id: "DRAWDOWN_ADJUSTED", label: "Drawdown Adjusted" },
  { id: "CONFIDENCE_ADJUSTED", label: "Confidence Adjusted" },
  { id: "ATR_RISK", label: "ATR Risk" },
  { id: "FIXED_QTY", label: "Fixed Qty" },
];

const REBALANCE_POLICIES: readonly { id: RebalancePolicy; label: string }[] = [
  { id: "NEVER", label: "Never" },
  { id: "MONTHLY", label: "Monthly" },
  { id: "QUARTERLY", label: "Quarterly" },
  { id: "THRESHOLD_DRIFT", label: "Threshold Drift" },
  { id: "REGIME_CHANGE", label: "Regime Change" },
  { id: "RECOMMENDATION_CHANGE", label: "Recommendation Change" },
];

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PortfolioSection({
  candidates = [],
}: {
  candidates?: readonly PortfolioAsset[];
}) {
  // Merge externally-provided candidates with the shared registry.
  const registryAssets = globalCandidateRegistry.list();
  const allAssets: readonly PortfolioAsset[] = useMemo(() => {
    const seen = new Map<string, PortfolioAsset>();
    for (const a of registryAssets) seen.set(a.id, a);
    for (const a of candidates) seen.set(a.id, a);
    return [...seen.values()];
  }, [candidates, registryAssets]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subtab, setSubtab] = useState<
    | "builder" | "alloc" | "equity" | "corr" | "frontier" | "risk-budget"
    | "stress" | "recommendation" | "history" | "compare" | "exports"
  >("builder");

  const [method, setMethod] = useState<AllocationMethod>("EQUAL_WEIGHT");
  const [sizing, setSizing] = useState<PositionSizingMethod>("FIXED_RISK_PCT");
  const [rebalance, setRebalance] = useState<RebalancePolicy>("NEVER");
  const [capital, setCapital] = useState<number>(100000);
  const [riskPct, setRiskPct] = useState<number>(1);
  const [mcMode, setMcMode] = useState<PortfolioMcMode>("BLOCK_BOOTSTRAP");
  const [seed, setSeed] = useState<number>(42);
  const [history] = useState<PortfolioHistory>(() => new PortfolioHistory());
  const [historyTick, setHistoryTick] = useState(0);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");

  const config: PortfolioConfig = useMemo(
    () => ({
      method,
      startingCapital: capital,
      sizingPolicy: { ...defaultSizingPolicy(), method: sizing, fixedRiskPct: riskPct / 100 },
      rebalancePolicy: rebalance,
      constraints: defaultConstraints(),
      costs: defaultCostModel(),
    }),
    [method, sizing, rebalance, capital, riskPct],
  );

  const [result, setResult] = useState<ReturnType<typeof runPortfolioResearch> | null>(null);
  const [mcResult, setMcResult] = useState<ReturnType<typeof runPortfolioMonteCarlo> | null>(null);

  const chosen = useMemo(
    () => allAssets.filter((a) => selected.has(a.id)),
    [allAssets, selected],
  );
  const candidateRows: readonly CandidateRow[] = useMemo(
    () => buildCandidateRows(allAssets),
    [allAssets],
  );
  const canRun = chosen.length >= 1;

  const run = () => {
    if (!canRun) return;
    const input: PortfolioRunInput = { candidates: chosen, config };
    const r = runPortfolioResearch(input);
    setResult(r);
    setMcResult(null);
    history.record(r, `${method} · ${sizing}`);
    setHistoryTick((t) => t + 1);
  };

  const runMc = () => {
    if (!result) return;
    setMcResult(
      runPortfolioMonteCarlo({
        result,
        startingCapital: config.startingCapital,
        simulations: 500,
        seed,
        mode: mcMode,
      }),
    );
  };

  const section: React.CSSProperties = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    background: C.panel,
  };
  const label: React.CSSProperties = { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 };
  const btn: React.CSSProperties = {
    padding: "6px 12px",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    background: "transparent",
    color: C.text,
    cursor: "pointer",
    fontFamily: "var(--eb-mono, monospace)",
    fontSize: 12,
  };
  const chip: React.CSSProperties = {
    padding: "4px 10px",
    border: `1px solid ${C.border}`,
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "var(--eb-mono, monospace)",
  };

  const subtabs: { id: typeof subtab; label: string }[] = [
    { id: "builder", label: "Builder" },
    { id: "alloc", label: "Allocation" },
    { id: "equity", label: "Equity" },
    { id: "corr", label: "Correlation" },
    { id: "frontier", label: "Frontier" },
    { id: "risk-budget", label: "Risk Budget" },
    { id: "stress", label: "Stress" },
    { id: "recommendation", label: "Recommendation" },
    { id: "history", label: "History" },
    { id: "compare", label: "Comparison" },
    { id: "exports", label: "Exports" },
  ];

  const historyEntries = useMemo(() => {
    void historyTick;
    return history.list();
  }, [history, historyTick]);

  const cmpA = historyEntries.find((e) => e.id === compareA)?.result ?? null;
  const cmpB = historyEntries.find((e) => e.id === compareB)?.result ?? null;
  const comparison = cmpA && cmpB ? compareResults(cmpA, cmpB) : null;

  const frontier: FrontierResult | null = useMemo(
    () => (chosen.length >= 2 ? computeEfficientFrontier({ candidates: chosen, startingCapital: capital, weightStep: 0.25 }) : null),
    [chosen, capital],
  );
  const riskBudget: RiskBudgetResult | null = useMemo(
    () => (result ? computeRiskBudget({ assets: chosen, contributions: result.riskContributions }) : null),
    [result, chosen],
  );
  const recommendation: PortfolioRecommendationResult | null = useMemo(
    () => (result ? computePortfolioRecommendation({ scenarios: [{ id: "current", label: `${method} · ${sizing}`, result, assets: chosen }] }) : null),
    [result, chosen, method, sizing],
  );
  const scenarioComparison = useMemo(() => {
    if (historyEntries.length < 2) return null;
    return compareScenarios({
      scenarios: historyEntries.slice(-5).map((e) => ({
        id: e.id, label: `${e.result.config.method} · ${e.result.config.sizingPolicy.method}`, result: e.result,
      })),
    });
  }, [historyEntries]);

  return (
    <div>
      <div style={{ ...section, borderColor: C.orange }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Portfolio Research Workspace</div>
        <div style={{ fontSize: 12, color: C.muted }}>{PORTFOLIO_DISCLAIMER}</div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {subtabs.map((s) => {
          const active = subtab === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSubtab(s.id)}
              style={{
                ...chip,
                background: active ? C.orange : "transparent",
                color: active ? "#04140b" : C.text,
                fontWeight: active ? 600 : 400,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {subtab === "builder" ? (
        <BuilderPanel
          rows={candidateRows}
          selected={selected}
          onToggle={(id) => setSelected((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
          })}
          section={section}
          label={label}
          btn={btn}
          method={method} setMethod={setMethod}
          sizing={sizing} setSizing={setSizing}
          rebalance={rebalance} setRebalance={setRebalance}
          capital={capital} setCapital={setCapital}
          riskPct={riskPct} setRiskPct={setRiskPct}
          run={run} canRun={canRun}
        />
      ) : null}

      {subtab === "alloc" && result ? (
        <>
          <div style={section}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Allocation</div>
            <table style={{ width: "100%", fontSize: 12, fontFamily: "var(--eb-mono, monospace)" }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th>Asset</th><th>Weight</th><th>Rationale</th>
                </tr>
              </thead>
              <tbody>
                {result.allocation.allocations.map((a) => (
                  <tr key={a.assetId}>
                    <td>{a.assetId}</td>
                    <td>{(a.weight * 100).toFixed(2)}%</td>
                    <td style={{ color: C.muted }}>{a.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.allocation.rejected.length > 0 ? (
              <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                Rejected: {result.allocation.rejected.map((r) => `${r.assetId} (${r.reason})`).join(", ")}
              </div>
            ) : null}
          </div>

          <div style={section}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Portfolio Metrics</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, fontSize: 12 }}>
              {[
                ["Net PnL", result.metrics.netPnl.toFixed(2)],
                ["Total Return %", (result.metrics.totalReturnPct * 100).toFixed(2) + "%"],
                ["CAGR", result.metrics.cagr != null ? (result.metrics.cagr * 100).toFixed(2) + "%" : "—"],
                ["Sharpe", result.metrics.sharpe.toFixed(2)],
                ["Sortino", result.metrics.sortino.toFixed(2)],
                ["Calmar", result.metrics.calmar.toFixed(2)],
                ["Max Drawdown", result.metrics.maxDrawdown.toFixed(2)],
                ["Max DD %", (result.metrics.maxDrawdownPct * 100).toFixed(2) + "%"],
                ["Ulcer Index", result.metrics.ulcerIndex.toFixed(4)],
                ["VaR 95%", result.metrics.var95.toFixed(4)],
                ["CVaR 95%", result.metrics.cvar95.toFixed(4)],
                ["Diversification Ratio", result.metrics.diversificationRatio.toFixed(2)],
              ].map(([k, v]) => (
                <div key={k} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                  <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{k}</div>
                  <div style={{ fontFamily: "var(--eb-mono, monospace)", marginTop: 4 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={section}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Risk Contribution</div>
            <table style={{ width: "100%", fontSize: 11, fontFamily: "var(--eb-mono, monospace)" }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th>Asset</th><th>Capital</th><th>Vol</th><th>DD</th><th>Loss</th><th>Tail</th><th>Corr</th>
                </tr>
              </thead>
              <tbody>
                {result.riskContributions.map((r) => (
                  <tr key={r.assetId}>
                    <td>{r.assetId}</td>
                    <td>{(r.capitalPct * 100).toFixed(1)}%</td>
                    <td>{(r.volPct * 100).toFixed(1)}%</td>
                    <td>{(r.drawdownPct * 100).toFixed(1)}%</td>
                    <td>{(r.lossPct * 100).toFixed(1)}%</td>
                    <td>{(r.tailPct * 100).toFixed(1)}%</td>
                    <td>{(r.correlationPct * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MonthlyHeatmap result={result} section={section} label={label} />
          <ConstraintsPanel result={result} section={section} />
        </>
      ) : null}

      {subtab === "corr" && result ? <CorrelationPanel result={result} section={section} /> : null}

      {subtab === "stress" && result ? (
        <>
          <div style={section}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Portfolio Monte Carlo</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select value={mcMode} onChange={(e) => setMcMode(e.target.value as PortfolioMcMode)}>
                {(["SHUFFLE", "BLOCK_BOOTSTRAP", "CORRELATED_BOOTSTRAP", "STRATEGY_OUTAGE", "SINGLE_FAILURE", "CORRELATION_SPIKE", "VOL_SHOCK"] as const).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <label style={{ fontSize: 12, color: C.muted }}>seed</label>
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} style={{ width: 80 }} />
              <button style={btn} onClick={runMc}>Run Stress Test</button>
            </div>
            {mcResult ? (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, fontSize: 12 }}>
                {[
                  ["Final P5", mcResult.finalEquity.p5.toFixed(0)],
                  ["Final P50", mcResult.finalEquity.p50.toFixed(0)],
                  ["Final P95", mcResult.finalEquity.p95.toFixed(0)],
                  ["Max DD P95", mcResult.maxDrawdown.p95.toFixed(0)],
                  ["Prob. Ruin", (mcResult.probabilityOfRuin * 100).toFixed(1) + "%"],
                  ["Worst Case", mcResult.worstCase.toFixed(0)],
                ].map(([k, v]) => (
                  <div key={k} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
                    <div style={{ color: C.muted, fontSize: 10 }}>{k}</div>
                    <div style={{ fontFamily: "var(--eb-mono, monospace)", marginTop: 4 }}>{v}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {subtab === "history" ? (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Portfolio History</div>
          {historyEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted }}>No runs yet. Trigger a run from the Builder tab.</div>
          ) : (
            <table style={{ width: "100%", fontSize: 11, fontFamily: "var(--eb-mono, monospace)" }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th>ID</th><th>At</th><th>Run ID</th><th>Method</th><th>Sizing</th><th>Net</th><th>Sharpe</th><th>DD%</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {historyEntries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.id}</td>
                    <td>{e.recordedAt.slice(0, 19)}</td>
                    <td>{e.result.runId}</td>
                    <td>{e.result.config.method}</td>
                    <td>{e.result.config.sizingPolicy.method}</td>
                    <td>{e.result.metrics.netPnl.toFixed(0)}</td>
                    <td>{e.result.metrics.sharpe.toFixed(2)}</td>
                    <td>{(e.result.metrics.maxDrawdownPct * 100).toFixed(1)}%</td>
                    <td style={{ color: C.muted }}>{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {subtab === "compare" ? (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Preset Comparison (A vs B)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <select value={compareA} onChange={(e) => setCompareA(e.target.value)}>
              <option value="">— Select A —</option>
              {historyEntries.map((e) => <option key={e.id} value={e.id}>{e.id} · {e.result.config.method}</option>)}
            </select>
            <span style={{ color: C.muted }}>vs</span>
            <select value={compareB} onChange={(e) => setCompareB(e.target.value)}>
              <option value="">— Select B —</option>
              {historyEntries.map((e) => <option key={e.id} value={e.id}>{e.id} · {e.result.config.method}</option>)}
            </select>
          </div>
          {comparison ? (
            <>
              {comparison.warnings.length > 0 ? (
                <div style={{ marginBottom: 8, fontSize: 12, color: "#f80" }}>
                  {comparison.warnings.join(" · ")}
                </div>
              ) : null}
              <table style={{ width: "100%", fontSize: 12, fontFamily: "var(--eb-mono, monospace)" }}>
                <thead>
                  <tr style={{ color: C.muted, textAlign: "left" }}>
                    <th>Metric</th><th>A</th><th>B</th><th>Δ</th><th>Δ%</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.metrics.map((m) => (
                    <tr key={m.metric}>
                      <td>{m.metric}</td>
                      <td>{m.a != null ? m.a.toFixed(4) : "—"}</td>
                      <td>{m.b != null ? m.b.toFixed(4) : "—"}</td>
                      <td>{m.delta != null ? m.delta.toFixed(4) : "—"}</td>
                      <td>{m.pctDelta != null ? (m.pctDelta * 100).toFixed(2) + "%" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div style={{ fontSize: 12, color: C.muted }}>Select two history entries to compare.</div>
          )}
        </div>
      ) : null}

      {subtab === "exports" && result ? (
        <div style={section}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Exports</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btn} onClick={() => download(`portfolio-summary-${result.runId}.csv`, buildPortfolioSummaryCsv(result), "text/csv")}>Summary CSV</button>
              <button style={btn} onClick={() => download(`portfolio-allocation-${result.runId}.csv`, buildAllocationCsv(result), "text/csv")}>Allocation CSV</button>
              <button style={btn} onClick={() => download(`portfolio-risk-${result.runId}.csv`, buildRiskContributionCsv(result), "text/csv")}>Risk CSV</button>
              <button style={btn} onClick={() => download(`portfolio-corr-${result.runId}.csv`, buildCorrelationCsv(result), "text/csv")}>Correlation CSV</button>
              {mcResult ? (
                <button style={btn} onClick={() => download(`portfolio-stress-${result.runId}.csv`, buildStressTestCsv(result, mcResult), "text/csv")}>Stress CSV</button>
              ) : null}
              <button style={btn} onClick={() => download(`portfolio-${result.runId}.json`, buildPortfolioJson(result), "application/json")}>Portfolio JSON</button>
              <button style={btn} onClick={() => download(`portfolio-candidates-${result.runId}.csv`, buildCandidatesCsv(candidateRows, result.runId), "text/csv")}>Candidates CSV</button>
              <button style={btn} onClick={() => download(`portfolio-history-${result.runId}.csv`, buildHistoryCsv(historyEntries), "text/csv")}>History CSV</button>
              {comparison ? (
                <button style={btn} onClick={() => download(`portfolio-comparison-${result.runId}.csv`, buildComparisonCsv(comparison), "text/csv")}>Comparison CSV</button>
              ) : null}
              {frontier ? (
                <button style={btn} onClick={() => download(`portfolio-frontier-${result.runId}.csv`, buildFrontierCsv(frontier), "text/csv")}>Frontier CSV</button>
              ) : null}
              {riskBudget ? (
                <button style={btn} onClick={() => download(`portfolio-risk-budget-${result.runId}.csv`, buildRiskBudgetCsv(riskBudget), "text/csv")}>Risk Budget CSV</button>
              ) : null}
              {recommendation ? (
                <>
                  <button style={btn} onClick={() => download(`portfolio-recommendation-${result.runId}.csv`, buildRecommendationCsv(recommendation), "text/csv")}>Recommendation CSV</button>
                  <button style={btn} onClick={() => download(`portfolio-recommendation-${result.runId}.json`, buildRecommendationJson(recommendation), "application/json")}>Recommendation JSON</button>
                </>
              ) : null}
              {scenarioComparison ? (
                <button style={btn} onClick={() => download(`portfolio-scenarios-${result.runId}.csv`, buildScenarioComparisonCsv(scenarioComparison), "text/csv")}>Scenarios CSV</button>
              ) : null}
              <button style={btn} onClick={() => download(`portfolio-treemap-${result.runId}.csv`, buildAllocationTreemapCsv(result, chosen), "text/csv")}>Treemap CSV</button>
              <button style={btn} onClick={() => download(`portfolio-institutional-bundle-${result.runId}.json`, buildInstitutionalBundleJson({ portfolio: result, frontier, riskBudget, recommendation, comparison: scenarioComparison }), "application/json")}>Institutional Bundle JSON</button>
              <button style={btn} onClick={() => download(`portfolio-bundle-${result.runId}.json`, buildResearchBundleJson({ portfolio: result, candidates: candidateRows, monteCarlo: mcResult ?? null, history: historyEntries, comparison }), "application/json")}>Full Bundle JSON</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>
              Run ID: {result.runId} · Candidates: {result.candidateRunIds.length}
            </div>
          </div>
      ) : null}

      {subtab === "equity" && result ? (
        <EquityPanel result={result} section={section} label={label} />
      ) : null}

      {subtab === "frontier" ? (
        <FrontierPanel frontier={frontier} section={section} label={label} />
      ) : null}

      {subtab === "risk-budget" && riskBudget ? (
        <RiskBudgetPanel rb={riskBudget} section={section} />
      ) : null}

      {subtab === "recommendation" && recommendation ? (
        <RecommendationPanel rec={recommendation} section={section} />
      ) : null}

      {(subtab === "alloc" || subtab === "corr" || subtab === "stress" || subtab === "exports" || subtab === "equity" || subtab === "recommendation" || subtab === "risk-budget") && !result ? (
        <div style={{ ...section, textAlign: "center", color: C.muted, fontSize: 12 }}>
          Run a portfolio from the Builder tab to see this view.
        </div>
      ) : null}
    </div>
  );
}

function BuilderPanel(props: {
  rows: readonly CandidateRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  section: React.CSSProperties;
  label: React.CSSProperties;
  btn: React.CSSProperties;
  method: AllocationMethod;
  setMethod: (v: AllocationMethod) => void;
  sizing: PositionSizingMethod;
  setSizing: (v: PositionSizingMethod) => void;
  rebalance: RebalancePolicy;
  setRebalance: (v: RebalancePolicy) => void;
  capital: number;
  setCapital: (v: number) => void;
  riskPct: number;
  setRiskPct: (v: number) => void;
  run: () => void;
  canRun: boolean;
}) {
  const { rows, selected, onToggle, section, label, btn } = props;
  return (
    <>
      <div style={section}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Candidate Library ({rows.length})</div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted }}>
            No candidates registered. Run backtests via Cross-Asset, Research Batch, or push results into the shared registry to populate this list.
          </div>
        ) : (
          <div style={{ maxHeight: 280, overflow: "auto" }}>
            <table style={{ width: "100%", fontSize: 11, fontFamily: "var(--eb-mono, monospace)" }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left", position: "sticky", top: 0, background: C.panel }}>
                  <th></th>
                  <th>Run ID</th><th>Strategy</th><th>Formula</th><th>Instrument</th><th>TF</th>
                  <th>Trades</th><th>Win</th><th>PF</th><th>Exp</th><th>DD</th>
                  <th>Rob</th><th>Rec</th><th>Optz</th><th>Rel</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.assetId} style={{ opacity: r.selectable ? 1 : 0.5 }}>
                    <td>
                      <input
                        type="checkbox"
                        disabled={!r.selectable}
                        checked={selected.has(r.assetId)}
                        onChange={() => onToggle(r.assetId)}
                        aria-label={`select ${r.assetId}`}
                      />
                    </td>
                    <td title={r.runId}>{r.runId.slice(0, 16)}</td>
                    <td>{r.strategy}</td>
                    <td>{r.formulaVersion}</td>
                    <td>{r.instrument}</td>
                    <td>{r.timeframe}</td>
                    <td>{r.trades}</td>
                    <td>{(r.winRate * 100).toFixed(1)}%</td>
                    <td>{r.profitFactor === Infinity ? "∞" : r.profitFactor.toFixed(2)}</td>
                    <td>{r.expectancy.toFixed(2)}</td>
                    <td>{r.maxDrawdown.toFixed(0)}</td>
                    <td>{r.robustness != null ? r.robustness.toFixed(2) : "—"}</td>
                    <td>{r.recommendation != null ? r.recommendation.toFixed(2) : "—"}</td>
                    <td>{r.optimizerStatus}</td>
                    <td>{r.reliability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
          Selected: {selected.size}
        </div>
      </div>
      <div style={section}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <div>
            <div style={label}>Allocation Method</div>
            <select value={props.method} onChange={(e) => props.setMethod(e.target.value as AllocationMethod)} style={{ width: "100%", marginTop: 4 }}>
              {ALLOC_METHODS.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
            </select>
          </div>
          <div>
            <div style={label}>Position Sizing</div>
            <select value={props.sizing} onChange={(e) => props.setSizing(e.target.value as PositionSizingMethod)} style={{ width: "100%", marginTop: 4 }}>
              {SIZING_METHODS.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
            </select>
          </div>
          <div>
            <div style={label}>Rebalance</div>
            <select value={props.rebalance} onChange={(e) => props.setRebalance(e.target.value as RebalancePolicy)} style={{ width: "100%", marginTop: 4 }}>
              {REBALANCE_POLICIES.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
            </select>
          </div>
          <div>
            <div style={label}>Starting Capital</div>
            <input type="number" value={props.capital} onChange={(e) => props.setCapital(Number(e.target.value) || 0)} style={{ width: "100%", marginTop: 4 }} />
          </div>
          <div>
            <div style={label}>Risk % / Trade</div>
            <input type="number" step={0.1} value={props.riskPct} onChange={(e) => props.setRiskPct(Number(e.target.value) || 0)} style={{ width: "100%", marginTop: 4 }} />
          </div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button style={{ ...btn, background: C.orange, color: "#04140b", fontWeight: 600 }} onClick={props.run} disabled={!props.canRun}>
            Run Portfolio Research
          </button>
          {!props.canRun ? (
            <span style={{ fontSize: 12, color: C.muted }}>Select at least one candidate.</span>
          ) : null}
        </div>
      </div>
    </>
  );
}

function CorrelationPanel({ result, section }: { result: PortfolioResearchResult; section: React.CSSProperties }) {
  const ids = result.correlations.assetIds;
  if (ids.length < 2) {
    return <div style={section}>Add at least two candidates to visualise correlation.</div>;
  }
  return (
    <div style={section}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Correlation Heatmap (returns)</div>
      <table style={{ width: "100%", fontSize: 11, fontFamily: "var(--eb-mono, monospace)" }}>
        <thead>
          <tr style={{ color: C.muted }}>
            <th></th>{ids.map((id) => <th key={id}>{id.slice(0, 10)}</th>)}
          </tr>
        </thead>
        <tbody>
          {ids.map((id, i) => (
            <tr key={id}>
              <td style={{ color: C.muted }}>{id.slice(0, 10)}</td>
              {result.correlations.returns[i].map((v, j) => {
                const bg = v >= 0
                  ? `rgba(255,140,0,${Math.min(1, Math.abs(v))})`
                  : `rgba(60,140,240,${Math.min(1, Math.abs(v))})`;
                return (
                  <td key={j} style={{ background: bg, textAlign: "center", padding: "4px 6px" }}>
                    {v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>
        Aligned observations: {result.correlations.alignedObservations} · Simultaneous-loss rate: {(result.correlations.simultaneousLossRate * 100).toFixed(1)}%
      </div>
    </div>
  );
}

function ConstraintsPanel({ result, section }: { result: PortfolioResearchResult; section: React.CSSProperties }) {
  if (result.warnings.length === 0 && result.blockingReasons.length === 0) return null;
  return (
    <div style={section}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Constraints &amp; Warnings</div>
      {result.blockingReasons.map((r) => (<div key={r} style={{ color: "#e11", fontSize: 12 }}>BLOCK: {r}</div>))}
      {result.warnings.map((w, i) => (
        <div key={i} style={{ fontSize: 12, color: w.severity === "warn" ? "#f80" : C.muted }}>
          {w.severity.toUpperCase()}: [{w.code}] {w.message}
        </div>
      ))}
    </div>
  );
}

function MonthlyHeatmap({ result, section, label }: { result: PortfolioResearchResult; section: React.CSSProperties; label: React.CSSProperties }) {
  const cells = buildMonthlyHeatmap(result.trades);
  if (cells.length === 0) return null;
  const max = Math.max(1, ...cells.map((c) => Math.abs(c.pnl)));
  return (
    <div style={section}>
      <div style={{ ...label, marginBottom: 8 }}>Monthly PnL Heatmap</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {cells.map((c) => {
          const intensity = Math.min(1, Math.abs(c.pnl) / max);
          const bg = c.pnl >= 0
            ? `rgba(80,200,120,${intensity})`
            : `rgba(230,80,80,${intensity})`;
          return (
            <div key={`${c.year}-${c.month}`} style={{ background: bg, padding: "6px 10px", borderRadius: 4, fontSize: 11, fontFamily: "var(--eb-mono, monospace)" }}>
              {c.year}-{String(c.month).padStart(2, "0")}: {c.pnl.toFixed(0)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EquityPanel({ result, section, label }: { result: PortfolioResearchResult; section: React.CSSProperties; label: React.CSSProperties }) {
  const pts = result.equityCurve;
  if (pts.length === 0) return <div style={section}>No equity points to render.</div>;
  const eqMin = Math.min(...pts.map((p) => p.equity));
  const eqMax = Math.max(...pts.map((p) => p.equity));
  const ddMax = Math.max(1, ...pts.map((p) => p.drawdown));
  const W = 640, H = 160;
  const px = (i: number) => (i / Math.max(1, pts.length - 1)) * W;
  const eqY = (v: number) => H - ((v - eqMin) / Math.max(1, eqMax - eqMin)) * H;
  const ddY = (v: number) => (v / ddMax) * H;
  const eqPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${eqY(p.equity).toFixed(1)}`).join(" ");
  const ddPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${ddY(p.drawdown).toFixed(1)}`).join(" ");
  return (
    <>
      <div style={section}>
        <div style={{ ...label, marginBottom: 8 }}>Equity Curve</div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="portfolio equity curve">
          <path d={eqPath} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} />
        </svg>
      </div>
      <div style={section}>
        <div style={{ ...label, marginBottom: 8 }}>Drawdown</div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="portfolio drawdown">
          <path d={ddPath} fill="none" stroke="#e11" strokeWidth={1.5} />
        </svg>
      </div>
    </>
  );
}

function FrontierPanel({ frontier, section, label }: { frontier: FrontierResult | null; section: React.CSSProperties; label: React.CSSProperties }) {
  if (!frontier || frontier.feasible.length === 0) {
    return <div style={section}>Select at least two candidates to compute an efficient frontier.</div>;
  }
  const W = 640, H = 240;
  const vols = frontier.feasible.map((p) => p.volatility);
  const rets = frontier.feasible.map((p) => p.expectedReturn);
  const xMax = Math.max(...vols, 1e-6);
  const yMin = Math.min(...rets, 0);
  const yMax = Math.max(...rets, 1e-6);
  const x = (v: number) => (v / xMax) * (W - 20) + 10;
  const y = (r: number) => H - ((r - yMin) / Math.max(1e-9, yMax - yMin)) * (H - 20) - 10;
  const dot = (p: { volatility: number; expectedReturn: number }, color: string, r = 3) =>
    <circle cx={x(p.volatility)} cy={y(p.expectedReturn)} r={r} fill={color} />;
  return (
    <div style={section}>
      <div style={{ ...label, marginBottom: 8 }}>
        Efficient Frontier · {frontier.method} · feasible={frontier.feasible.length} · rejected={frontier.rejected}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="efficient frontier scatter">
        {frontier.feasible.map((p, i) => dot(p, p.efficient ? "hsl(var(--primary))" : "rgba(120,120,120,0.4)", p.efficient ? 3 : 2))}
        {frontier.minVariance ? dot(frontier.minVariance, "#3c8cf0", 5) : null}
        {frontier.maxSharpe ? dot(frontier.maxSharpe, "#e11", 5) : null}
        {frontier.maxDiversification ? dot(frontier.maxDiversification, "#0a0", 5) : null}
      </svg>
      <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
        Blue=Min Variance · Red=Max Sharpe · Green=Max Diversification · X=Volatility(ann) · Y=Return(ann).
        Grid-search approximation, not a convex solver.
      </div>
      <table style={{ width: "100%", fontSize: 11, fontFamily: "var(--eb-mono, monospace)", marginTop: 8 }}>
        <thead>
          <tr style={{ color: "hsl(var(--muted-foreground))", textAlign: "left" }}>
            <th>Point</th><th>Return</th><th>Vol</th><th>Sharpe</th><th>Div</th>
          </tr>
        </thead>
        <tbody>
          {([
            ["Min Var", frontier.minVariance],
            ["Max Sharpe", frontier.maxSharpe],
            ["Max Div", frontier.maxDiversification],
          ] as const).map(([lbl, p]) => p ? (
            <tr key={lbl}>
              <td>{lbl}</td>
              <td>{(p.expectedReturn * 100).toFixed(2)}%</td>
              <td>{(p.volatility * 100).toFixed(2)}%</td>
              <td>{p.sharpe.toFixed(2)}</td>
              <td>{p.diversificationRatio.toFixed(2)}</td>
            </tr>
          ) : null)}
        </tbody>
      </table>
    </div>
  );
}

function RiskBudgetPanel({ rb, section }: { rb: RiskBudgetResult; section: React.CSSProperties }) {
  return (
    <div style={section}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        Risk Budget · scope={rb.scope} · compliance={(rb.compliance * 100).toFixed(0)}% · worst gap={(rb.worstBreach * 100).toFixed(1)}%
      </div>
      <table style={{ width: "100%", fontSize: 12, fontFamily: "var(--eb-mono, monospace)" }}>
        <thead>
          <tr style={{ color: "hsl(var(--muted-foreground))", textAlign: "left" }}>
            <th>Key</th><th>Target</th><th>Actual</th><th>Gap</th><th>Status</th><th>Suggestion</th>
          </tr>
        </thead>
        <tbody>
          {rb.rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td>{(r.target * 100).toFixed(1)}%</td>
              <td>{(r.actual * 100).toFixed(1)}%</td>
              <td style={{ color: r.breach === "OK" ? "hsl(var(--muted-foreground))" : r.breach === "OVER" ? "#e11" : "#f80" }}>
                {(r.gap * 100).toFixed(1)}%
              </td>
              <td>{r.breach}</td>
              <td style={{ color: "hsl(var(--muted-foreground))" }}>{r.suggestion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecommendationPanel({ rec, section }: { rec: PortfolioRecommendationResult; section: React.CSSProperties }) {
  return (
    <>
      <div style={section}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Portfolio Recommendation</div>
        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{rec.disclaimer}</div>
        <div style={{ marginTop: 8, fontSize: 12 }}>Recommendation Run ID: <code>{rec.runId}</code></div>
      </div>
      <div style={section}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Ranked Scenarios</div>
        <table style={{ width: "100%", fontSize: 12, fontFamily: "var(--eb-mono, monospace)" }}>
          <thead>
            <tr style={{ color: "hsl(var(--muted-foreground))", textAlign: "left" }}>
              <th>Scenario</th><th>Score</th><th>Confidence</th><th>Recommendable</th><th>Reasons</th>
            </tr>
          </thead>
          <tbody>
            {rec.scored.map((s) => (
              <tr key={s.scenarioId}>
                <td>{s.scenarioId}</td>
                <td>{(s.score * 100).toFixed(1)}</td>
                <td>{(s.confidence * 100).toFixed(1)}</td>
                <td>{s.recommendable ? "YES" : "NO"}</td>
                <td style={{ color: s.recommendable ? "hsl(var(--muted-foreground))" : "#e11" }}>
                  {s.reasons.join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rec.recommended ? (
        <div style={section}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Recommended · {rec.recommended.scenarioId}</div>
          <div style={{ fontSize: 12 }}>Score {(rec.recommended.score * 100).toFixed(1)} · Confidence {(rec.recommended.confidence * 100).toFixed(1)}</div>
        </div>
      ) : (
        <div style={section}><div style={{ color: "#e11", fontSize: 12 }}>No scenario satisfies the hard gates.</div></div>
      )}
    </>
  );
}