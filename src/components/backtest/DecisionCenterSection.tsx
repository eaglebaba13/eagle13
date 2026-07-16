// Phase 24 — Institutional GO / NO-GO Decision Center UI.
// Consumes evidence supplied via operator inputs and existing research
// outputs. Zero recomputation, zero broker, zero live-order.

import { useMemo, useState } from "react";
import { downloadBlob } from "@/lib/download";
import {
  evaluateDecision,
  type DecisionEvidenceInput,
} from "@/lib/decision-center/decision-center";
import { computeDecisionRunId } from "@/lib/decision-center/decision-run-id";
import {
  buildDecisionBundle,
  buildDecisionCsv,
  buildDecisionJson,
} from "@/lib/decision-center/decision-exports";

const C = {
  bg: "var(--eb-bg, #0a0f14)",
  text: "var(--eb-text, #dbe4ee)",
  muted: "var(--eb-muted, #7a8b9a)",
  border: "var(--eb-border, #1e2a36)",
  orange: "var(--eb-orange, #ff9f43)",
  green: "var(--eb-green, #26de81)",
  red: "var(--eb-red, #eb3b5a)",
  blue: "var(--eb-blue, #4b9cd3)",
};

const panel: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: 12,
  marginBottom: 12,
  background: C.bg,
};
const label: React.CSSProperties = {
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
  color: C.muted,
  letterSpacing: 1,
  textTransform: "uppercase",
};
const inputStyle: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.border}`,
  color: C.text,
  padding: "4px 6px",
  fontFamily: "var(--eb-mono)",
  fontSize: 12,
  width: "100%",
};
const btn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.border}`,
  color: C.text,
  padding: "6px 10px",
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
  cursor: "pointer",
  letterSpacing: 1,
};

type FormShape = {
  wf_id: string; wf_oos: string; wf_stab: string; wf_overfit: boolean; wf_trades: string;
  mc_id: string; mc_dd: string; mc_cagr: string; mc_ruin: string;
  rb_id: string; rb_score: string; rb_verdict: "ROBUST"|"MARGINAL"|"OVERFIT"|"UNRELIABLE";
  sn_id: string; sn_cliff: string; sn_plat: string;
  op_id: string; op_conf: string; op_cand: string;
  rv_id: string; rv_rel: string; rv_verdict: "RELIABLE"|"MARGINAL"|"UNRELIABLE";
  cx_id: string; cx_cons: string; cx_assets: string;
  pf_id: string; pf_rec: "ACCEPT"|"REVIEW"|"REJECT"; pf_dd: string; pf_div: string;
  sh_id: string; sh_ready:
    | "READY_FOR_SCHEDULED_SHADOW"|"READY_FOR_MANUAL_OBSERVATION"
    | "PAUSED_BY_DATA_QUALITY"|"PAUSED_BY_PROVIDER"|"PAUSED_BY_RESEARCH_GAP"|"NOT_READY";
  sh_acc: string; sh_cal: string; sh_res: string;
  rc_id: string; rc_wr: string; rc_pf: string; rc_conf: string;
  rs_id: string; rs_stab: string;
  rg_id: string; rg_cov: string;
  dq_ok: boolean; dq_causal: boolean; dq_hash: string;
  minTrades: string; minConf: string;
};

const DEFAULTS: FormShape = {
  wf_id: "", wf_oos: "", wf_stab: "", wf_overfit: false, wf_trades: "",
  mc_id: "", mc_dd: "", mc_cagr: "", mc_ruin: "",
  rb_id: "", rb_score: "", rb_verdict: "ROBUST",
  sn_id: "", sn_cliff: "", sn_plat: "",
  op_id: "", op_conf: "", op_cand: "",
  rv_id: "", rv_rel: "", rv_verdict: "RELIABLE",
  cx_id: "", cx_cons: "", cx_assets: "",
  pf_id: "", pf_rec: "ACCEPT", pf_dd: "", pf_div: "",
  sh_id: "", sh_ready: "READY_FOR_SCHEDULED_SHADOW", sh_acc: "", sh_cal: "", sh_res: "",
  rc_id: "", rc_wr: "", rc_pf: "", rc_conf: "",
  rs_id: "", rs_stab: "",
  rg_id: "", rg_cov: "",
  dq_ok: true, dq_causal: true, dq_hash: "",
  minTrades: "50", minConf: "0.55",
};

function n(s: string): number | null {
  const v = parseFloat(s); return Number.isFinite(v) ? v : null;
}

function toInput(f: FormShape): DecisionEvidenceInput {
  const inp: DecisionEvidenceInput = {
    minTrades: n(f.minTrades) ?? 50,
    minConfidence: n(f.minConf) ?? 0.55,
  };
  const wf_oos = n(f.wf_oos); const wf_stab = n(f.wf_stab); const wf_trades = n(f.wf_trades);
  if (f.wf_id && wf_oos !== null && wf_stab !== null && wf_trades !== null) {
    (inp as any).walkForward = { runId: f.wf_id, oosExpectancy: wf_oos, stabilityScore: wf_stab, overfitFlag: f.wf_overfit, totalTrades: wf_trades };
  }
  const mc_dd = n(f.mc_dd); const mc_c = n(f.mc_cagr); const mc_r = n(f.mc_ruin);
  if (f.mc_id && mc_dd !== null && mc_c !== null && mc_r !== null) {
    (inp as any).monteCarlo = { runId: f.mc_id, worstDrawdownPct: mc_dd, medianCagr: mc_c, ruinProbability: mc_r };
  }
  const rb_s = n(f.rb_score);
  if (f.rb_id && rb_s !== null) (inp as any).robustness = { runId: f.rb_id, score: rb_s, verdict: f.rb_verdict };
  const sn_c = n(f.sn_cliff); const sn_p = n(f.sn_plat);
  if (f.sn_id && sn_c !== null && sn_p !== null) (inp as any).sensitivity = { runId: f.sn_id, cliffScore: sn_c, plateauCoverage: sn_p };
  const op_c = n(f.op_conf);
  if (f.op_id && op_c !== null) (inp as any).optimizer = { runId: f.op_id, confidence: op_c, selectedCandidate: f.op_cand };
  const rv_r = n(f.rv_rel);
  if (f.rv_id && rv_r !== null) (inp as any).recommendationValidator = { runId: f.rv_id, reliability: rv_r, verdict: f.rv_verdict };
  const cx_c = n(f.cx_cons); const cx_a = n(f.cx_assets);
  if (f.cx_id && cx_c !== null && cx_a !== null) (inp as any).crossAsset = { runId: f.cx_id, consistency: cx_c, assetsCovered: cx_a };
  const pf_d = n(f.pf_dd); const pf_v = n(f.pf_div);
  if (f.pf_id && pf_d !== null && pf_v !== null) (inp as any).portfolio = { runId: f.pf_id, recommendation: f.pf_rec, expectedDrawdown: pf_d, diversificationScore: pf_v };
  const sh_a = n(f.sh_acc); const sh_c = n(f.sh_cal); const sh_r = n(f.sh_res);
  if (f.sh_id && sh_a !== null && sh_c !== null && sh_r !== null) (inp as any).shadow = { runId: f.sh_id, readiness: f.sh_ready, accuracy: sh_a, calibration: sh_c, resolvedTrades: sh_r };
  const rc_w = n(f.rc_wr); const rc_p = n(f.rc_pf); const rc_c = n(f.rc_conf);
  if (f.rc_id && rc_w !== null && rc_p !== null && rc_c !== null) (inp as any).recommendation = { runId: f.rc_id, expectedWinRate: rc_w, expectedProfitFactor: rc_p, confidence: rc_c };
  const rs_s = n(f.rs_stab);
  if (f.rs_id && rs_s !== null) (inp as any).researchStability = { runId: f.rs_id, stability: rs_s };
  const rg_c = n(f.rg_cov);
  if (f.rg_id && rg_c !== null) (inp as any).regime = { runId: f.rg_id, coverage: rg_c };
  if (f.dq_hash) (inp as any).dataQuality = { ok: f.dq_ok, causalityOk: f.dq_causal, dataHash: f.dq_hash };
  return inp;
}

function Field({ lbl, value, onChange, placeholder }: { lbl: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={label}>{lbl}</span>
      <input style={inputStyle} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function stateColor(s: string): string {
  if (s === "NO_GO" || s === "NOT_READY") return C.red;
  if (s.startsWith("READY_FOR_MANUAL") || s.startsWith("READY_FOR_SCHEDULED") || s.startsWith("READY_FOR_PAPER")) return C.orange;
  if (s === "GO_REVIEW_REQUIRED") return C.blue;
  return C.green;
}

function statusColor(s: string): string {
  if (s === "PASS") return C.green;
  if (s === "WARNING") return C.orange;
  if (s === "FAIL") return C.red;
  return C.muted;
}

export default function DecisionCenterSection() {
  const [f, setF] = useState<FormShape>(DEFAULTS);
  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) => setF((p) => ({ ...p, [k]: v }));

  const { result, runId, evidence } = useMemo(() => {
    const evi = toInput(f);
    const res = evaluateDecision(evi);
    return { result: res, runId: computeDecisionRunId(evi, res), evidence: evi };
  }, [f]);

  return (
    <div>
      <section style={{ ...panel, borderColor: stateColor(result.state) }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={label}>Overall Decision</div>
            <div style={{ fontFamily: "var(--eb-head)", fontSize: 22, letterSpacing: 2, color: stateColor(result.state) }}>{result.state}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={label}>Score</div>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 20, color: C.text }}>{result.score.toFixed(3)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={label}>Confidence</div>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 20, color: C.text }}>{result.confidence.toFixed(3)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={label}>Weakest / Strongest</div>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.text }}>
              {result.weakestModule ?? "—"} / {result.strongestModule ?? "—"}
            </div>
          </div>
        </div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 8 }}>
          Decision Run ID: <span style={{ color: C.blue }}>{runId}</span>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => downloadBlob(`decision-${runId}.csv`, buildDecisionCsv(result, runId), "text/csv")}>Decision CSV</button>
          <button style={btn} onClick={() => downloadBlob(`decision-${runId}.json`, buildDecisionJson(result, runId), "application/json")}>Decision JSON</button>
          <button style={btn} onClick={() => downloadBlob(`decision-bundle-${runId}.json`, buildDecisionBundle(evidence, result), "application/json")}>Decision Bundle</button>
        </div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, marginTop: 8 }}>
          Evaluates research evidence only. Does NOT generate trade signals or interact with any broker.
        </div>
      </section>

      {result.hardGates.length > 0 ? (
        <section style={{ ...panel, borderColor: C.red }}>
          <div style={{ ...label, color: C.red, marginBottom: 6 }}>Hard Gates Tripped</div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.text }}>{result.hardGates.join(" · ")}</div>
        </section>
      ) : null}

      <section style={panel}>
        <div style={{ ...label, marginBottom: 8 }}>Deployment Checklist</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
          {result.checklist.map((it) => (
            <div key={it.key} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
              <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.text, display: "flex", justifyContent: "space-between" }}>
                <span>{it.label}</span>
                <span style={{ color: statusColor(it.status) }}>{it.status}</span>
              </div>
              <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, marginTop: 2 }}>{it.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={panel}>
        <div style={{ ...label, marginBottom: 8 }}>Risk Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
          <RiskCard label="Expected DD" v={result.risk.expectedDrawdown} pct />
          <RiskCard label="Worst MC DD" v={result.risk.worstMonteCarloDrawdown} pct />
          <RiskCard label="Portfolio DD" v={result.risk.expectedPortfolioDrawdown} pct />
          <RiskCard label="Win Rate" v={result.risk.expectedWinRate} pct />
          <RiskCard label="Profit Factor" v={result.risk.expectedProfitFactor} />
          <RiskCard label="Shadow Accuracy" v={result.risk.shadowAccuracy} pct />
          <RiskCard label="Rec. Reliability" v={result.risk.recommendationReliability} pct />
          <RiskCard label="Calibration" v={result.risk.calibration} pct />
        </div>
      </section>

      <section style={panel}>
        <div style={{ ...label, marginBottom: 8 }}>Component Scores</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
          <thead>
            <tr style={{ color: C.muted, textAlign: "left" }}>
              {["Component","Weight","Score","Present"].map((h) => (<th key={h} style={{ padding: "4px 6px", borderBottom: `1px solid ${C.border}` }}>{h}</th>))}
            </tr>
          </thead>
          <tbody>
            {result.components.map((cc) => (
              <tr key={cc.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "4px 6px" }}>{cc.key}</td>
                <td style={{ padding: "4px 6px" }}>{cc.weight.toFixed(3)}</td>
                <td style={{ padding: "4px 6px", color: cc.present ? (cc.score >= 0.7 ? C.green : cc.score >= 0.4 ? C.orange : C.red) : C.muted }}>
                  {cc.present ? cc.score.toFixed(3) : "—"}
                </td>
                <td style={{ padding: "4px 6px", color: cc.present ? C.green : C.red }}>{cc.present ? "YES" : "MISSING"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={panel}>
        <div style={{ ...label, marginBottom: 8 }}>Supporting Run IDs</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 6, fontFamily: "var(--eb-mono)", fontSize: 11 }}>
          {Object.entries(result.supportingRunIds).map(([k, v]) => (
            <div key={k}><span style={{ color: C.muted }}>{k}: </span><span style={{ color: C.blue }}>{v}</span></div>
          ))}
          {Object.keys(result.supportingRunIds).length === 0 ? (
            <div style={{ color: C.muted }}>No evidence supplied yet — fill in the form below.</div>
          ) : null}
        </div>
      </section>

      <section style={panel}>
        <div style={{ ...label, marginBottom: 10 }}>Evidence Inputs (paste Run IDs and metrics from completed research tabs)</div>

        <Group title="Walk-Forward">
          <Field lbl="Run ID" value={f.wf_id} onChange={(v)=>set("wf_id",v)} placeholder="WF:..." />
          <Field lbl="OOS Expectancy (R)" value={f.wf_oos} onChange={(v)=>set("wf_oos",v)} placeholder="0.6" />
          <Field lbl="Stability Score" value={f.wf_stab} onChange={(v)=>set("wf_stab",v)} placeholder="0..1" />
          <Field lbl="Total Trades" value={f.wf_trades} onChange={(v)=>set("wf_trades",v)} placeholder="200" />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--eb-mono)", fontSize: 11 }}>
            <input type="checkbox" checked={f.wf_overfit} onChange={(e)=>set("wf_overfit", e.target.checked)} /> Overfit Flag
          </label>
        </Group>

        <Group title="Monte Carlo">
          <Field lbl="Run ID" value={f.mc_id} onChange={(v)=>set("mc_id",v)} />
          <Field lbl="Worst DD (0..1)" value={f.mc_dd} onChange={(v)=>set("mc_dd",v)} />
          <Field lbl="Median CAGR" value={f.mc_cagr} onChange={(v)=>set("mc_cagr",v)} />
          <Field lbl="Ruin Prob (0..1)" value={f.mc_ruin} onChange={(v)=>set("mc_ruin",v)} />
        </Group>

        <Group title="Robustness">
          <Field lbl="Run ID" value={f.rb_id} onChange={(v)=>set("rb_id",v)} />
          <Field lbl="Score" value={f.rb_score} onChange={(v)=>set("rb_score",v)} />
          <Select lbl="Verdict" value={f.rb_verdict} onChange={(v)=>set("rb_verdict", v as any)}
            options={["ROBUST","MARGINAL","OVERFIT","UNRELIABLE"]} />
        </Group>

        <Group title="Sensitivity">
          <Field lbl="Run ID" value={f.sn_id} onChange={(v)=>set("sn_id",v)} />
          <Field lbl="Cliff Score" value={f.sn_cliff} onChange={(v)=>set("sn_cliff",v)} />
          <Field lbl="Plateau Coverage" value={f.sn_plat} onChange={(v)=>set("sn_plat",v)} />
        </Group>

        <Group title="Optimizer">
          <Field lbl="Run ID" value={f.op_id} onChange={(v)=>set("op_id",v)} />
          <Field lbl="Confidence" value={f.op_conf} onChange={(v)=>set("op_conf",v)} />
          <Field lbl="Candidate" value={f.op_cand} onChange={(v)=>set("op_cand",v)} />
        </Group>

        <Group title="Recommendation Validator">
          <Field lbl="Run ID" value={f.rv_id} onChange={(v)=>set("rv_id",v)} />
          <Field lbl="Reliability" value={f.rv_rel} onChange={(v)=>set("rv_rel",v)} />
          <Select lbl="Verdict" value={f.rv_verdict} onChange={(v)=>set("rv_verdict", v as any)}
            options={["RELIABLE","MARGINAL","UNRELIABLE"]} />
        </Group>

        <Group title="Cross-Asset">
          <Field lbl="Run ID" value={f.cx_id} onChange={(v)=>set("cx_id",v)} />
          <Field lbl="Consistency" value={f.cx_cons} onChange={(v)=>set("cx_cons",v)} />
          <Field lbl="Assets Covered" value={f.cx_assets} onChange={(v)=>set("cx_assets",v)} />
        </Group>

        <Group title="Portfolio">
          <Field lbl="Run ID" value={f.pf_id} onChange={(v)=>set("pf_id",v)} />
          <Select lbl="Recommendation" value={f.pf_rec} onChange={(v)=>set("pf_rec", v as any)}
            options={["ACCEPT","REVIEW","REJECT"]} />
          <Field lbl="Expected DD" value={f.pf_dd} onChange={(v)=>set("pf_dd",v)} />
          <Field lbl="Diversification" value={f.pf_div} onChange={(v)=>set("pf_div",v)} />
        </Group>

        <Group title="Shadow Validation">
          <Field lbl="Run ID" value={f.sh_id} onChange={(v)=>set("sh_id",v)} />
          <Select lbl="Readiness" value={f.sh_ready} onChange={(v)=>set("sh_ready", v as any)}
            options={["READY_FOR_SCHEDULED_SHADOW","READY_FOR_MANUAL_OBSERVATION","PAUSED_BY_DATA_QUALITY","PAUSED_BY_PROVIDER","PAUSED_BY_RESEARCH_GAP","NOT_READY"]} />
          <Field lbl="Accuracy" value={f.sh_acc} onChange={(v)=>set("sh_acc",v)} />
          <Field lbl="Calibration" value={f.sh_cal} onChange={(v)=>set("sh_cal",v)} />
          <Field lbl="Resolved Trades" value={f.sh_res} onChange={(v)=>set("sh_res",v)} />
        </Group>

        <Group title="Recommendation Engine">
          <Field lbl="Run ID" value={f.rc_id} onChange={(v)=>set("rc_id",v)} />
          <Field lbl="Win Rate" value={f.rc_wr} onChange={(v)=>set("rc_wr",v)} />
          <Field lbl="Profit Factor" value={f.rc_pf} onChange={(v)=>set("rc_pf",v)} />
          <Field lbl="Confidence" value={f.rc_conf} onChange={(v)=>set("rc_conf",v)} />
        </Group>

        <Group title="Research Stability">
          <Field lbl="Run ID" value={f.rs_id} onChange={(v)=>set("rs_id",v)} />
          <Field lbl="Stability" value={f.rs_stab} onChange={(v)=>set("rs_stab",v)} />
        </Group>

        <Group title="Regime Intelligence">
          <Field lbl="Run ID" value={f.rg_id} onChange={(v)=>set("rg_id",v)} />
          <Field lbl="Coverage" value={f.rg_cov} onChange={(v)=>set("rg_cov",v)} />
        </Group>

        <Group title="Data Quality">
          <Field lbl="Data Hash" value={f.dq_hash} onChange={(v)=>set("dq_hash",v)} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--eb-mono)", fontSize: 11 }}>
            <input type="checkbox" checked={f.dq_ok} onChange={(e)=>set("dq_ok", e.target.checked)} /> Data OK
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--eb-mono)", fontSize: 11 }}>
            <input type="checkbox" checked={f.dq_causal} onChange={(e)=>set("dq_causal", e.target.checked)} /> Causality OK
          </label>
        </Group>

        <Group title="Thresholds">
          <Field lbl="Min Trades" value={f.minTrades} onChange={(v)=>set("minTrades",v)} />
          <Field lbl="Min Confidence" value={f.minConf} onChange={(v)=>set("minConf",v)} />
        </Group>

        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button style={btn} onClick={() => setF(DEFAULTS)}>Reset</button>
        </div>
      </section>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, marginBottom: 8 }}>
      <div style={{ ...label, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, alignItems: "end" }}>
        {children}
      </div>
    </div>
  );
}

function Select({ lbl, value, onChange, options }: { lbl: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={label}>{lbl}</span>
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (<option key={o} value={o}>{o}</option>))}
      </select>
    </label>
  );
}

function RiskCard({ label: lbl, v, pct }: { label: string; v: number | null; pct?: boolean }) {
  const display = v === null ? "—" : (pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(2));
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
      <div style={label}>{lbl}</div>
      <div style={{ color: C.text }}>{display}</div>
    </div>
  );
}