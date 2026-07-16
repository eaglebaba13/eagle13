import type { IndexQuote } from "@/lib/market.functions";
import { useDashboardData } from "../DashboardDataContext";
import { Card, Row, fmt } from "./legacy-primitives";

export default function GlobalMarketsWidget() {
  const { data } = useDashboardData();
  const items: { label: string; q: IndexQuote; color: string }[] = [];
  if (data.btc) items.push({ label: "BTC / USD", q: data.btc, color: "#f7931a" });
  if (data.gold) items.push({ label: "XAU / USD (GOLD)", q: data.gold, color: "var(--eb-accent)" });
  if (data.silver) items.push({ label: "XAG / USD (SILVER)", q: data.silver, color: "var(--eb-neutral)" });

  return (
    <Card title="GLOBAL MARKETS" sub="BTC · GOLD · SILVER" accent="#f7931a">
      {items.map((it) => {
        const up = it.q.change >= 0;
        return (
          <Row key={it.label} label={it.label}>
            <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span suppressHydrationWarning style={{ fontFamily: "var(--eb-mono)", fontSize: 15, fontWeight: 700, color: it.color }}>
                {fmt(it.q.livePrice)}
              </span>
              <span
                suppressHydrationWarning
                style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: up ? "var(--eb-bull)" : "var(--eb-bear)" }}
              >
                {up ? "▲" : "▼"} {it.q.changePct}%
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