import { useDashboardData } from "../DashboardDataContext";
import { Card, fmt } from "./legacy-primitives";

export default function GannCycleWidget() {
  const { levels } = useDashboardData();
  return (
    <Card title="GANN CYCLE" sub="SQUARE OF 9 · 45° STEPS" accent="var(--eb-bn)">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["ANGLE", "RESISTANCE ▲", "SUPPORT ▼"].map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: i === 0 ? "left" : "right",
                  fontSize: 9,
                  letterSpacing: 0.5,
                  color: "var(--eb-muted)",
                  fontWeight: 700,
                  padding: "4px 2px",
                  borderBottom: "1px solid var(--eb-border)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.gannCycle.map((g) => (
            <tr key={g.deg} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: "var(--eb-text)", padding: "5px 2px" }}>
                {g.deg}°
              </td>
              <td style={{ fontFamily: "var(--eb-mono)", fontSize: 13, fontWeight: 700, color: "var(--eb-bull)", textAlign: "right", padding: "5px 2px" }}>
                {fmt(g.up)}
              </td>
              <td style={{ fontFamily: "var(--eb-mono)", fontSize: 13, fontWeight: 700, color: "var(--eb-bear)", textAlign: "right", padding: "5px 2px" }}>
                {fmt(g.down)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}