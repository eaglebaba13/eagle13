import { useDashboardData } from "../use-dashboard-data";
import { Card, FlashValue, Row } from "./legacy-primitives";
import { fmt } from "@/lib/format";
import { canDisplayActionableSignal } from "@/lib/actionable-signal";
import { classifyFreshness, type ProviderStatus } from "@/lib/data-freshness";
import type { ProviderStatus as MarketProviderStatus } from "@/lib/provider-foundation/types";

function dashboardProviderStatus(status: MarketProviderStatus | undefined): ProviderStatus {
  switch (status) {
    case "LIVE":
      return "OK";
    case "DELAYED":
    case "RATE_LIMITED":
      return "DEGRADED";
    case "STALE":
    case "FAILED":
    case "OFFLINE":
      return "DOWN";
    default:
      return "UNKNOWN";
  }
}

export default function VixWidget() {
  const { data, marketProviderMetadata } = useDashboardData();
  const vix = data.vix;
  const metadata = marketProviderMetadata?.vix;
  const providerStatus = dashboardProviderStatus(metadata?.status);
  const freshness = classifyFreshness({
    providerTimestamp: metadata?.providerTime,
    expectedUpdateMs: 30_000,
    providerStatus,
    dataQuality: metadata?.dataQuality ?? "MISSING",
  });
  const gate = canDisplayActionableSignal({
    freshness: freshness.status,
    dataQuality: metadata?.dataQuality ?? "MISSING",
    providerStatus,
    formulaVersion: "MARKET_DATA_V1",
  });
  const providerTime = metadata?.providerTime
    ? new Date(metadata.providerTime).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      })
    : "Unavailable";

  if (!vix) {
    return (
      <Card
        title="INDIA VIX — VOLATILITY"
        sub="FEAR GAUGE"
        accent="var(--eb-neutral)"
        freshness={freshness}
        provider={metadata?.name ?? "Unknown"}
        methodology="MARKET_DATA_V1"
        blocked
        blockedReasons={gate.blockingReasons}
      >
        <p style={{ color: "var(--eb-muted)", fontSize: 12, margin: "0 0 8px" }}>
          No verified INDIA VIX quote is currently available.
        </p>
        <Row label="Provider time">
          <span>{providerTime}</span>
        </Row>
        <Row label="Provider status">
          <span>{metadata?.status ?? "UNKNOWN"}</span>
        </Row>
        <Row label="Data quality">
          <span>{metadata?.dataQuality ?? "MISSING"}</span>
        </Row>
        <Row label="Daily candles">
          <span>{metadata?.candlesAvailable ? "Available" : "Unavailable"}</span>
        </Row>
        {metadata?.fallbackReason ? (
          <Row label="Fallback reason">
            <span>{metadata.fallbackReason}</span>
          </Row>
        ) : null}
      </Card>
    );
  }

  const up = vix.change >= 0;
  const col = up ? "var(--eb-bear)" : "var(--eb-bull)";
  const level = vix.livePrice;
  const mood =
    level >= 20 ? "HIGH FEAR" : level >= 15 ? "ELEVATED" : level >= 12 ? "CALM" : "COMPLACENT";
  const moodCol =
    level >= 20 ? "var(--eb-bear)" : level >= 15 ? "var(--eb-accent)" : "var(--eb-bull)";
  const blocked = !gate.allowed;
  return (
    <Card
      title="INDIA VIX — VOLATILITY"
      sub="FEAR GAUGE"
      accent="var(--eb-neutral)"
      freshness={freshness}
      provider={metadata?.name ?? "Unknown"}
      methodology="MARKET_DATA_V1"
      blocked={blocked}
      blockedReasons={gate.blockingReasons}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <span
          suppressHydrationWarning
          style={{
            fontFamily: "var(--eb-mono)",
            fontSize: 26,
            fontWeight: 700,
            color: "var(--eb-text)",
          }}
        >
          {fmt(level)}
        </span>
        <span
          suppressHydrationWarning
          style={{
            fontFamily: "var(--eb-mono)",
            fontSize: 13,
            color: blocked ? "var(--eb-muted)" : col,
          }}
        >
          {blocked ? null : (up ? "▲" : "▼") + " "}
          {fmt(Math.abs(vix.change))} ({vix.changePct}%)
          {blocked ? " · SIGNAL BLOCKED" : ""}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontFamily: "var(--eb-head)",
            letterSpacing: 1,
            padding: "2px 8px",
            borderRadius: 4,
            border: `1px solid ${blocked ? "var(--eb-muted)" : moodCol}`,
            color: blocked ? "var(--eb-muted)" : moodCol,
          }}
        >
          {blocked ? "MOOD SUPPRESSED" : mood}
        </span>
      </div>
      <Row label="Prev Close">
        <FlashValue value={vix.prevDay.close} color="var(--eb-neutral)" />
      </Row>
      <Row label="Prev High">
        <FlashValue value={vix.prevDay.high} color="var(--eb-bear)" />
      </Row>
      <Row label="Prev Low">
        <FlashValue value={vix.prevDay.low} color="var(--eb-bull)" />
      </Row>
      <Row label="Provider time">
        <span>{providerTime}</span>
      </Row>
      <Row label="Provider status">
        <span>{metadata?.status ?? "UNKNOWN"}</span>
      </Row>
      <Row label="Data quality">
        <span>{metadata?.dataQuality ?? "MISSING"}</span>
      </Row>
      <Row label="Daily candles">
        <span>{metadata?.candlesAvailable ? "Available" : "Unavailable"}</span>
      </Row>
      {metadata?.fallbackReason ? (
        <Row label="Fallback reason">
          <span>{metadata.fallbackReason}</span>
        </Row>
      ) : null}
    </Card>
  );
}
