import { useDashboardData } from "../DashboardDataContext";
import { Card, fmt } from "./legacy-primitives";
import { canDisplayActionableSignal, blockedLabel } from "@/lib/actionable-signal";

export default function SafeZonesWidget() {
  const { levels, safeBand, freshnessByDependency, providerMetadata } = useDashboardData();
  const freshness = freshnessByDependency?.MARKET_DATA;
  const gate = canDisplayActionableSignal({
    freshness: freshness?.status ?? "UNAVAILABLE",
    providerStatus: providerMetadata?.status ?? "UNKNOWN",
    formulaVersion: "SAFE_ZONE_BAND_V1",
  });
  const buyLabel = gate.allowed ? "Safe Buy" : "Buy Zone (blocked)";
  const sellLabel = gate.allowed ? "Safe Sell" : "Sell Zone (blocked)";
  return (
    <Card
      title="SAFE ZONES"
      sub={`±${safeBand} pts`}
      accent="var(--eb-neutral)"
      freshness={freshness}
      provider={providerMetadata?.name}
      methodology="SAFE_ZONE_BAND_V1"
      blocked={!gate.allowed}
      blockedReasons={gate.blockingReasons}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div
          style={{
            padding: 9,
            borderRadius: 5,
            textAlign: "center",
            background: gate.allowed ? "rgba(0,201,122,0.08)" : "rgba(255,255,255,0.02)",
            border: gate.allowed
              ? "1px solid rgba(0,201,122,0.22)"
              : "1px solid var(--eb-border)",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--eb-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            {buyLabel}
          </div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 16, fontWeight: 700, color: gate.allowed ? "var(--eb-bull)" : "var(--eb-muted)", marginTop: 3 }}>
            {fmt(levels.safeBuy)}
          </div>
        </div>
        <div
          style={{
            padding: 9,
            borderRadius: 5,
            textAlign: "center",
            background: gate.allowed ? "rgba(255,58,92,0.08)" : "rgba(255,255,255,0.02)",
            border: gate.allowed
              ? "1px solid rgba(255,58,92,0.22)"
              : "1px solid var(--eb-border)",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--eb-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            {sellLabel}
          </div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 16, fontWeight: 700, color: gate.allowed ? "var(--eb-bear)" : "var(--eb-muted)", marginTop: 3 }}>
            {fmt(levels.safeSell)}
          </div>
        </div>
      </div>
      {!gate.allowed ? (
        <div style={{ marginTop: 8, fontSize: 10, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }} title={gate.blockingReasons.join(" · ")}>
          {blockedLabel(gate.blockingReasons)}
        </div>
      ) : null}
    </Card>
  );
}