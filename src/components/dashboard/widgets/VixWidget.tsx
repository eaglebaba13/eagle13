import { useDashboardData } from "../DashboardDataContext";
import { Card, FlashValue, Row, fmt } from "./legacy-primitives";

export default function VixWidget() {
  const { data } = useDashboardData();
  const vix = data.vix;
  if (!vix) return null;
  const up = vix.change >= 0;
  const col = up ? "var(--eb-bear)" : "var(--eb-bull)";
  const level = vix.livePrice;
  const mood =
    level >= 20 ? "HIGH FEAR" : level >= 15 ? "ELEVATED" : level >= 12 ? "CALM" : "COMPLACENT";
  const moodCol =
    level >= 20 ? "var(--eb-bear)" : level >= 15 ? "var(--eb-accent)" : "var(--eb-bull)";
  return (
    <Card title="INDIA VIX — VOLATILITY" sub="FEAR GAUGE" accent="var(--eb-neutral)">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <span suppressHydrationWarning style={{ fontFamily: "var(--eb-mono)", fontSize: 26, fontWeight: 700, color: "var(--eb-text)" }}>
          {fmt(level)}
        </span>
        <span suppressHydrationWarning style={{ fontFamily: "var(--eb-mono)", fontSize: 13, color: col }}>
          {up ? "▲" : "▼"} {fmt(Math.abs(vix.change))} ({vix.changePct}%)
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontFamily: "var(--eb-head)",
            letterSpacing: 1,
            padding: "2px 8px",
            borderRadius: 4,
            border: `1px solid ${moodCol}`,
            color: moodCol,
          }}
        >
          {mood}
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
    </Card>
  );
}