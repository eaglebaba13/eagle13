import { useDashboardData } from "../DashboardDataContext";
import { Card, Row, fmt } from "./legacy-primitives";

export default function GannWidget() {
  const { levels } = useDashboardData();
  return (
    <Card title="GANN 360° ZONES" sub="√ projection" accent="var(--eb-neutral)">
      <Row label="Gann Up">
        <span style={{ fontFamily: "var(--eb-mono)", fontSize: 15, fontWeight: 700, color: "var(--eb-bull)" }}>
          {fmt(levels.gannUp)}
        </span>
      </Row>
      <Row label="Gann Down">
        <span style={{ fontFamily: "var(--eb-mono)", fontSize: 15, fontWeight: 700, color: "var(--eb-bear)" }}>
          {fmt(levels.gannDown)}
        </span>
      </Row>
    </Card>
  );
}