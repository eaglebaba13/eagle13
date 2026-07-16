// Phase 21.9 · Stage 1 — Explainable Optimizer UI (lazy-loaded).
// Research-only: consumes an OptimizerResult passed via props (or falls
// back to an empty state). No engines run here. No production mutation.
import { useMemo } from "react";
import {
  buildOptimizerSummaryCsv,
  buildOptimizerRecommendedRegionCsv,
  buildOptimizerAlternativesCsv,
  buildOptimizerRejectedCsv,
  buildOptimizerJson,
  buildOptimizerResearchPresetJson,
} from "@/lib/backtest/explainable-optimizer-exports";
import type { OptimizerResult } from "@/lib/backtest/explainable-optimizer";
import { downloadBlob } from "@/lib/download";

const C = {
  orange: "var(--eb-orange, #f0a742)",
  green: "var(--eb-green, #4fd18a)",
  red: "var(--eb-red, #f0656f)",
  blue: "var(--eb-blue, #4faaf0)",
  text: "var(--eb-text, #eee)",
  muted: "var(--eb-muted, #8a8a8a)",
  border: "var(--eb-border, #333)",
  bg: "var(--eb-panel, rgba(20,20,24,0.6))",
};

const panel: React.CSSProperties = {
  border: `1px solid ${C.border}`, borderRadius: 8, padding: 12,
  background: C.bg, backdropFilter: "blur(6px)", overflow: "auto",
};
const lbl: React.CSSProperties = { fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" };
const btn: React.CSSProperties = { background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 10px", fontFamily: "var(--eb-mono)", fontSize: 11, cursor: "pointer" };
const th: React.CSSProperties = { textAlign: "left", color: C.muted, borderBottom: `1px solid ${C.border}`, padding: "4px 6px", fontWeight: 400 };
const td: React.CSSProperties = { color: C.text, borderBottom: `1px solid ${C.border}`, padding: "4px 6px" };

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
      <div style={lbl}>{label}</div>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 14, color: accent ?? C.text, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
    </div>
  );
}

export type OptimizerSectionProps = {
  readonly result?: OptimizerResult;
  readonly researchRunId?: string;
  readonly instrument?: string;
  readonly provider?: string;
  readonly from?: string;
  readonly to?: string;
};

export default function OptimizerSection(props: OptimizerSectionProps) {
  const r = props.result;
  const provenance = useMemo(() => ({
    researchRunId: props.researchRunId ?? "",
    generatedAt: new Date().toISOString(),
    provider: props.provider ?? "",
    instrument: props.instrument ?? "",
    from: props.from ?? "",
    to: props.to ?? "",
  }), [props.researchRunId, props.provider, props.instrument, props.from, props.to]);

  if (!r) {
    return (
      <section style={panel}>
        <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>
          EXPLAINABLE OPTIMIZER
        </div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.muted }}>
          Research-only. Run Sensitivity + Walk-Forward + Monte Carlo + Robustness first, then invoke <code>runExplainableOptimization</code> with the aggregated inputs to view a recommended parameter region here.
        </div>
        <div style={{ marginTop: 10, padding: 10, border: `1px dashed ${C.orange}`, borderRadius: 6, color: C.orange, fontFamily: "var(--eb-mono)", fontSize: 11 }}>
          RESEARCH OPTIMIZATION ONLY — NO PRODUCTION PARAMETER CHANGES
        </div>
      </section>
    );
  }

  const riskColor = r.overfitRisk === "LOW" ? C.green : r.overfitRisk === "MODERATE" ? C.blue : C.red;
  const confColor = r.confidence === "HIGH" ? C.green : r.confidence === "MEDIUM" ? C.blue : r.confidence === "LOW" ? C.orange : C.red;

  const copyParams = () => {
    if (!r.recommendedParameters) return;
    navigator.clipboard?.writeText(JSON.stringify(r.recommendedParameters, null, 2));
  };
  const dl = (name: string, body: string, mime: string) => downloadBlob(new Blob([body], { type: mime }), name);

  return (
    <section style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange }}>
          EXPLAINABLE OPTIMIZER · {r.strategy}
        </div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted }}>
          Run ID: <span style={{ color: C.blue }}>{r.runId}</span>
        </div>
      </div>
      <div style={{ marginTop: 6, color: C.orange, fontFamily: "var(--eb-mono)", fontSize: 11 }}>{r.disclaimer}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 12 }}>
        <Card label="Objective Score" value={r.objectiveScore.toFixed(3)} />
        <Card label="Overfit Risk" value={r.overfitRisk} accent={riskColor} />
        <Card label="Confidence" value={r.confidence} accent={confColor} />
        <Card label="Accepted Cells" value={String(r.evidence.acceptedCells ?? 0)} />
        <Card label="Surface" value={String(r.evidence.surface ?? "-")} />
        <Card label="Robustness" value={String(r.evidence.robustness ?? "-")} />
      </div>

      {r.recommendedRegion ? (
        <div style={{ marginTop: 14 }}>
          <div style={lbl}>Recommended Region</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 12, marginTop: 4 }}>
            <thead><tr><th style={th}>Parameter</th><th style={th}>Recommended</th><th style={th}>Safe Min</th><th style={th}>Safe Max</th></tr></thead>
            <tbody>
              {Object.entries(r.recommendedRegion.center).map(([k, v]) => {
                const range = r.recommendedRegion!.safeRange[k];
                return (
                  <tr key={k}>
                    <td style={td}>{k}</td>
                    <td style={{ ...td, color: C.green }}>{v}</td>
                    <td style={td}>{range?.min ?? v}</td>
                    <td style={td}>{range?.max ?? v}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={btn} onClick={copyParams}>Copy Parameters</button>
            <button style={btn} onClick={() => dl(`optimizer_preset_${r.runId}.json`, buildOptimizerResearchPresetJson(r, provenance), "application/json")}>Create Research Preset</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, padding: 10, border: `1px solid ${C.red}`, borderRadius: 6, color: C.red, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
          No region met the safety gates. Reasons: {r.rejectionReasons.join("; ") || "see rejected regions below."}
        </div>
      )}

      {r.alternatives.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div style={lbl}>Alternatives</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 12, marginTop: 4 }}>
            <thead>
              <tr>
                <th style={th}>Label</th><th style={th}>Parameters</th><th style={th}>Score</th>
                <th style={th}>Exp.</th><th style={th}>DD</th><th style={th}>Trades</th>
                <th style={th}>MC p5</th><th style={th}>Risk</th><th style={th}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {r.alternatives.map((a, i) => (
                <tr key={i}>
                  <td style={{ ...td, color: C.blue }}>{a.label}</td>
                  <td style={td}>{JSON.stringify(a.center)}</td>
                  <td style={td}>{a.objectiveScore.toFixed(3)}</td>
                  <td style={td}>{a.meanExpectancy.toFixed(2)}</td>
                  <td style={td}>{a.meanDrawdown.toFixed(2)}</td>
                  <td style={td}>{a.meanTrades.toFixed(0)}</td>
                  <td style={td}>{a.monteCarloP5.toFixed(0)}</td>
                  <td style={td}>{a.overfitRisk}</td>
                  <td style={td}>{a.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <div style={lbl}>Objective Contributions</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 4 }}>
          <thead><tr><th style={th}>Factor</th><th style={th}>Weight</th><th style={th}>Score</th><th style={th}>Contribution</th><th style={th}>Formula</th></tr></thead>
          <tbody>
            {r.objectiveContributions.map((c) => (
              <tr key={c.key}>
                <td style={td}>{c.key}</td>
                <td style={td}>{(c.weight * 100).toFixed(0)}%</td>
                <td style={td}>{c.normalisedScore.toFixed(3)}</td>
                <td style={td}>{c.contribution.toFixed(3)}</td>
                <td style={{ ...td, color: C.muted }}>{c.formula}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.explanations.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div style={lbl}>Explanations</div>
          <ul style={{ paddingLeft: 18, marginTop: 4, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.text }}>
            {r.explanations.map((e, i) => (
              <li key={i} style={{ color: e.kind === "REJECT" ? C.red : e.kind === "ACCEPT" ? C.green : C.text, marginBottom: 4 }}>
                <strong>[{e.kind}]</strong> {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {r.rejectedRegions.length > 0 ? (
        <details style={{ marginTop: 14 }}>
          <summary style={{ ...lbl, cursor: "pointer" }}>Rejected Regions ({r.rejectedRegions.length})</summary>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 4 }}>
            <thead><tr><th style={th}>Parameters</th><th style={th}>Score</th><th style={th}>Reasons</th></tr></thead>
            <tbody>
              {r.rejectedRegions.map((rj, i) => (
                <tr key={i}>
                  <td style={td}>{JSON.stringify(rj.center)}</td>
                  <td style={td}>{rj.objectiveScore.toFixed(3)}</td>
                  <td style={{ ...td, color: C.red }}>{rj.reasons.join(" | ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => dl(`optimizer_summary_${r.runId}.csv`, buildOptimizerSummaryCsv(r, provenance), "text/csv")}>Summary CSV</button>
        <button style={btn} onClick={() => dl(`optimizer_region_${r.runId}.csv`, buildOptimizerRecommendedRegionCsv(r, provenance), "text/csv")}>Region CSV</button>
        <button style={btn} onClick={() => dl(`optimizer_alternatives_${r.runId}.csv`, buildOptimizerAlternativesCsv(r, provenance), "text/csv")}>Alternatives CSV</button>
        <button style={btn} onClick={() => dl(`optimizer_rejected_${r.runId}.csv`, buildOptimizerRejectedCsv(r, provenance), "text/csv")}>Rejected CSV</button>
        <button style={btn} onClick={() => dl(`optimizer_full_${r.runId}.json`, buildOptimizerJson(r, provenance), "application/json")}>Full JSON</button>
      </div>
    </section>
  );
}
