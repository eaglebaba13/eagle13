import { useDashboardData } from "../DashboardDataContext";
import { Card, fmt, tdStyle, thStyle } from "./legacy-primitives";
import { canDisplayActionableSignal } from "@/lib/actionable-signal";

export default function PivotWidget() {
  const { levels, accent, freshnessByDependency, providerMetadata } = useDashboardData();
  const freshness = freshnessByDependency?.MARKET_DATA;
  const gate = canDisplayActionableSignal({
    freshness: freshness?.status ?? "UNAVAILABLE",
    providerStatus: providerMetadata?.status ?? "UNKNOWN",
    formulaVersion: "CLASSIC_PIVOT_V1",
  });
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
    <Card
      title="PIVOT LEVELS"
      sub="R1-R3 · S1-S3"
      accent={accent}
      freshness={freshness}
      provider={providerMetadata?.name}
      methodology="CLASSIC_PIVOT_V1"
      blocked={!gate.allowed}
      blockedReasons={gate.blockingReasons}
    >
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