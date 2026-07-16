// Phase 21.9 · Stage 2A — Explainable Optimizer UI (lazy-loaded).
// Wires Stage-2 modules (pipeline, history, presets, drift, heatmap,
// comparison, exports) onto the Stage-1 result view. Research-only:
// never mutates production configuration and never recomputes upstream
// research. Consumes an optional ResolvedResearchContext or a pre-computed
// OptimizerResult; without either it renders the incomplete-context state.
import { useCallback, useMemo, useState } from "react";
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
import type { ResolvedResearchContext } from "@/lib/backtest/research-context";
import { runOptimizerPipeline } from "@/lib/backtest/optimizer-pipeline";
import {
  emptyOptimizerHistory,
  recordOptimizerHistory,
  compareOptimizerHistoryEntries,
  type OptimizerHistory,
} from "@/lib/backtest/optimizer-history";
import {
  emptyPresetLibrary,
  savePreset,
  renamePreset,
  duplicatePreset,
  deletePreset,
  serializePreset,
  type OptimizerPresetLibrary,
} from "@/lib/backtest/optimizer-presets";
import { computeParameterDrift } from "@/lib/backtest/optimizer-drift";
import { buildHeatmapOverlay } from "@/lib/backtest/optimizer-heatmap";
import { buildBeforeAfterReport } from "@/lib/backtest/optimizer-comparison";
import {
  buildOptimizerHistoryCsv,
  buildOptimizerComparisonCsv,
  buildOptimizerBeforeAfterCsv,
  buildOptimizerBundleJson,
  buildPresetLibraryJson,
} from "@/lib/backtest/optimizer-stage2-exports";
import {
  buildContextRows,
  buildHeatmapMatrix,
  checkDataHashMismatch,
  hasUnsafeDrift,
  DRIFT_COLORS,
  DRIFT_LABELS,
  OPTIMIZER_UI_MARKER,
} from "@/lib/backtest/optimizer-ui-helpers";

export { OPTIMIZER_UI_MARKER };

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
  readonly context?: ResolvedResearchContext | null;
};

export default function OptimizerSection(props: OptimizerSectionProps) {
  const ctx = props.context ?? null;
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<OptimizerResult | null>(null);
  const [history, setHistory] = useState<OptimizerHistory>(() => emptyOptimizerHistory());
  const [presets, setPresets] = useState<OptimizerPresetLibrary>(() => emptyPresetLibrary());
  const [presetName, setPresetName] = useState("");
  const [presetError, setPresetError] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<[string | null, string | null]>([null, null]);
  const [ackUnsafeDrift, setAckUnsafeDrift] = useState(false);

  const r = pipelineResult ?? props.result;
  const contextStatus = useMemo(() => buildContextRows(ctx), [ctx]);

  const provenance = useMemo(() => ({
    researchRunId: props.researchRunId ?? "",
    generatedAt: new Date().toISOString(),
    provider: props.provider ?? ctx?.provider ?? "",
    instrument: props.instrument ?? ctx?.instrument ?? "",
    from: props.from ?? ctx?.from ?? "",
    to: props.to ?? ctx?.to ?? "",
  }), [props.researchRunId, props.provider, props.instrument, props.from, props.to, ctx]);

  const runOptimizer = useCallback(() => {
    if (running) return;
    if (!ctx) { setRunError("OPTIMIZER_RESEARCH_CONTEXT_INCOMPLETE"); return; }
    setRunning(true);
    setRunError(null);
    try {
      const out = runOptimizerPipeline(ctx);
      setPipelineResult(out.result);
      setHistory((h) => recordOptimizerHistory(h, { context: out.context, result: out.result, recordedAt: out.completedAt }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRunError(msg.startsWith("INCOMPLETE_RESEARCH_CONTEXT") ? "OPTIMIZER_RESEARCH_CONTEXT_INCOMPLETE" : msg);
    } finally {
      setRunning(false);
    }
  }, [ctx, running]);

  const heatmap = useMemo(() => {
    if (!r || !ctx) return null;
    return buildHeatmapMatrix(buildHeatmapOverlay(ctx.sensitivityCells, r));
  }, [r, ctx]);

  const drift = useMemo(() => {
    if (!r || !ctx || !ctx.currentParameters || !r.recommendedRegion) return null;
    return computeParameterDrift(ctx.currentParameters, r.recommendedRegion.center, ctx.parameterSpace, r.recommendedRegion.safeRange);
  }, [r, ctx]);

  const beforeAfter = useMemo(() => {
    if (!r || !ctx) return null;
    return buildBeforeAfterReport({
      currentParameters: ctx.currentParameters ?? null,
      cells: ctx.sensitivityCells,
      optimizer: r,
      aggregate: ctx.aggregate,
    });
  }, [r, ctx]);

  const unsafeDrift = hasUnsafeDrift(drift);

  const entryA = compareIds[0] ? history.entries.find((e) => e.id === compareIds[0]) ?? null : null;
  const entryB = compareIds[1] ? history.entries.find((e) => e.id === compareIds[1]) ?? null : null;
  const historyCompare = entryA && entryB ? compareOptimizerHistoryEntries(entryA, entryB) : null;
  const historyMismatch = entryA && entryB ? checkDataHashMismatch(entryA, entryB) : { mismatch: false, reason: null };

  const doSavePreset = () => {
    setPresetError(null);
    if (!r?.recommendedParameters) { setPresetError("OPTIMIZER_PRESET_INVALID: no recommended parameters"); return; }
    if (unsafeDrift && !ackUnsafeDrift) { setPresetError("UNSAFE_DRIFT_ACK_REQUIRED"); return; }
    const name = presetName.trim() || `Preset ${new Date().toISOString().slice(0, 19)}`;
    try {
      setPresets((lib) => savePreset(lib, {
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        strategy: r.strategy,
        parameters: r.recommendedParameters!,
        runId: r.runId,
        createdAt: new Date().toISOString(),
      }));
      setPresetName("");
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : String(e));
    }
  };

  const dl = (name: string, body: string, mime: string) => downloadBlob(body, name, mime);

  if (!r) {
    return (
      <section style={panel}>
        <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 2, color: C.orange, marginBottom: 8 }}>
          EXPLAINABLE OPTIMIZER
        </div>
        <ContextReadiness status={contextStatus} onRun={runOptimizer} running={running} canRun={contextStatus.ready} error={runError} />
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

  return (
    <section style={panel}>
      <ContextReadiness status={contextStatus} onRun={runOptimizer} running={running} canRun={contextStatus.ready} error={runError} />

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
          OPTIMIZER_NO_VALID_REGION — Reasons: {r.rejectionReasons.join("; ") || "see rejected regions below."}
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

      {heatmap ? (
        <div style={{ marginTop: 14 }}>
          <div style={lbl}>Parameter Heatmap · {heatmap.xKey}{heatmap.xKey !== heatmap.yKey ? ` × ${heatmap.yKey}` : ""}</div>
          <div style={{ overflowX: "auto", marginTop: 6 }}>
            <table style={{ borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={th}></th>
                  {heatmap.xValues.map((x) => <th key={x} style={th}>{x}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatmap.cells.map((row, yi) => (
                  <tr key={yi}>
                    <td style={{ ...td, color: C.muted }}>{heatmap.yValues[yi]}</td>
                    {row.map((cell, xi) => (
                      <td key={xi} title={cell ? `${cell.classification}${cell.note ? " · " + cell.note : ""}` : "n/a"}
                          style={{ ...td, background: cell?.color ?? "transparent", color: "#000", textAlign: "center", minWidth: 42 }}>
                        {cell ? cell.classification[0] : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap", fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted }}>
            <span><span style={{ background: "#4fd18a", padding: "0 6px", color: "#000" }}>A</span> Accepted</span>
            <span><span style={{ background: "#f0a742", padding: "0 6px", color: "#000" }}>A</span> Alternative</span>
            <span><span style={{ background: "#f0656f", padding: "0 6px", color: "#000" }}>R</span> Rejected</span>
            <span><span style={{ background: "#8a8a8a", padding: "0 6px", color: "#000" }}>U</span> Unavailable</span>
          </div>
        </div>
      ) : null}

      {drift ? (
        <div style={{ marginTop: 14 }}>
          <div style={lbl}>Parameter Drift · {drift.overall}</div>
          <div style={{ marginTop: 4, color: DRIFT_COLORS[drift.overall], fontFamily: "var(--eb-mono)", fontSize: 11 }}>{drift.summary}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 4 }}>
            <thead><tr><th style={th}>Parameter</th><th style={th}>Current</th><th style={th}>Recommended</th><th style={th}>ΔSteps</th><th style={th}>Safe Range</th><th style={th}>Status</th></tr></thead>
            <tbody>
              {drift.entries.map((e) => (
                <tr key={e.name}>
                  <td style={td}>{e.name}</td>
                  <td style={td}>{e.current}</td>
                  <td style={{ ...td, color: C.green }}>{e.recommended}</td>
                  <td style={td}>{e.deltaSteps.toFixed(2)}</td>
                  <td style={td}>{e.safeMin} … {e.safeMax}</td>
                  <td style={{ ...td, color: DRIFT_COLORS[e.level] }}>{DRIFT_LABELS[e.level]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {unsafeDrift ? (
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.red }}>
              <input type="checkbox" checked={ackUnsafeDrift} onChange={(e) => setAckUnsafeDrift(e.target.checked)} />
              Acknowledge unsafe drift before saving a research preset (still research-only, never applied to live).
            </label>
          ) : null}
        </div>
      ) : null}

      {beforeAfter && beforeAfter.deltas.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div style={lbl}>Before vs After</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 4 }}>
              <thead><tr><th style={th}>Metric</th><th style={th}>Current</th><th style={th}>Recommended</th><th style={th}>Δ</th><th style={th}>%</th><th style={th}>Status</th></tr></thead>
              <tbody>
                {beforeAfter.deltas.map((d) => {
                  const status = d.delta === 0 ? "UNCHANGED" : d.favorsRecommended ? "IMPROVED" : "WORSE";
                  const color = status === "IMPROVED" ? C.green : status === "WORSE" ? C.red : C.muted;
                  return (
                    <tr key={d.key}>
                      <td style={td}>{d.key}</td>
                      <td style={td}>{d.current.toFixed(3)}</td>
                      <td style={td}>{d.recommended.toFixed(3)}</td>
                      <td style={{ ...td, color }}>{d.delta.toFixed(3)}</td>
                      <td style={td}>{d.pct == null ? "—" : `${(d.pct * 100).toFixed(1)}%`}</td>
                      <td style={{ ...td, color }}>{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 6, color: C.muted, fontFamily: "var(--eb-mono)", fontSize: 10 }}>
            Deltas are historical, not a guarantee of future performance.
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={btn} onClick={() => dl(`optimizer_before_after_${r.runId}.csv`, buildOptimizerBeforeAfterCsv(beforeAfter), "text/csv")}>Before/After CSV</button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <div style={lbl}>Research Presets</div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name"
                 style={{ background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 8px", fontFamily: "var(--eb-mono)", fontSize: 11 }} />
          <button style={btn} onClick={doSavePreset}>Save Preset</button>
          <button style={btn} onClick={() => dl(`optimizer_presets_${r.runId}.json`, buildPresetLibraryJson(presets), "application/json")}>Export Presets</button>
        </div>
        {presetError ? <div style={{ marginTop: 6, color: C.red, fontFamily: "var(--eb-mono)", fontSize: 11 }}>{presetError}</div> : null}
        {presets.presets.length === 0 ? (
          <div style={{ marginTop: 6, color: C.muted, fontFamily: "var(--eb-mono)", fontSize: 11 }}>No presets saved yet. All presets are research-only.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 6 }}>
            <thead><tr><th style={th}>Name</th><th style={th}>Strategy</th><th style={th}>Parameters</th><th style={th}>Actions</th></tr></thead>
            <tbody>
              {presets.presets.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{p.name}</td>
                  <td style={td}>{p.strategy}</td>
                  <td style={td}>{JSON.stringify(p.parameters)}</td>
                  <td style={td}>
                    <button style={btn} onClick={() => {
                      const n = typeof window !== "undefined" ? window.prompt("Rename preset", p.name) : null;
                      if (n) {
                        try { setPresets((lib) => renamePreset(lib, p.id, n, new Date().toISOString())); }
                        catch (e) { setPresetError(e instanceof Error ? e.message : String(e)); }
                      }
                    }}>Rename</button>{" "}
                    <button style={btn} onClick={() => {
                      try { setPresets((lib) => duplicatePreset(lib, p.id, `p-${Date.now()}`, new Date().toISOString())); }
                      catch (e) { setPresetError(e instanceof Error ? e.message : String(e)); }
                    }}>Duplicate</button>{" "}
                    <button style={btn} onClick={() => dl(`preset_${p.id}.json`, serializePreset(p), "application/json")}>Export</button>{" "}
                    <button style={btn} onClick={() => setPresets((lib) => deletePreset(lib, p.id))}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={lbl}>Optimizer History</div>
        {history.entries.length === 0 ? (
          <div style={{ marginTop: 6, color: C.muted, fontFamily: "var(--eb-mono)", fontSize: 11 }}>OPTIMIZER_HISTORY_EMPTY</div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 6 }}>
                <thead><tr><th style={th}></th><th style={th}>Recorded</th><th style={th}>Strategy</th><th style={th}>Score</th><th style={th}>Risk</th><th style={th}>Confidence</th><th style={th}>Run ID</th></tr></thead>
                <tbody>
                  {history.entries.map((e) => (
                    <tr key={e.id}>
                      <td style={td}>
                        <label style={{ marginRight: 4 }}>
                          <input type="radio" name="cmpA" checked={compareIds[0] === e.id} onChange={() => setCompareIds([e.id, compareIds[1]])} /> A
                        </label>
                        <label>
                          <input type="radio" name="cmpB" checked={compareIds[1] === e.id} onChange={() => setCompareIds([compareIds[0], e.id])} /> B
                        </label>
                      </td>
                      <td style={td}>{e.recordedAt}</td>
                      <td style={td}>{e.strategy}</td>
                      <td style={td}>{e.result.objectiveScore.toFixed(3)}</td>
                      <td style={td}>{e.result.overfitRisk}</td>
                      <td style={td}>{e.result.confidence}</td>
                      <td style={{ ...td, color: C.blue }}>{e.runId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={btn} onClick={() => dl(`optimizer_history_${Date.now()}.csv`, buildOptimizerHistoryCsv(history), "text/csv")}>History CSV</button>
              <button style={btn} onClick={() => setHistory(emptyOptimizerHistory())}>Clear History</button>
            </div>
            {historyCompare && entryA && entryB ? (
              <div style={{ marginTop: 8, padding: 8, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                <div style={lbl}>Run Comparison</div>
                {historyMismatch.mismatch ? (
                  <div style={{ color: C.red, fontFamily: "var(--eb-mono)", fontSize: 11, marginTop: 4 }}>
                    ⚠ Warning: {historyMismatch.reason}
                  </div>
                ) : null}
                <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.text, marginTop: 4 }}>
                  Δscore = {historyCompare.scoreDelta.toFixed(3)} · params {historyCompare.parametersChanged ? "changed" : "unchanged"} · confidence {entryA.result.confidence} → {entryB.result.confidence} · risk {entryA.result.overfitRisk} → {entryB.result.overfitRisk}
                </div>
                <div style={{ marginTop: 6 }}>
                  <button style={btn} onClick={() => dl(`optimizer_run_compare_${entryA.runId}_${entryB.runId}.csv`, buildOptimizerComparisonCsv({ a: entryA, b: entryB, comparison: historyCompare }), "text/csv")}>Comparison CSV</button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => dl(`optimizer_summary_${r.runId}.csv`, buildOptimizerSummaryCsv(r, provenance), "text/csv")}>Summary CSV</button>
        <button style={btn} onClick={() => dl(`optimizer_region_${r.runId}.csv`, buildOptimizerRecommendedRegionCsv(r, provenance), "text/csv")}>Region CSV</button>
        <button style={btn} onClick={() => dl(`optimizer_alternatives_${r.runId}.csv`, buildOptimizerAlternativesCsv(r, provenance), "text/csv")}>Alternatives CSV</button>
        <button style={btn} onClick={() => dl(`optimizer_rejected_${r.runId}.csv`, buildOptimizerRejectedCsv(r, provenance), "text/csv")}>Rejected CSV</button>
        <button style={btn} onClick={() => dl(`optimizer_full_${r.runId}.json`, buildOptimizerJson(r, provenance), "application/json")}>Full JSON</button>
        <button style={btn} onClick={() => dl(`optimizer_bundle_${r.runId}.json`, buildOptimizerBundleJson({ result: r, history, presets, comparison: beforeAfter, drift, generatedAt: new Date().toISOString() }), "application/json")}>Bundle JSON</button>
      </div>
    </section>
  );
}

function ContextReadiness({
  status, onRun, running, canRun, error,
}: {
  readonly status: ReturnType<typeof buildContextRows>;
  readonly onRun: () => void;
  readonly running: boolean;
  readonly canRun: boolean;
  readonly error: string | null;
}) {
  return (
    <div style={{ marginBottom: 12, padding: 10, border: `1px solid ${C.border}`, borderRadius: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: "var(--eb-head)", fontSize: 12, letterSpacing: 2, color: canRun ? C.green : C.orange }}>
          {canRun ? "RESEARCH CONTEXT READY" : "OPTIMIZER_RESEARCH_CONTEXT_INCOMPLETE"}
        </div>
        <button
          style={{ ...btn, borderColor: canRun ? C.green : C.border, color: canRun ? C.green : C.muted, cursor: canRun && !running ? "pointer" : "not-allowed" }}
          disabled={!canRun || running}
          onClick={onRun}
        >
          {running ? "RUNNING…" : "RUN OPTIMIZER"}
        </button>
      </div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
        {status.rows.map((row) => (
          <div key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 6, borderBottom: `1px dashed ${C.border}`, paddingBottom: 2 }}>
            <span style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{row.label}</span>
            <span style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: row.status === "READY" ? C.green : C.red }}>{row.status === "READY" ? row.detail : "MISSING"}</span>
          </div>
        ))}
      </div>
      {!canRun && status.gaps.length > 0 ? (
        <div style={{ marginTop: 6, fontFamily: "var(--eb-mono)", fontSize: 10, color: C.red }}>
          Missing: {status.gaps.map((g) => g.key).join(", ")}
        </div>
      ) : null}
      {error ? <div style={{ marginTop: 6, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.red }}>{error}</div> : null}
    </div>
  );
}