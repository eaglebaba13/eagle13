// Phase 21.8 · Stage 1 — Regime Intelligence section (lazy-loaded).
// Research-only UI: consumes any StrategyEvidence[] passed via props and
// renders the deterministic recommendation. Empty state when no evidence.
import { useMemo, useState } from "react";
import {
  buildRegimeRecommendation,
  DEFAULT_SCORING_WEIGHTS,
  summarizeEnvironment,
  type StrategyEvidence,
  type RegimeRecommendation,
} from "@/lib/backtest/regime-recommendation";
import {
  exportRecommendationCsv,
  exportRecommendationJson,
  exportRejectedStrategiesCsv,
  RECOMMENDATION_EXPORT_DISCLAIMER,
} from "@/lib/backtest/regime-recommendation-exports";
import type { MarketRegime } from "@/lib/backtest/market-regime";
import { downloadBlob } from "@/lib/download";

const C = {
  orange: "var(--eb-orange, #f0a742)",
  text: "var(--eb-text, #eee)",
  muted: "var(--eb-muted, #8a8a8a)",
  border: "var(--eb-border, #333)",
  bg: "var(--eb-panel, rgba(20,20,24,0.6))",
};

const panel: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: 12,
  background: C.bg,
  backdropFilter: "blur(6px)",
};

const lbl: React.CSSProperties = {
  fontFamily: "var(--eb-mono)",
  fontSize: 10,
  color: C.muted,
  letterSpacing: 1,
  textTransform: "uppercase",
};

const REGIMES: MarketRegime[] = [
  "TRENDING_UP",
  "TRENDING_DOWN",
  "RANGE",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "BREAKOUT",
  "MEAN_REVERSION",
  "UNKNOWN",
];

export type RegimeIntelligenceSectionProps = {
  readonly evidence?: readonly StrategyEvidence[];
  readonly instrument?: string;
  readonly timeframe?: string;
  readonly regime?: MarketRegime;
  readonly batchRunId?: string | null;
};

export default function RegimeIntelligenceSection(props: RegimeIntelligenceSectionProps) {
  const [selectedRegime, setSelectedRegime] = useState<MarketRegime>(
    props.regime ?? "UNKNOWN",
  );
  const evidence = props.evidence ?? [];

  const rec: RegimeRecommendation | null = useMemo(() => {
    if (evidence.length === 0) return null;
    return buildRegimeRecommendation({
      regime: selectedRegime,
      instrument: props.instrument ?? "NIFTY50",
      timeframe: props.timeframe ?? "5m",
      strategies: evidence,
      batchRunId: props.batchRunId ?? null,
    });
  }, [evidence, selectedRegime, props.instrument, props.timeframe, props.batchRunId]);

  const summary = rec ? summarizeEnvironment(rec) : null;

  const doExport = (kind: "csv" | "json" | "rejected") => {
    if (!rec) return;
    if (kind === "csv") {
      downloadBlob("recommendation.csv", "text/csv", exportRecommendationCsv(rec));
    } else if (kind === "json") {
      downloadBlob("recommendation.json", "application/json", exportRecommendationJson(rec));
    } else {
      downloadBlob(
        "rejected-strategies.csv",
        "text/csv",
        exportRejectedStrategiesCsv(rec),
      );
    }
  };

  return (
    <section style={panel} aria-labelledby="regime-intelligence-title">
      <div
        id="regime-intelligence-title"
        style={{
          fontFamily: "var(--eb-head)",
          fontSize: 13,
          letterSpacing: 2,
          color: C.orange,
          marginBottom: 8,
        }}
      >
        REGIME INTELLIGENCE · RESEARCH RECOMMENDATION
      </div>
      <div style={{ ...lbl, color: C.muted, marginBottom: 8 }}>
        {RECOMMENDATION_EXPORT_DISCLAIMER}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
          Regime:{" "}
          <select
            value={selectedRegime}
            onChange={(e) => setSelectedRegime(e.target.value as MarketRegime)}
            style={{
              background: "transparent",
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: "2px 6px",
              fontFamily: "var(--eb-mono)",
              fontSize: 11,
            }}
          >
            {REGIMES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!rec ? (
        <div
          style={{
            border: `1px dashed ${C.border}`,
            borderRadius: 6,
            padding: 16,
            color: C.muted,
            fontFamily: "var(--eb-mono)",
            fontSize: 12,
          }}
        >
          Awaiting research evidence. Run walk-forward, Monte Carlo, sensitivity
          and robustness modules from the Research tabs to populate this panel.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <Card
              label="Recommended"
              value={rec.recommendedStrategy ?? "—"}
              accent={C.orange}
            />
            <Card label="Status" value={rec.recommendationStatus} />
            <Card label="Confidence" value={(rec.confidence * 100).toFixed(1) + "%"} />
            <Card label="Score" value={(rec.score * 100).toFixed(1) + "%"} />
            <Card label="Regime" value={rec.regime} />
            <Card label="Run ID" value={rec.runId} />
          </div>

          <div style={{ ...lbl, marginTop: 8 }}>Environment</div>
          {summary ? (
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, marginBottom: 8 }}>
              trend={summary.trendState} · volatility={summary.volatilityState} · dataQuality=
              {summary.dataQuality}
            </div>
          ) : null}

          <div style={{ ...lbl, marginTop: 8 }}>Score Breakdown</div>
          <table
            style={{
              width: "100%",
              fontFamily: "var(--eb-mono)",
              fontSize: 11,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th style={th}>Factor</th>
                <th style={th}>Weight</th>
                <th style={th}>Normalised</th>
                <th style={th}>Contribution</th>
                <th style={th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rec.metricContributions.map((c) => (
                <tr key={c.key}>
                  <td style={td}>{c.key}</td>
                  <td style={td}>{c.weight.toFixed(2)}</td>
                  <td style={td}>{c.normalized.toFixed(3)}</td>
                  <td style={td}>{c.contribution.toFixed(3)}</td>
                  <td style={td}>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ ...lbl, marginTop: 10 }}>Rank Table</div>
          <table
            style={{
              width: "100%",
              fontFamily: "var(--eb-mono)",
              fontSize: 11,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th style={th}>Rank</th>
                <th style={th}>Strategy</th>
                <th style={th}>Score</th>
                <th style={th}>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {rec.rankings.map((r, i) => (
                <tr key={r.strategy}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{r.strategy}</td>
                  <td style={td}>{r.score.toFixed(3)}</td>
                  <td style={td}>{r.reasons.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {rec.rejectedStrategies.length > 0 ? (
            <>
              <div style={{ ...lbl, marginTop: 10 }}>Rejected Strategies</div>
              <table
                style={{
                  width: "100%",
                  fontFamily: "var(--eb-mono)",
                  fontSize: 11,
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr>
                    <th style={th}>Strategy</th>
                    <th style={th}>Blocking Reasons</th>
                  </tr>
                </thead>
                <tbody>
                  {rec.rejectedStrategies.map((r) => (
                    <tr key={r.strategy}>
                      <td style={td}>{r.strategy}</td>
                      <td style={td}>{r.blockingReasons.join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {rec.warnings.length > 0 ? (
            <>
              <div style={{ ...lbl, marginTop: 10 }}>Warnings</div>
              <ul
                style={{
                  fontFamily: "var(--eb-mono)",
                  fontSize: 11,
                  color: C.muted,
                  paddingLeft: 16,
                }}
              >
                {rec.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          ) : null}

          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={btn} onClick={() => doExport("csv")}>
              Export CSV
            </button>
            <button style={btn} onClick={() => doExport("json")}>
              Export JSON
            </button>
            <button style={btn} onClick={() => doExport("rejected")}>
              Export Rejected CSV
            </button>
          </div>

          <div style={{ ...lbl, marginTop: 10 }}>Evidence</div>
          <div
            style={{
              fontFamily: "var(--eb-mono)",
              fontSize: 10,
              color: C.muted,
              lineHeight: 1.6,
            }}
          >
            Weights: {Object.entries(DEFAULT_SCORING_WEIGHTS).map(([k, v]) => `${k}=${v}`).join(", ")}
          </div>
        </>
      )}
    </section>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  color: C.muted,
  borderBottom: `1px solid ${C.border}`,
  padding: "4px 6px",
  fontWeight: 400,
};
const td: React.CSSProperties = {
  color: C.text,
  borderBottom: `1px solid ${C.border}`,
  padding: "4px 6px",
};
const btn: React.CSSProperties = {
  background: "transparent",
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  padding: "4px 10px",
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
  cursor: "pointer",
};

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
      <div style={lbl}>{label}</div>
      <div
        style={{
          fontFamily: "var(--eb-mono)",
          fontSize: 14,
          color: accent ?? C.text,
          marginTop: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}
