import { cprBias } from "@/lib/levels";
import { useDashboardData } from "../DashboardDataContext";
import { Card, StatBox } from "./legacy-primitives";

export default function CprWidget() {
  const { activeQuote: quote, levels, accent } = useDashboardData();
  const bias = cprBias(levels);
  const toneColor =
    bias.tone === "bull"
      ? "var(--eb-bull)"
      : bias.tone === "bear"
        ? "var(--eb-bear)"
        : "var(--eb-neutral)";
  return (
    <Card title={`${quote.name} — CPR LEVELS`} sub="PP · TC · BC" accent={accent}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <StatBox label="Top Central" value={levels.tc} color="var(--eb-bull)" />
        <StatBox label="Pivot (PP)" value={levels.pivot} color={accent} />
        <StatBox label="Bottom Central" value={levels.bc} color="var(--eb-bear)" />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 10px",
          borderRadius: 5,
          border: `1px solid ${toneColor}`,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <span style={{ fontSize: 11, fontFamily: "var(--eb-mono)", color: "var(--eb-muted)" }}>
          CPR WIDTH: {levels.cprWidth} ({levels.cprWidthPct}%)
        </span>
        <span style={{ fontSize: 11, fontFamily: "var(--eb-head)", letterSpacing: 1, color: toneColor }}>
          {bias.label}
        </span>
      </div>
    </Card>
  );
}