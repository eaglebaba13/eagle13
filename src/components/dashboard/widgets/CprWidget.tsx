import { cprBias } from "@/lib/levels";
import { useDashboardData } from "../DashboardDataContext";
import { Card, StatBox } from "./legacy-primitives";
import { canDisplayActionableSignal, blockedLabel } from "@/lib/actionable-signal";

export default function CprWidget() {
  const { activeQuote: quote, levels, accent, freshnessByDependency, providerMetadata } = useDashboardData();
  const bias = cprBias(levels);
  const freshness = freshnessByDependency?.MARKET_DATA;
  const gate = canDisplayActionableSignal({
    freshness: freshness?.status ?? "UNAVAILABLE",
    providerStatus: providerMetadata?.status ?? "UNKNOWN",
    formulaVersion: "CPR_CENTRAL_PIVOT_V1",
  });
  const toneColor =
    !gate.allowed
      ? "var(--eb-muted)"
      : bias.tone === "bull"
      ? "var(--eb-bull)"
      : bias.tone === "bear"
        ? "var(--eb-bear)"
        : "var(--eb-neutral)";
  return (
    <Card
      title={`${quote.name} — CPR LEVELS`}
      sub="PP · TC · BC"
      accent={accent}
      freshness={freshness}
      provider={providerMetadata?.name}
      methodology="CPR_CENTRAL_PIVOT_V1"
      blocked={!gate.allowed}
      blockedReasons={gate.blockingReasons}
    >
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
        <span
          style={{ fontSize: 11, fontFamily: "var(--eb-head)", letterSpacing: 1, color: toneColor }}
          title={gate.allowed ? undefined : gate.blockingReasons.join(" · ")}
        >
          {gate.allowed ? bias.label : blockedLabel(gate.blockingReasons)}
        </span>
      </div>
    </Card>
  );
}