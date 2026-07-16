import { useDashboardData } from "../DashboardDataContext";
import { Card, Row, fmt } from "./legacy-primitives";
import { canDisplayActionableSignal } from "@/lib/actionable-signal";

export default function GannWidget() {
  const { levels, freshnessByDependency, providerMetadata } = useDashboardData();
  const freshness = freshnessByDependency?.MARKET_DATA;
  const gate = canDisplayActionableSignal({
    freshness: freshness?.status ?? "UNAVAILABLE",
    providerStatus: providerMetadata?.status ?? "UNKNOWN",
    formulaVersion: "LEGACY_EAGLEBABA_CASCADE_V1",
  });
  return (
    <Card
      title="GANN 360° ZONES"
      sub="√ projection"
      accent="var(--eb-neutral)"
      freshness={freshness}
      provider={providerMetadata?.name}
      methodology="LEGACY_EAGLEBABA_CASCADE_V1"
      blocked={!gate.allowed}
      blockedReasons={gate.blockingReasons}
    >
      <Row label="Gann Up">
        <span style={{ fontFamily: "var(--eb-mono)", fontSize: 15, fontWeight: 700, color: gate.allowed ? "var(--eb-bull)" : "var(--eb-muted)" }}>
          {fmt(levels.gannUp)}
        </span>
      </Row>
      <Row label="Gann Down">
        <span style={{ fontFamily: "var(--eb-mono)", fontSize: 15, fontWeight: 700, color: gate.allowed ? "var(--eb-bear)" : "var(--eb-muted)" }}>
          {fmt(levels.gannDown)}
        </span>
      </Row>
    </Card>
  );
}