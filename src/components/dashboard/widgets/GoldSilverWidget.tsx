import { GoldSilverRatioCard } from "../GoldSilverRatioCard";
import { useDashboardData } from "../DashboardDataContext";
import { DataFreshnessPill } from "../DataFreshnessPill";
import { canDisplayActionableSignal, blockedLabel } from "@/lib/actionable-signal";

export default function GoldSilverWidget() {
  const { data, freshnessByDependency, providerMetadata } = useDashboardData();
  const freshness = freshnessByDependency?.GOLD_SILVER_RATIO;
  const gate = canDisplayActionableSignal({
    freshness: freshness?.status ?? "UNAVAILABLE",
    providerStatus: providerMetadata?.status ?? "UNKNOWN",
    formulaVersion: "GOLD_SILVER_RATIO_V1",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {freshness ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <DataFreshnessPill result={freshness} provider={providerMetadata?.name} compact />
        </div>
      ) : null}
      <GoldSilverRatioCard gold={data.gold} silver={data.silver} />
      {!gate.allowed ? (
        <div
          role="status"
          title={gate.blockingReasons.join(" · ")}
          style={{
            fontFamily: "var(--eb-mono)",
            fontSize: 11,
            color: "var(--eb-muted)",
            borderTop: "1px dashed var(--eb-border, #1f2937)",
            paddingTop: 6,
          }}
        >
          Actionable signal suppressed · {blockedLabel(gate.blockingReasons)}
        </div>
      ) : null}
    </div>
  );
}