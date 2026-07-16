import { cprBias } from "@/lib/levels";
import { useDashboardData } from "../DashboardDataContext";
import { Card } from "./legacy-primitives";

export default function SignalWidget() {
  const { levels } = useDashboardData();
  const bias = cprBias(levels);
  const isBull = bias.tone === "bull";
  const tone =
    bias.tone === "neutral"
      ? "var(--eb-neutral)"
      : isBull
        ? "var(--eb-bull)"
        : "var(--eb-bear)";
  return (
    <Card title="MARKET SIGNAL" sub="AUTO" accent="var(--eb-neutral)">
      <div
        style={{
          padding: 12,
          textAlign: "center",
          borderRadius: 6,
          border: `1px solid ${tone}`,
          background: "rgba(255,255,255,0.02)",
          marginBottom: 9,
        }}
      >
        <div style={{ fontFamily: "var(--eb-head)", fontSize: 21, letterSpacing: 2, color: tone }}>
          {bias.headline}
        </div>
        <div style={{ fontSize: 11, color: "var(--eb-muted)", marginTop: 2 }}>{bias.label}</div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--eb-muted)",
          fontFamily: "var(--eb-mono)",
          padding: "7px 10px",
          background: "rgba(255,255,255,0.02)",
          borderRadius: 5,
          lineHeight: 1.5,
        }}
      >
        Levels auto-computed from the previous working day OHLC. CPR width drives the
        trending vs range read. Not financial advice.
      </div>
    </Card>
  );
}