import { useDashboardData } from "../DashboardDataContext";
import { Card, FlashValue, Row, fmt } from "./legacy-primitives";
import { canDisplayActionableSignal } from "@/lib/actionable-signal";

export default function QuoteWidget() {
  const { activeQuote: quote, accent, freshnessByDependency, providerMetadata } = useDashboardData();
  const freshness = freshnessByDependency?.MARKET_DATA;
  const gate = canDisplayActionableSignal({
    freshness: freshness?.status ?? "UNAVAILABLE",
    providerStatus: providerMetadata?.status ?? "UNKNOWN",
    formulaVersion: "MARKET_DATA_V1",
  });
  const up = quote.change >= 0;
  const stale = !gate.allowed;
  return (
    <Card
      title={`${quote.name} — LIVE`}
      sub={quote.marketState === "OPEN" ? "MARKET OPEN" : "MARKET CLOSED"}
      accent={accent}
      freshness={freshness}
      provider={providerMetadata?.name}
      methodology="MARKET_DATA_V1"
      blocked={stale}
      blockedReasons={gate.blockingReasons}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <span
          suppressHydrationWarning
          style={{
            fontFamily: "var(--eb-mono)",
            fontSize: 30,
            fontWeight: 700,
            color: "var(--eb-text)",
          }}
        >
          {fmt(quote.livePrice)}
        </span>
        {stale ? (
          <span
            suppressHydrationWarning
            style={{
              fontFamily: "var(--eb-mono)",
              fontSize: 13,
              color: "var(--eb-muted)",
              letterSpacing: 1,
            }}
          >
            {fmt(Math.abs(quote.change))} ({quote.changePct}%) · STALE
          </span>
        ) : (
          <span
            suppressHydrationWarning
            style={{
              fontFamily: "var(--eb-mono)",
              fontSize: 14,
              color: up ? "var(--eb-bull)" : "var(--eb-bear)",
            }}
          >
            {up ? "▲" : "▼"} {fmt(Math.abs(quote.change))} ({quote.changePct}%)
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--eb-mono)",
          color: "var(--eb-muted)",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        Previous Working Day &middot; {quote.prevDay.date} &middot; Auto-updated
      </div>
      <Row label="Prev Close">
        <FlashValue value={quote.prevDay.close} color="var(--eb-accent)" />
      </Row>
      <Row label="Prev High">
        <FlashValue value={quote.prevDay.high} color="var(--eb-bull)" />
      </Row>
      <Row label="Prev Low">
        <FlashValue value={quote.prevDay.low} color="var(--eb-bear)" />
      </Row>
      <Row label="Prev Open">
        <FlashValue value={quote.prevDay.open} />
      </Row>
    </Card>
  );
}