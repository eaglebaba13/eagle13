import { useDashboardData } from "../DashboardDataContext";
import { Card, fmt } from "./legacy-primitives";

export default function SafeZonesWidget() {
  const { levels, safeBand } = useDashboardData();
  return (
    <Card title="SAFE ZONES" sub={`±${safeBand} pts`} accent="var(--eb-neutral)">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div
          style={{
            padding: 9,
            borderRadius: 5,
            textAlign: "center",
            background: "rgba(0,201,122,0.08)",
            border: "1px solid rgba(0,201,122,0.22)",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--eb-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Safe Buy
          </div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 16, fontWeight: 700, color: "var(--eb-bull)", marginTop: 3 }}>
            {fmt(levels.safeBuy)}
          </div>
        </div>
        <div
          style={{
            padding: 9,
            borderRadius: 5,
            textAlign: "center",
            background: "rgba(255,58,92,0.08)",
            border: "1px solid rgba(255,58,92,0.22)",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--eb-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Safe Sell
          </div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 16, fontWeight: 700, color: "var(--eb-bear)", marginTop: 3 }}>
            {fmt(levels.safeSell)}
          </div>
        </div>
      </div>
    </Card>
  );
}