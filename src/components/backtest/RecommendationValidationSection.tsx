// Phase 21.8 · Stage 2 — Recommendation Validation Section (lazy-loaded).
// Research-only UI: consumes any RecommendationObservation[] passed via
// props and renders accuracy / calibration / drift / reliability. No
// engine changes; pure presentation of validator output.
import { useMemo } from "react";
import {
  RECOMMENDATION_VALIDATOR_DISCLAIMER,
  exportValidationCsv,
  exportValidationJson,
  validateRecommendations,
  type RecommendationObservation,
} from "@/lib/backtest/recommendation-validator";
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

export type RecommendationValidationSectionProps = {
  readonly observations?: readonly RecommendationObservation[];
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

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

export default function RecommendationValidationSection(
  props: RecommendationValidationSectionProps,
) {
  const observations = props.observations ?? [];
  const rep = useMemo(
    () => validateRecommendations({ observations }),
    [observations],
  );

  const doExport = (kind: "csv" | "json") => {
    if (kind === "csv") {
      downloadBlob(exportValidationCsv(rep), `recommendation-validation.csv`, "text/csv");
    } else {
      downloadBlob(
        exportValidationJson(rep),
        `recommendation-validation.json`,
        "application/json",
      );
    }
  };

  const relColor =
    rep.reliability === "EXCELLENT" || rep.reliability === "GOOD"
      ? C.green
      : rep.reliability === "FAIR"
        ? C.orange
        : C.red;

  return (
    <section style={panel} aria-labelledby="recommendation-validation-title">
      <div
        id="recommendation-validation-title"
        style={{
          fontFamily: "var(--eb-head)",
          fontSize: 13,
          letterSpacing: 2,
          color: C.orange,
          marginBottom: 8,
        }}
      >
        RECOMMENDATION VALIDATION · HISTORICAL ACCURACY
      </div>
      <div style={{ ...lbl, color: C.muted, marginBottom: 8 }}>
        {RECOMMENDATION_VALIDATOR_DISCLAIMER}
      </div>

      {observations.length === 0 ? (
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
          Awaiting recommendation history. Once walk-forward and batch
          recommendations produce paired outcomes, this panel will report
          historical accuracy, calibration and drift.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <Card label="Reliability" value={rep.reliability} accent={relColor} />
            <Card label="Accuracy" value={pct(rep.accuracy)} />
            <Card label="Precision" value={pct(rep.precision)} />
            <Card label="Recall" value={pct(rep.recall)} />
            <Card label="F1" value={rep.f1.toFixed(3)} />
            <Card label="Brier" value={rep.brierScore.toFixed(3)} />
            <Card label="ECE" value={rep.expectedCalibrationError.toFixed(3)} />
            <Card label="Coverage" value={pct(rep.coverage)} />
            <Card label="High-Conf Acc" value={pct(rep.highConfidenceAccuracy)} />
            <Card label="Low-Conf Acc" value={pct(rep.lowConfidenceAccuracy)} />
            <Card label="FPR" value={pct(rep.falsePositiveRate)} />
            <Card label="FNR" value={pct(rep.falseNegativeRate)} />
          </div>

          <div style={{ ...lbl, marginTop: 8 }}>Confusion Matrix</div>
          <table
            style={{
              fontFamily: "var(--eb-mono)",
              fontSize: 11,
              borderCollapse: "collapse",
              marginBottom: 10,
            }}
          >
            <thead>
              <tr>
                <th style={th}></th>
                <th style={th}>Actual WIN</th>
                <th style={th}>Actual LOSS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...td, color: C.muted }}>Predicted Positive</td>
                <td style={{ ...td, color: C.green }}>{rep.confusion.tp}</td>
                <td style={{ ...td, color: C.red }}>{rep.confusion.fp}</td>
              </tr>
              <tr>
                <td style={{ ...td, color: C.muted }}>Predicted Negative</td>
                <td style={{ ...td, color: C.red }}>{rep.confusion.fn}</td>
                <td style={{ ...td, color: C.green }}>{rep.confusion.tn}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ ...lbl, marginTop: 8 }}>Confidence Calibration</div>
          <table
            style={{
              width: "100%",
              fontFamily: "var(--eb-mono)",
              fontSize: 11,
              borderCollapse: "collapse",
              marginBottom: 10,
            }}
          >
            <thead>
              <tr>
                <th style={th}>Bucket</th>
                <th style={th}>Count</th>
                <th style={th}>Wins</th>
                <th style={th}>Losses</th>
                <th style={th}>Expected</th>
                <th style={th}>Actual</th>
                <th style={th}>Error</th>
              </tr>
            </thead>
            <tbody>
              {rep.buckets.map((b) => (
                <tr key={b.key}>
                  <td style={td}>{b.key}</td>
                  <td style={td}>{b.count}</td>
                  <td style={td}>{b.wins}</td>
                  <td style={td}>{b.losses}</td>
                  <td style={td}>{pct(b.expectedConfidence)}</td>
                  <td style={td}>{pct(b.actualAccuracy)}</td>
                  <td style={td}>{b.calibrationError.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ ...lbl, marginTop: 8 }}>Confidence Histogram</div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              height: 80,
              marginBottom: 10,
              padding: "0 4px",
            }}
          >
            {rep.buckets.map((b) => {
              const max = Math.max(1, ...rep.buckets.map((x) => x.count));
              const h = Math.round((b.count / max) * 70);
              return (
                <div
                  key={b.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flex: 1,
                  }}
                >
                  <div
                    aria-label={`${b.key}: ${b.count}`}
                    style={{
                      width: "100%",
                      height: h,
                      background: C.blue,
                      opacity: 0.7,
                      borderRadius: 2,
                    }}
                  />
                  <div style={{ ...lbl, marginTop: 4 }}>{b.key}</div>
                </div>
              );
            })}
          </div>

          <DriftTable title="Drift by Regime" rows={rep.drift.byRegime} />
          <DriftTable title="Drift by Instrument" rows={rep.drift.byInstrument} />
          <DriftTable title="Drift by Timeframe" rows={rep.drift.byTimeframe} />
          <DriftTable title="Drift by Walk-Forward Window" rows={rep.drift.byWindow} />

          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={btn} onClick={() => doExport("csv")}>
              Export CSV
            </button>
            <button style={btn} onClick={() => doExport("json")}>
              Export JSON
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              fontFamily: "var(--eb-mono)",
              fontSize: 10,
              color: C.muted,
            }}
          >
            Validator Run ID: <span style={{ color: C.blue }}>{rep.runId}</span>
          </div>
        </>
      )}
    </section>
  );
}

function DriftTable({
  title,
  rows,
}: {
  title: string;
  rows: readonly {
    key: string;
    count: number;
    decidedCount: number;
    accuracy: number;
    deltaVsOverall: number;
    drift: "STABLE" | "MODERATE" | "SIGNIFICANT";
  }[];
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <div style={{ ...lbl, marginTop: 8 }}>{title}</div>
      <table
        style={{
          width: "100%",
          fontFamily: "var(--eb-mono)",
          fontSize: 11,
          borderCollapse: "collapse",
          marginBottom: 6,
        }}
      >
        <thead>
          <tr>
            <th style={th}>Key</th>
            <th style={th}>Count</th>
            <th style={th}>Decided</th>
            <th style={th}>Accuracy</th>
            <th style={th}>Δ vs Overall</th>
            <th style={th}>Drift</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.key}>
              <td style={td}>{d.key}</td>
              <td style={td}>{d.count}</td>
              <td style={td}>{d.decidedCount}</td>
              <td style={td}>{(d.accuracy * 100).toFixed(1)}%</td>
              <td
                style={{
                  ...td,
                  color:
                    d.deltaVsOverall > 0
                      ? C.green
                      : d.deltaVsOverall < 0
                        ? C.red
                        : C.text,
                }}
              >
                {(d.deltaVsOverall * 100).toFixed(1)}%
              </td>
              <td
                style={{
                  ...td,
                  color:
                    d.drift === "SIGNIFICANT"
                      ? C.red
                      : d.drift === "MODERATE"
                        ? C.orange
                        : C.muted,
                }}
              >
                {d.drift}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}