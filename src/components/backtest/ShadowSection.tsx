// Phase 23 · Stage 1 — Shadow Validation UI. Observation-only. No broker
// imports, no live-order paths. Lazy-loaded from the Research panel.

import { useMemo, useState } from "react";
import { downloadBlob } from "@/lib/download";
import {
  buildDriftCsv,
  buildEventsCsv,
  buildMetricsCsv,
  buildObservationsCsv,
  buildPortfolioShadowCsv,
  buildSessionsCsv,
  buildShadowBundleJson,
} from "@/lib/shadow/shadow-exports";
import { ShadowHistoryStore } from "@/lib/shadow/shadow-history";
import { computeShadowMetrics } from "@/lib/shadow/shadow-metrics";
import { classifyShadowDrift } from "@/lib/shadow/shadow-drift";
import { reduce, evaluateEntryGates } from "@/lib/shadow/shadow-orchestrator";
import { trackOutcome } from "@/lib/shadow/shadow-outcome";
import {
  defaultPolicy,
  SHADOW_DISCLAIMER,
  type ShadowClosedCandle,
  type ShadowDataSnapshot,
  type ShadowObservation,
  type ShadowPortfolioDecision,
  type ShadowRecommendation,
} from "@/lib/shadow/shadow-types";

const C = {
  card: "var(--eb-card)",
  border: "var(--eb-border)",
  text: "var(--eb-text)",
  muted: "var(--eb-muted)",
  green: "var(--eb-bull)",
  red: "var(--eb-bear)",
  orange: "var(--eb-accent)",
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
const btnGhost: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  background: "transparent",
  color: C.text,
  fontFamily: "var(--eb-mono)",
  fontSize: 12,
  cursor: "pointer",
};

function mockCandles(): readonly ShadowClosedCandle[] {
  return [
    { date: "2024-01-15T09:15:00Z", open: 100, high: 100.8, low: 99.5, close: 100.5, closed: true },
    { date: "2024-01-15T09:20:00Z", open: 100.5, high: 101.4, low: 100.3, close: 101.2, closed: true },
    { date: "2024-01-15T09:25:00Z", open: 101.2, high: 102.1, low: 101.0, close: 102.0, closed: true },
  ];
}

function mockRecommendation(): ShadowRecommendation {
  return {
    runId: "REC_V1:shadow-demo",
    strategy: "ASTRO",
    formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
    direction: "BUY",
    confidence: 0.72,
    reliability: "HIGH",
    score: 0.78,
    regime: "TREND_UP",
  };
}

function mockPortfolio(): ShadowPortfolioDecision {
  return {
    runId: "PORTFOLIO_RESEARCH_V1:shadow-demo",
    assetId: "asset-astro-nifty",
    included: true,
    allocationWeight: 0.35,
    sizingUnits: 12,
    riskBudgetPct: 0.01,
    correlationExposure: 0.4,
    capitalUtilizationPct: 0.55,
    confidence: 0.7,
    hardGatePassed: true,
    blockingReasons: [],
  };
}

export default function ShadowSection() {
  const [store] = useState(() => new ShadowHistoryStore());
  const [tick, setTick] = useState(0);

  const data: ShadowDataSnapshot = useMemo(
    () => ({
      instrument: "NIFTY50",
      timeframe: "5m",
      session: "2024-01-15",
      providerId: "MOCK",
      providerTimestamp: new Date().toISOString(),
      timezone: "Asia/Kolkata",
      dataHash: "hash-mock-shadow",
      quality: "LIVE",
      ageSeconds: 15,
      candles: mockCandles(),
    }),
    [],
  );

  const policy = defaultPolicy();
  const recommendation = mockRecommendation();
  const portfolio = mockPortfolio();

  const gate = evaluateEntryGates({
    data,
    recommendation,
    portfolio,
    policy,
    nowIso: new Date().toISOString(),
    hasActiveShadow: false,
    strategiesAgree: true,
    causalityOk: true,
    formulaAligned: true,
  });

  const record = () => {
    const now = new Date().toISOString();
    const r = reduce({
      data,
      recommendation,
      portfolio,
      policy,
      nowIso: now,
      hasActiveShadow: false,
      strategiesAgree: true,
      causalityOk: true,
      formulaAligned: true,
    });
    store.addSession(r.session);
    store.addEvents(r.events);
    if (r.observation) {
      let obs = r.observation;
      if (obs.hypothetical) {
        const outcome = trackOutcome({
          position: obs.hypothetical,
          candles: data.candles.slice(1),
          policy,
        });
        obs = { ...obs, outcome, status: outcome.exit === "TARGET" ? "TARGET_HIT_SHADOW" : outcome.exit === "STOP" ? "STOP_HIT_SHADOW" : "SESSION_EXIT_SHADOW" };
      }
      store.addObservation(obs);
    }
    store.addPortfolioDecision(portfolio);
    setTick((t) => t + 1);
  };

  const snapshot = useMemo(() => store.snapshot(new Date().toISOString()), [store, tick]);
  const metrics = useMemo(() => computeShadowMetrics(snapshot.observations, snapshot.portfolioDecisions), [snapshot]);
  const drift = useMemo(
    () =>
      classifyShadowDrift({
        baseline: {
          winRate: 0.55,
          profitFactor: 1.5,
          expectedConfidence: 0.65,
          capitalUtilization: 0.5,
          dataQualityScore: 1,
          correlation: 0.3,
        },
        current: { ...metrics, dataQualityScore: 1 },
        sampleSize: snapshot.observations.length,
      }),
    [metrics, snapshot.observations.length],
  );

  const gateChecks: readonly { label: string; ok: boolean }[] = [
    { label: "Closed candle", ok: data.candles.every((c) => c.closed) },
    { label: "Provider freshness", ok: data.ageSeconds <= policy.maxDataAgeSeconds },
    { label: "Data quality", ok: data.quality === "LIVE" || (data.quality === "DELAYED" && policy.acceptDelayed) },
    { label: "Formula alignment", ok: !gate.reasons.includes("FORMULA_MISMATCH") },
    { label: "Data hash", ok: !!data.dataHash },
    { label: "Recommendation confidence", ok: recommendation.confidence >= policy.minConfidence },
    { label: "Reliability", ok: !["POOR", "UNRELIABLE"].includes(recommendation.reliability) },
    { label: "Strategy agreement", ok: !gate.reasons.includes("STRATEGY_CONFLICT") },
    { label: "Portfolio hard gate", ok: portfolio.hardGatePassed },
    { label: "Causality", ok: !gate.reasons.includes("CAUSALITY_FAILURE") },
    { label: "No active shadow", ok: !gate.reasons.includes("ACTIVE_SHADOW_EXISTS") },
  ];

  const exp = (name: string, mime: string, content: string) => downloadBlob(content, name, mime);

  return (
    <div>
      <div style={{ ...panel, borderColor: C.orange }}>
        <div style={{ ...lbl, color: C.orange }}>Shadow Validation</div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.text }}>
          SHADOW RESEARCH ONLY · NO LIVE ORDER · NO BROKER ACTION
        </div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 6 }}>
          {SHADOW_DISCLAIMER}
        </div>
      </div>

      <div style={panel}>
        <div style={lbl}>Observation Status</div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 14, color: gate.ok ? C.green : C.red }}>
          {gate.status}
        </div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 6 }}>
          Regime: {recommendation.regime ?? "—"} · Confidence: {(recommendation.confidence * 100).toFixed(1)}% · Reliability: {recommendation.reliability}
        </div>
        {gate.reasons.length ? (
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.red, marginTop: 6 }}>
            Blocked: {gate.reasons.join(", ")}
          </div>
        ) : null}
        <div style={{ marginTop: 10 }}>
          <button style={btnGhost} onClick={record}>Record shadow observation</button>
        </div>
      </div>

      <div style={panel}>
        <div style={lbl}>Hard-gate Checklist</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 6 }}>
          {gateChecks.map((c) => (
            <div key={c.label} style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: c.ok ? C.green : C.red }}>
              {c.ok ? "✓" : "✗"} {c.label}
            </div>
          ))}
        </div>
      </div>

      <div style={panel}>
        <div style={lbl}>Shadow Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8 }}>
          <Metric label="Observed" v={metrics.recommendationsObserved} />
          <Metric label="Blocked" v={metrics.recommendationsBlocked} />
          <Metric label="Entries" v={metrics.entries} />
          <Metric label="Win rate" v={`${(metrics.winRate * 100).toFixed(1)}%`} />
          <Metric label="Profit factor" v={Number.isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : "∞"} />
          <Metric label="Expectancy" v={metrics.expectancy.toFixed(3)} />
          <Metric label="Max DD" v={metrics.maxDrawdown.toFixed(2)} />
          <Metric label="MFE avg" v={metrics.mfeAvg.toFixed(3)} />
          <Metric label="MAE avg" v={metrics.maeAvg.toFixed(3)} />
          <Metric label="Brier" v={metrics.brier.toFixed(3)} />
          <Metric label="Calib err" v={metrics.calibrationError.toFixed(3)} />
          <Metric label="Drift" v={drift.overall} />
        </div>
      </div>

      <div style={panel}>
        <div style={lbl}>Paper Timeline · last events</div>
        <div style={{ maxHeight: 160, overflow: "auto", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
          {snapshot.events.length === 0 ? (
            <div style={{ color: C.muted }}>No events recorded yet.</div>
          ) : (
            snapshot.events.slice(-25).map((e) => (
              <div key={e.id} style={{ borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
                <span style={{ color: C.orange }}>{e.kind}</span>
                <span style={{ color: C.muted }}> · {e.at}</span>
                {e.reason ? <span style={{ color: C.red }}> · {e.reason}</span> : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={panel}>
        <div style={lbl}>Shadow History</div>
        <div style={{ maxHeight: 180, overflow: "auto", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
          {snapshot.observations.length === 0 ? (
            <div style={{ color: C.muted }}>No observations yet.</div>
          ) : (
            snapshot.observations.map((o) => (
              <div key={o.id} style={{ borderBottom: `1px solid ${C.border}`, padding: "4px 0" }}>
                <span style={{ color: o.outcome.netAfterCosts > 0 ? C.green : C.red }}>{o.direction}</span>
                <span> · conf {(o.confidence * 100).toFixed(0)}%</span>
                <span> · {o.status}</span>
                <span> · MFE {o.outcome.mfe.toFixed(2)} / MAE {o.outcome.mae.toFixed(2)}</span>
                <span> · net {o.outcome.netAfterCosts.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={panel}>
        <div style={lbl}>Exports</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button style={btnGhost} onClick={() => exp("shadow-observations.csv", "text/csv", buildObservationsCsv(snapshot.observations))}>Observations CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-events.csv", "text/csv", buildEventsCsv(snapshot.events))}>Events CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-sessions.csv", "text/csv", buildSessionsCsv(snapshot.sessions))}>Sessions CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-metrics.csv", "text/csv", buildMetricsCsv(metrics))}>Metrics CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-drift.csv", "text/csv", buildDriftCsv(drift))}>Drift CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-portfolio.csv", "text/csv", buildPortfolioShadowCsv(snapshot.portfolioDecisions))}>Portfolio Shadow CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-bundle.json", "application/json", buildShadowBundleJson({ version: "SHADOW_BUNDLE_V1", disclaimer: SHADOW_DISCLAIMER, snapshot, metrics, drift }))}>Full Bundle JSON</button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, v }: { label: string; v: string | number }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 14, color: C.text, marginTop: 4 }}>{v}</div>
    </div>
  );
}