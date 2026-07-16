import { useDashboardData } from "../DashboardDataContext";
import { Card, fmt, tdStyle, thStyle } from "./legacy-primitives";

export default function PivotWidget() {
  const { levels, accent } = useDashboardData();
  const rows = [
    { k: "R3", v: levels.r3, c: "var(--eb-bull)" },
    { k: "R2", v: levels.r2, c: "var(--eb-bull)" },
    { k: "R1", v: levels.r1, c: "var(--eb-bull)" },
    { k: "PP", v: levels.pivot, c: accent },
    { k: "S1", v: levels.s1, c: "var(--eb-bear)" },
    { k: "S2", v: levels.s2, c: "var(--eb-bear)" },
    { k: "S3", v: levels.s3, c: "var(--eb-bear)" },
  ];
  return (
    <Card title="PIVOT LEVELS" sub="R1-R3 · S1-S3" accent={accent}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Level</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td style={{ ...tdStyle, color: r.c, fontWeight: 700 }}>{r.k}</td>
              <td style={{ ...tdStyle, textAlign: "right", color: r.c }}>{fmt(r.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}