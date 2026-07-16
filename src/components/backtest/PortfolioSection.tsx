// Phase 22 · Stage 1 — Portfolio Research UI. Lazy-loaded. Uses only existing
// design tokens. No new route. Purely research — never mutates production.

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
} from "@/lib/portfolio/portfolio-types";
import {
  buildAllocationCsv,
  buildCorrelationCsv,
  buildPortfolioJson,
  buildPortfolioSummaryCsv,
  buildRiskContributionCsv,
  buildStressTestCsv,
} from "@/lib/portfolio/portfolio-exports";

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
  const [method, setMethod] = useState<AllocationMethod>("EQUAL_WEIGHT");
  const [sizing, setSizing] = useState<PositionSizingMethod>("FIXED_RISK_PCT");
  const [rebalance, setRebalance] = useState<RebalancePolicy>("NEVER");
  const [capital, setCapital] = useState<number>(100000);
  const [riskPct, setRiskPct] = useState<number>(1);
  const [mcMode, setMcMode] = useState<PortfolioMcMode>("BLOCK_BOOTSTRAP");
  const [seed, setSeed] = useState<number>(42);

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

  const canRun = candidates.length >= 1;

  const run = () => {
    if (!canRun) return;
    const input: PortfolioRunInput = { candidates, config };
    const r = runPortfolioResearch(input);
    setResult(r);
    setMcResult(null);
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

  return (
    <div>
      <div style={{ ...section, borderColor: C.orange }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Portfolio Research Laboratory</div>
        <div style={{ fontSize: 12, color: C.muted }}>{PORTFOLIO_DISCLAIMER}</div>
      </div>

      <div style={section}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <div>
            <div style={label}>Allocation Method</div>
            <select value={method} onChange={(e) => setMethod(e.target.value as AllocationMethod)} style={{ width: "100%", marginTop: 4 }}>
              {ALLOC_METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>Position Sizing</div>
            <select value={sizing} onChange={(e) => setSizing(e.target.value as PositionSizingMethod)} style={{ width: "100%", marginTop: 4 }}>
              {SIZING_METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>Rebalance</div>
            <select value={rebalance} onChange={(e) => setRebalance(e.target.value as RebalancePolicy)} style={{ width: "100%", marginTop: 4 }}>
              {REBALANCE_POLICIES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>Starting Capital</div>
            <input type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value) || 0)} style={{ width: "100%", marginTop: 4 }} />
          </div>
          <div>
            <div style={label}>Risk % / Trade</div>
            <input type="number" step={0.1} value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value) || 0)} style={{ width: "100%", marginTop: 4 }} />
          </div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button style={{ ...btn, background: C.orange, color: "#04140b", fontWeight: 600 }} onClick={run} disabled={!canRun}>
            Run Portfolio Research
          </button>
          {!canRun ? (
            <span style={{ fontSize: 12, color: C.muted }}>
              Load at least one candidate strategy (Cross-Asset or Research Batch) to enable.
            </span>
          ) : null}
        </div>
      </div>

      {result ? (
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

          {result.correlations.assetIds.length > 1 ? (
            <div style={section}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Correlation (returns)</div>
              <table style={{ width: "100%", fontSize: 11, fontFamily: "var(--eb-mono, monospace)" }}>
                <thead>
                  <tr style={{ color: C.muted }}>
                    <th></th>{result.correlations.assetIds.map((id) => <th key={id}>{id}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.correlations.assetIds.map((id, i) => (
                    <tr key={id}>
                      <td style={{ color: C.muted }}>{id}</td>
                      {result.correlations.returns[i].map((v, j) => (
                        <td key={j} style={{ background: `rgba(255,140,0,${Math.abs(v) * 0.3})`, textAlign: "center" }}>
                          {v.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

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

          {result.warnings.length > 0 || result.blockingReasons.length > 0 ? (
            <div style={section}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Constraints & Warnings</div>
              {result.blockingReasons.map((r) => (
                <div key={r} style={{ color: "#e11", fontSize: 12 }}>BLOCK: {r}</div>
              ))}
              {result.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 12, color: w.severity === "warn" ? "#f80" : C.muted }}>
                  {w.severity.toUpperCase()}: [{w.code}] {w.message}
                </div>
              ))}
            </div>
          ) : null}

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
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>
              Run ID: {result.runId} · Candidates: {result.candidateRunIds.length}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}