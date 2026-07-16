// Phase 23 · Stage 3 — Shadow Validation UI wired to the live controller.
// Observation-only. No broker imports, no live-order paths.
// Lazy-loaded from the Research panel.

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildActivePositionsCsv,
  buildLiveObservationsCsv,
  buildProviderHealthCsv,
  buildSchedulerEventsCsv,
  buildScheduledShadowBundleJson,
} from "@/lib/shadow/shadow-live-exports";
import { computeShadowMetrics } from "@/lib/shadow/shadow-metrics";
import { classifyShadowDrift } from "@/lib/shadow/shadow-drift";
import {
  ShadowLiveController,
  type ControllerSnapshot,
} from "@/lib/shadow/shadow-live-controller";
import {
  createCsvReplayAdapter,
  createMockAdapter,
  createUnavailableAdapter,
  type LiveDataProviderAdapter,
} from "@/lib/shadow/live-data-provider";
import { getSessionPolicy } from "@/lib/shadow/candle-close-policy";
import type { SchedulerConfig } from "@/lib/shadow/shadow-scheduler";
import {
  defaultPolicy,
  SHADOW_DISCLAIMER,
  type ShadowClosedCandle,
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

// ---- Providers -----------------------------------------------------------

type ProviderId = "MOCK" | "CSV_REPLAY" | "YAHOO_LIMITED" | "UNAVAILABLE_TEST";

const INSTRUMENTS = ["NIFTY50", "BANKNIFTY", "BTC", "XAUUSD", "CRUDEOIL", "NATURALGAS"] as const;
const TIMEFRAMES = ["1m", "3m", "5m", "15m", "1d"] as const;

function buildProvider(id: ProviderId, instrument: string, timeframe: string): LiveDataProviderAdapter {
  const session = getSessionPolicy(instrument);
  const marketHours = session
    ? { timezone: session.timezone, openHHMM: session.openHHMM, closeHHMM: session.closeHHMM, is247: session.is247 }
    : { timezone: "UTC", openHHMM: "00:00", closeHHMM: "23:59", is247: true };
  const timezone = session?.timezone ?? "UTC";
  const candles = mockCandles();
  const providerTimestamp = candles[candles.length - 1].date;
  if (id === "MOCK") {
    return createMockAdapter({
      id: "mock",
      label: "Mock",
      instruments: [instrument],
      timeframes: [timeframe],
      timezone,
      marketHours,
      candles,
      providerTimestamp,
      ageSeconds: 15,
    });
  }
  if (id === "CSV_REPLAY") {
    return createCsvReplayAdapter({
      instruments: [instrument],
      timeframes: [timeframe],
      timezone,
      marketHours,
      candles,
      providerTimestamp,
      ageSeconds: 30,
    });
  }
  if (id === "YAHOO_LIMITED") return createUnavailableAdapter("yahoo", "Yahoo (limited)");
  return createUnavailableAdapter("unavailable-test", "Unavailable (test)");
}

function buildConfig(instrument: string, timeframe: string): SchedulerConfig {
  const session = getSessionPolicy(instrument);
  return {
    cadence: "INTERVAL",
    intervalSeconds: 60,
    instrument,
    timeframe,
    session: new Date().toISOString().slice(0, 10),
    policy: defaultPolicy(),
    ambiguous: "CONSERVATIVE",
    candlePolicy: {
      timeframe,
      gracePeriodSeconds: 15,
      staleAfterSeconds: 900,
      is247: session?.is247 ?? true,
    },
  };
}

function evidenceOf(): ReturnType<
  () => import("@/lib/shadow/shadow-evidence-resolver").ResearchEvidenceInput
> {
  return {
    recommendation: mockRecommendation(),
    portfolio: mockPortfolio(),
    regime: "TREND_UP",
    formulaAligned: true,
    causalityOk: true,
    strategiesAgree: true,
    reliabilityAcceptable: true,
    policy: defaultPolicy(),
  };
}

// Confidence bucket helper.
type Bucket = { label: string; from: number; to: number };
const BUCKETS: readonly Bucket[] = [
  { label: "50–60", from: 0.5, to: 0.6 },
  { label: "60–70", from: 0.6, to: 0.7 },
  { label: "70–80", from: 0.7, to: 0.8 },
  { label: "80–90", from: 0.8, to: 0.9 },
  { label: "90–100", from: 0.9, to: 1.0001 },
];

// ---- Component ------------------------------------------------------------

export default function ShadowSection() {
  const [providerId, setProviderId] = useState<ProviderId>("MOCK");
  const [instrument, setInstrument] = useState<string>("NIFTY50");
  const [timeframe, setTimeframe] = useState<string>("5m");
  const [confirmClear, setConfirmClear] = useState(false);

  const controllerRef = useRef<ShadowLiveController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new ShadowLiveController(
      buildProvider(providerId, instrument, timeframe),
      buildConfig(instrument, timeframe),
      { evidenceProvider: evidenceOf },
    );
  }
  const controller = controllerRef.current;

  const [snap, setSnap] = useState<ControllerSnapshot>(() => controller.snapshot());

  useEffect(() => controller.subscribe(setSnap), [controller]);

  // Reconfigure when provider / instrument / timeframe change.
  useEffect(() => {
    controller.reconfigure(
      buildProvider(providerId, instrument, timeframe),
      buildConfig(instrument, timeframe),
    );
  }, [controller, providerId, instrument, timeframe]);

  // Stop controller on unmount.
  useEffect(() => () => controller.stop(), [controller]);

  const history = useMemo(
    () => controller.getScheduler().getHistory().snapshot(new Date().toISOString()),
    // Re-derive whenever the timeline advances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, snap.counters.shadowTransitionCount, snap.counters.providerFetchCount],
  );
  const metrics = useMemo(
    () => computeShadowMetrics(history.observations, history.portfolioDecisions),
    [history],
  );
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
        sampleSize: history.observations.length,
      }),
    [metrics, history.observations.length],
  );

  const activePositions = controller.getScheduler().getActiveStore().values();
  const providerHealth = snap.lastResult?.readiness ?? null;
  const health = snap.lastResult
    ? null // detailed health is embedded in reduce; provider status derived from snapshot
    : null;
  const provider = controller.getProvider();

  const canStart = !snap.running && snap.schedulerState !== "STOPPED";
  const canPause = snap.running;
  const canResume = !snap.running && snap.schedulerState !== "STOPPED" && snap.lastRunAt !== null;
  const canStop = snap.schedulerState !== "STOPPED";
  const canRunOnce = !snap.running && snap.schedulerState !== "STOPPED";

  const readiness = snap.lastResult?.readiness ?? { status: "NOT_READY", reasons: [] as readonly string[] };
  const candleStatus = snap.lastResult?.candleStatus ?? "DATA_INCOMPLETE";
  const lastCandle = readLastCandle(snap);

  const exp = (name: string, mime: string, content: string) => downloadBlob(content, name, mime);

  return (
    <div>
      {/* Persistent safety banner */}
      <div style={{ ...panel, borderColor: C.orange, position: "sticky", top: 0, zIndex: 2 }}>
        <div style={{ ...lbl, color: C.orange }}>Shadow Validation</div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.text }}>
          SHADOW OBSERVATION ONLY · NO LIVE ORDER · NO BROKER ACTION · NOT A TRADE RECOMMENDATION
        </div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 6 }}>
          {SHADOW_DISCLAIMER}
        </div>
      </div>

      {/* Provider / instrument / timeframe */}
      <div style={panel}>
        <div style={lbl}>Provider &amp; Market</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="Provider">
            <Select value={providerId} onChange={(v) => setProviderId(v as ProviderId)}>
              <option value="MOCK">MOCK</option>
              <option value="CSV_REPLAY">CSV_REPLAY</option>
              <option value="YAHOO_LIMITED">YAHOO_LIMITED</option>
              <option value="UNAVAILABLE_TEST">UNAVAILABLE_TEST</option>
            </Select>
          </Field>
          <Field label="Instrument">
            <Select value={instrument} onChange={setInstrument}>
              {INSTRUMENTS.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </Select>
          </Field>
          <Field label="Timeframe">
            <Select value={timeframe} onChange={setTimeframe}>
              {TIMEFRAMES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div style={{ marginTop: 8, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
          {provider.label} · {provider.timezone} · open {provider.marketHours.openHHMM}–{provider.marketHours.closeHHMM}
          {" · "}TFs [{provider.supportedTimeframes.join(", ") || "—"}]
          {" · "}Instruments [{provider.supportedInstruments.join(", ") || "—"}]
        </div>
      </div>

      {/* Controls */}
      <div style={panel}>
        <div style={lbl}>Observation Controls</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnGhost} disabled={!canRunOnce} onClick={() => void controller.runOnce()}>Run Once</button>
          <button style={btnGhost} disabled={!canStart} onClick={() => controller.start()}>Start Observation</button>
          <button style={btnGhost} disabled={!canPause} onClick={() => controller.pause()}>Pause</button>
          <button style={btnGhost} disabled={!canResume} onClick={() => controller.resume()}>Resume</button>
          <button style={btnGhost} disabled={!canStop} onClick={() => controller.stop()}>Stop</button>
          <button
            style={{ ...btnGhost, borderColor: confirmClear ? C.red : C.border, color: confirmClear ? C.red : C.text }}
            onClick={() => {
              if (!confirmClear) { setConfirmClear(true); return; }
              controller.clearHistory();
              setConfirmClear(false);
            }}
          >
            {confirmClear ? "Confirm Clear Local History" : "Clear Local History"}
          </button>
        </div>
        <div style={{ marginTop: 8, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
          View state: <span style={{ color: viewColor(snap.viewState) }}>{snap.viewState}</span>
          {" · "}Scheduler: {snap.schedulerState}
          {snap.lastError ? <span style={{ color: C.red }}> · {snap.lastError}</span> : null}
        </div>
      </div>

      {/* Scheduler Status */}
      <div style={panel}>
        <div style={lbl}>Scheduler Status</div>
        <StatGrid
          rows={[
            ["Scheduler state", snap.schedulerState],
            ["View state", snap.viewState],
            ["Readiness", readiness.status],
            ["Last run", snap.lastRunAt ?? "—"],
            ["Next expected", snap.nextExpectedAt ?? "—"],
            ["Last closed candle", lastCandle],
            ["Session date", controller.getConfig().session],
            ["Data quality", candleStatus],
            ["Instrument/TF", `${instrument} · ${timeframe}`],
            ["Scheduler Run ID", snap.schedulerRunId],
          ]}
        />
      </div>

      {/* Readiness Checklist */}
      <div style={panel}>
        <div style={lbl}>Readiness Checklist</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 6 }}>
          {readinessChecklist(snap).map((c) => (
            <div key={c.label} style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: c.ok ? C.green : C.red }}>
              {c.ok ? "✓" : "✗"} {c.label}
              {!c.ok && c.reason ? <span style={{ color: C.muted }}> · {c.reason}</span> : null}
            </div>
          ))}
        </div>
      </div>

      {/* Closed-candle panel */}
      <div style={panel}>
        <div style={lbl}>Closed-Candle Validation</div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: candleStatus === "CLOSED_VALID" ? C.green : C.red }}>
          {candleStatus}
          {candleStatus === "CLOSED_VALID" ? " · ELIGIBLE FOR SHADOW PROCESSING" : ""}
        </div>
        <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 6 }}>
          Timeframe {timeframe} · Timezone {provider.timezone} · Grace {controller.getConfig().candlePolicy.gracePeriodSeconds}s
          {" · "}Stale-after {controller.getConfig().candlePolicy.staleAfterSeconds}s
        </div>
      </div>

      {/* Provider health */}
      <div style={panel}>
        <div style={lbl}>Provider Health</div>
        <StatGrid
          rows={[
            ["Provider", provider.id],
            ["Label", provider.label],
            ["Readiness", readiness.status],
            ["Blocking reasons", readiness.reasons.join(", ") || "—"],
            ["Supported instruments", provider.supportedInstruments.join(", ") || "—"],
            ["Supported timeframes", provider.supportedTimeframes.join(", ") || "—"],
            ["Limitations", provider.getProviderHealth().limitations.join(", ") || "—"],
          ]}
        />
        <div style={{ marginTop: 8 }}>
          <button style={btnGhost} onClick={() => void controller.runOnce()}>Retry</button>
        </div>
      </div>

      {/* Active shadow positions */}
      <div style={panel}>
        <div style={lbl}>Active Shadow Positions</div>
        {activePositions.length === 0 ? (
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.muted }}>None.</div>
        ) : (
          <div style={{ overflowX: "auto", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
            <table style={{ borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr style={{ color: C.muted }}>
                  {["Instrument", "TF", "Strategy", "Formula", "Side", "Entry", "Stop", "Target", "MFE", "MAE", "Bars", "Max", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "4px 8px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activePositions.map((p) => (
                  <tr key={`${p.key.instrument}-${p.key.timeframe}-${p.key.strategy}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "4px 8px" }}>{p.key.instrument}</td>
                    <td style={{ padding: "4px 8px" }}>{p.key.timeframe}</td>
                    <td style={{ padding: "4px 8px" }}>{p.key.strategy}</td>
                    <td style={{ padding: "4px 8px" }}>{p.key.formulaVersion}</td>
                    <td style={{ padding: "4px 8px", color: p.position.side === "LONG" ? C.green : C.red }}>{p.position.side}</td>
                    <td style={{ padding: "4px 8px" }}>{p.position.entry.toFixed(2)}</td>
                    <td style={{ padding: "4px 8px" }}>{p.position.stop.toFixed(2)}</td>
                    <td style={{ padding: "4px 8px" }}>{p.position.target.toFixed(2)}</td>
                    <td style={{ padding: "4px 8px" }}>{p.mfe.toFixed(2)}</td>
                    <td style={{ padding: "4px 8px" }}>{p.mae.toFixed(2)}</td>
                    <td style={{ padding: "4px 8px" }}>{p.barsElapsed}</td>
                    <td style={{ padding: "4px 8px" }}>{Number.isFinite(p.maxHoldBars) ? p.maxHoldBars : "∞"}</td>
                    <td style={{ padding: "4px 8px" }}>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div style={panel}>
        <div style={lbl}>Scheduler Timeline</div>
        <div style={{ maxHeight: 200, overflow: "auto", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
          {snap.timeline.length === 0 ? (
            <div style={{ color: C.muted }}>No events yet.</div>
          ) : (
            [...snap.timeline].reverse().slice(0, 60).map((e, i) => (
              <div key={`${e.at}-${i}`} style={{ borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
                <span style={{ color: C.orange }}>{e.kind}</span>
                <span style={{ color: C.muted }}> · {e.at}</span>
                <span> · {e.status}</span>
                {e.reason ? <span style={{ color: C.red }}> · {e.reason}</span> : null}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Metrics */}
      <div style={panel}>
        <div style={lbl}>Shadow Metrics</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8 }}>
          <Metric label="Observed" v={metrics.recommendationsObserved} />
          <Metric label="Blocked" v={metrics.recommendationsBlocked} />
          <Metric label="Entries" v={metrics.entries} />
          <Metric label="Wins" v={metrics.wins} />
          <Metric label="Losses" v={metrics.losses} />
          <Metric label="Win rate" v={`${(metrics.winRate * 100).toFixed(1)}%`} />
          <Metric label="Profit factor" v={Number.isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : "∞"} />
          <Metric label="Expectancy" v={metrics.expectancy.toFixed(3)} />
          <Metric label="Max DD" v={metrics.maxDrawdown.toFixed(2)} />
          <Metric label="MFE avg" v={metrics.mfeAvg.toFixed(3)} />
          <Metric label="MAE avg" v={metrics.maeAvg.toFixed(3)} />
          <Metric label="Coverage" v={metrics.coverage.toFixed(3)} />
          <Metric label="Precision" v={metrics.precision.toFixed(3)} />
          <Metric label="Recall" v={metrics.recall.toFixed(3)} />
          <Metric label="Brier" v={metrics.brier.toFixed(3)} />
          <Metric label="Calib err" v={metrics.calibrationError.toFixed(3)} />
          <Metric label="High-conf acc" v={metrics.highConfidenceAccuracy.toFixed(3)} />
          <Metric label="Low-conf acc" v={metrics.lowConfidenceAccuracy.toFixed(3)} />
          <Metric label="Portfolio return" v={metrics.portfolioShadowReturn.toFixed(3)} />
          <Metric label="Portfolio DD" v={metrics.portfolioShadowDrawdown.toFixed(3)} />
          <Metric label="Capital util" v={metrics.capitalUtilization.toFixed(3)} />
          <Metric label="Breaches" v={metrics.constraintBreaches} />
        </div>
      </div>

      {/* Calibration */}
      <div style={panel}>
        <div style={lbl}>Calibration Buckets</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8 }}>
          {BUCKETS.map((b) => {
            const inB = history.observations.filter((o) => o.hypothetical && o.outcome.resolved && o.confidence >= b.from && o.confidence < b.to);
            const wins = inB.filter((o) => o.outcome.netAfterCosts > 0).length;
            const acc = inB.length === 0 ? 0 : wins / inB.length;
            const expC = inB.length === 0 ? 0 : inB.reduce((a, o) => a + o.confidence, 0) / inB.length;
            const err = Math.abs(expC - acc);
            return (
              <div key={b.label} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, fontFamily: "var(--eb-mono)", fontSize: 11 }}>
                <div style={{ color: C.orange }}>{b.label}</div>
                <div>Count: {inB.length}</div>
                <div>Expected: {(expC * 100).toFixed(1)}%</div>
                <div>Actual: {(acc * 100).toFixed(1)}%</div>
                <div>Err: {(err * 100).toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
          Overall calibration error: {(metrics.calibrationError * 100).toFixed(1)}%
        </div>
      </div>

      {/* Drift */}
      <div style={panel}>
        <div style={lbl}>Drift</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 6 }}>
          {drift.readings.map((r) => (
            <div key={r.dimension} style={{ fontFamily: "var(--eb-mono)", fontSize: 12 }}>
              <span style={{ color: driftColor(r.status) }}>{r.status}</span>
              <span> · {r.dimension}</span>
              <div style={{ color: C.muted, fontSize: 11 }}>{r.reason} · Δ {r.deltaPct.toFixed(1)}%</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
          Overall: <span style={{ color: driftColor(drift.overall) }}>{drift.overall}</span>
        </div>
      </div>

      {/* Compute counters */}
      <div style={panel}>
        <div style={lbl}>Compute Counters</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8 }}>
          {Object.entries(snap.counters).map(([k, v]) => (
            <Metric key={k} label={k} v={String(v)} />
          ))}
        </div>
      </div>

      {/* Persistence */}
      <div style={panel}>
        <div style={lbl}>Local Persistence</div>
        <StatGrid
          rows={[
            ["Observations stored", String(history.observations.length)],
            ["Events stored", String(history.events.length)],
            ["Sessions stored", String(history.sessions.length)],
            ["Portfolio decisions", String(history.portfolioDecisions.length)],
            ["Retention limits", "obs 500 · events 500 · sessions 100 · portfolio 100"],
            ["Last persisted", history.generatedAt],
          ]}
        />
      </div>

      {/* Exports */}
      <div style={panel}>
        <div style={lbl}>Exports</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button style={btnGhost} onClick={() => exp("shadow-observations.csv", "text/csv", buildObservationsCsv(history.observations))}>Observations CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-events.csv", "text/csv", buildEventsCsv(history.events))}>Events CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-sessions.csv", "text/csv", buildSessionsCsv(history.sessions))}>Sessions CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-metrics.csv", "text/csv", buildMetricsCsv(metrics))}>Metrics CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-drift.csv", "text/csv", buildDriftCsv(drift))}>Drift CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-portfolio.csv", "text/csv", buildPortfolioShadowCsv(history.portfolioDecisions))}>Portfolio Shadow CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-live-observations.csv", "text/csv", buildLiveObservationsCsv(snap.lastResult ? [snap.lastResult] : []))}>Live Observations CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-scheduler-events.csv", "text/csv", buildSchedulerEventsCsv(snap.timeline))}>Scheduler Events CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-provider-health.csv", "text/csv", buildProviderHealthCsv([]))}>Provider Health CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-active-positions.csv", "text/csv", buildActivePositionsCsv(activePositions))}>Active Positions CSV</button>
          <button style={btnGhost} onClick={() => exp("shadow-bundle.json", "application/json", buildShadowBundleJson({ version: "SHADOW_BUNDLE_V1", disclaimer: SHADOW_DISCLAIMER, snapshot: history, metrics, drift }))}>Full Bundle JSON</button>
          <button
            style={btnGhost}
            onClick={() =>
              exp(
                "shadow-scheduled-bundle.json",
                "application/json",
                buildScheduledShadowBundleJson({
                  disclaimer: SHADOW_DISCLAIMER,
                  generatedAt: new Date().toISOString(),
                  counters: snap.counters,
                  results: snap.lastResult ? [snap.lastResult] : [],
                  timeline: snap.timeline,
                  providerHealth: [],
                  activePositions,
                }),
              )
            }
          >
            Scheduled Shadow Bundle JSON
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Small helpers -------------------------------------------------------

function readLastCandle(snap: ControllerSnapshot): string {
  const ev = [...snap.timeline].reverse().find((e) => e.kind === "CANDLE_RECEIVED");
  return ev?.status ?? "—";
}

function viewColor(v: string): string {
  if (v === "OBSERVING_POSITION" || v === "PROCESSING_CLOSED_CANDLE") return C.green;
  if (v === "ERROR" || v === "PAUSED" || v === "STOPPED") return C.red;
  return C.orange;
}

function driftColor(v: string): string {
  if (v === "STABLE") return C.green;
  if (v === "WATCH") return C.orange;
  if (v === "MATERIAL_DRIFT" || v === "CRITICAL_DRIFT") return C.red;
  return C.muted;
}

function readinessChecklist(snap: ControllerSnapshot): readonly { label: string; ok: boolean; reason?: string }[] {
  const r = snap.lastResult;
  const reasons = r?.readiness.reasons ?? [];
  const has = (s: string) => reasons.some((x) => x.includes(s));
  return [
    { label: "Provider available", ok: !has("PROVIDER_UNAVAILABLE") && !has("PROVIDER_AUTH_REQUIRED") && !has("PROVIDER_RATE_LIMITED"), reason: reasons.find((x) => x.startsWith("PROVIDER_")) },
    { label: "Instrument/timeframe supported", ok: !has("UNSUPPORTED") },
    { label: "Closed candle valid", ok: r?.candleStatus === "CLOSED_VALID", reason: r?.candleStatus },
    { label: "Research context complete", ok: r?.resolved.ok === true },
    { label: "Recommendation reliability", ok: !has("RELIABILITY") },
    { label: "Formula aligned", ok: !has("FORMULA") },
    { label: "Data hash present", ok: r?.resolved.ok === true },
    { label: "Causality passed", ok: !has("CAUSALITY") },
    { label: "Scheduler policy valid", ok: r !== null },
    { label: "No conflicting active position", ok: !has("ACTIVE_SHADOW_EXISTS") },
  ];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={lbl}>{label}</div>
      {children}
    </div>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: `1px solid ${C.border}`,
        background: "transparent",
        color: C.text,
        fontFamily: "var(--eb-mono)",
        fontSize: 12,
      }}
    >
      {children}
    </select>
  );
}

function StatGrid({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 6, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
          <span style={{ color: C.muted }}>{k}</span>
          <span style={{ color: C.text, textAlign: "right", wordBreak: "break-all" }}>{v}</span>
        </div>
      ))}
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

function Metric({ label, v }: { label: string; v: string | number }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 8 }}>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 14, color: C.text, marginTop: 4 }}>{v}</div>
    </div>
  );
}