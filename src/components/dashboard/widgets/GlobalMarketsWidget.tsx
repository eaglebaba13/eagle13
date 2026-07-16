import type { IndexQuote } from "@/lib/market.functions";
import { useDashboardData } from "../DashboardDataContext";
import { Card, Row, fmt } from "./legacy-primitives";
import { classifyFreshness } from "@/lib/data-freshness";

function rowFreshness(q: IndexQuote | null, now: number) {
  if (!q) return null;
  return classifyFreshness({
    providerTimestamp: q.updatedAt,
    expectedUpdateMs: 60_000,
    marketSession: q.marketState === "OPEN" ? "OPEN" : "CLOSED",
    providerStatus: "OK",
    now,
  });
}

export default function GlobalMarketsWidget() {
  const { data, freshnessByDependency, providerMetadata } = useDashboardData();
  const now = Date.now();
  const goldFresh = rowFreshness(data.gold, now);
  const silverFresh = rowFreshness(data.silver, now);
  const btcFresh = rowFreshness(data.btc, now);
  const worst = [goldFresh, silverFresh, btcFresh].filter(Boolean) as Array<{ status: string }>;
  const rank = (s: string) =>
    s === "ERROR" || s === "UNAVAILABLE" ? 4 : s === "STALE" ? 3 : s === "DELAYED" ? 2 : 1;
  const aggregate = worst.length
    ? worst.reduce((a, b) => (rank(b.status) > rank(a.status) ? b : a))
    : null;
  const cardFreshness = aggregate ? (freshnessByDependency?.MARKET_DATA ?? null) : null;
  const items: { label: string; q: IndexQuote; color: string }[] = [];
  if (data.btc) items.push({ label: "BTC / USD", q: data.btc, color: "#f7931a" });
  if (data.gold) items.push({ label: "XAU / USD (GOLD)", q: data.gold, color: "var(--eb-accent)" });
  if (data.silver) items.push({ label: "XAG / USD (SILVER)", q: data.silver, color: "var(--eb-neutral)" });

  return (
    <Card
      title="GLOBAL MARKETS"
      sub="BTC · GOLD · SILVER"
      accent="#f7931a"
      freshness={cardFreshness}
      provider={providerMetadata?.name}
      methodology="MARKET_DATA_V1"
    >
      {items.map((it) => {
        const up = it.q.change >= 0;
        const rowFresh = rowFreshness(it.q, now);
        const stale = rowFresh && (rowFresh.status === "STALE" || rowFresh.status === "UNAVAILABLE");
        return (
          <Row key={it.label} label={it.label}>
            <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span suppressHydrationWarning style={{ fontFamily: "var(--eb-mono)", fontSize: 15, fontWeight: 700, color: it.color }}>
                {fmt(it.q.livePrice)}
              </span>
              <span
                suppressHydrationWarning
                style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: stale ? "var(--eb-muted)" : (up ? "var(--eb-bull)" : "var(--eb-bear)") }}
                title={rowFresh?.reason}
              >
                {stale ? "" : (up ? "▲" : "▼") + " "}
                {it.q.changePct}%{stale ? " · STALE" : ""}
              </span>
            </span>
          </Row>
        );
      })}
      {data.goldSilverRatio != null ? (
        <div
          style={{
            marginTop: 10,
            padding: "9px 11px",
            borderRadius: 5,
            border: "1px solid var(--eb-accent)",
            background: "rgba(255,255,255,0.02)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 11, fontFamily: "var(--eb-head)", letterSpacing: 1, color: "var(--eb-muted)" }}>
            GOLD / SILVER RATIO
          </span>
          <span suppressHydrationWarning style={{ fontFamily: "var(--eb-mono)", fontSize: 18, fontWeight: 700, color: "var(--eb-accent)" }}>
            {data.goldSilverRatio}
          </span>
        </div>
      ) : null}
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }}>
          Global market data unavailable.
        </div>
      ) : null}
    </Card>
  );
}