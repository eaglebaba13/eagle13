import { useEffect, useState } from "react";
import { queryOptions, useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import {
  getFno,
  getSectors,
  getNews,
  type Mover,
  type Sector,
  type NewsItem,
} from "@/lib/insights.functions";

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const fnoQuery = () =>
  queryOptions({ queryKey: ["fno"], queryFn: () => getFno(), refetchInterval: 60_000 });
const sectorsQuery = () =>
  queryOptions({ queryKey: ["sectors"], queryFn: () => getSectors(), refetchInterval: 60_000 });
const newsQuery = () =>
  queryOptions({ queryKey: ["news"], queryFn: () => getNews(), refetchInterval: 300_000 });

export function prefetchInsights(qc: QueryClient) {
  qc.prefetchQuery(fnoQuery());
  qc.prefetchQuery(sectorsQuery());
  qc.prefetchQuery(newsQuery());
}

/* ------------------------------ card ------------------------------ */

function Card({
  title,
  sub,
  accent,
  children,
}: {
  title: string;
  sub?: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--eb-card)",
        border: "1px solid var(--eb-border)",
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "9px 13px",
          borderBottom: "1px solid var(--eb-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 12%, transparent), transparent 60%)`,
        }}
      >
        <span style={{ fontFamily: "var(--eb-head)", fontSize: 15, letterSpacing: 2, color: accent }}>
          {title}
        </span>
        {sub ? (
          <span
            style={{
              fontFamily: "var(--eb-mono)",
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 3,
              background: "rgba(255,255,255,0.04)",
              color: "var(--eb-muted)",
            }}
          >
            {sub}
          </span>
        ) : null}
      </div>
      <div style={{ padding: "12px 13px", flex: 1 }}>{children}</div>
    </div>
  );
}

/* --------------------------- mover row ---------------------------- */

function MoverRow({ m }: { m: Mover }) {
  const up = m.change >= 0;
  const col = up ? "var(--eb-bull)" : "var(--eb-bear)";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "7px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        gap: 8,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--eb-text)", fontWeight: 700 }}>{m.name}</div>
        <div style={{ fontSize: 9, color: "var(--eb-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
          {m.sector}
        </div>
      </div>
      <div style={{ textAlign: "right", fontFamily: "var(--eb-mono)" }}>
        <div suppressHydrationWarning style={{ fontSize: 13, color: "var(--eb-text)" }}>{fmt(m.price)}</div>
        <div suppressHydrationWarning style={{ fontSize: 12, color: col, fontWeight: 700 }}>
          {up ? "▲" : "▼"} {pct(m.changePct)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ F&O ------------------------------- */

function FnoBullish() {
  const { data } = useSuspenseQuery(fnoQuery());
  return (
    <Card title="TOP 5 BULLISH · F&O" sub="GAINERS" accent="var(--eb-bull)">
      {data.bullish.map((m) => (
        <MoverRow key={m.symbol} m={m} />
      ))}
    </Card>
  );
}

function FnoBearish() {
  const { data } = useSuspenseQuery(fnoQuery());
  return (
    <Card title="TOP 5 BEARISH · F&O" sub="LOSERS" accent="var(--eb-bear)">
      {data.bearish.map((m) => (
        <MoverRow key={m.symbol} m={m} />
      ))}
    </Card>
  );
}

/* ---------------------------- sectors ----------------------------- */

function SectorBar({ s }: { s: Sector }) {
  const up = s.change >= 0;
  const col = up ? "var(--eb-bull)" : "var(--eb-bear)";
  const width = Math.min(100, Math.abs(s.changePct) * 25);
  return (
    <div style={{ padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--eb-text)", fontWeight: 700 }}>{s.name}</span>
        <span suppressHydrationWarning style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: col, fontWeight: 700 }}>
          {up ? "▲" : "▼"} {pct(s.changePct)}
        </span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 3, marginTop: 5 }}>
        <div style={{ height: "100%", width: `${width}%`, background: col, borderRadius: 3, transition: "width .4s" }} />
      </div>
      {s.leaders.length ? (
        <div style={{ fontSize: 10, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)", marginTop: 4 }}>
          {s.leaders.slice(0, 3).map((l) => (
            <span key={l.symbol} style={{ marginRight: 10 }}>
              {l.name}{" "}
              <span style={{ color: l.change >= 0 ? "var(--eb-bull)" : "var(--eb-bear)" }}>
                {pct(l.changePct)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SectorsCard() {
  const { data } = useSuspenseQuery(sectorsQuery());
  const top = data.sectors[0];
  const bottom = data.sectors[data.sectors.length - 1];
  return (
    <Card title="SECTOR HEATMAP" sub="LIVE %" accent="var(--eb-accent)">
      {top && bottom ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div
            style={{
              flex: 1,
              padding: 8,
              borderRadius: 5,
              background: "rgba(0,201,122,0.08)",
              border: "1px solid rgba(0,201,122,0.22)",
            }}
          >
            <div style={{ fontSize: 9, color: "var(--eb-muted)", textTransform: "uppercase" }}>Top Sector</div>
            <div suppressHydrationWarning style={{ fontSize: 14, fontWeight: 700, color: "var(--eb-bull)" }}>
              {top.name} {pct(top.changePct)}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              padding: 8,
              borderRadius: 5,
              background: "rgba(255,58,92,0.08)",
              border: "1px solid rgba(255,58,92,0.22)",
            }}
          >
            <div style={{ fontSize: 9, color: "var(--eb-muted)", textTransform: "uppercase" }}>Weakest Sector</div>
            <div suppressHydrationWarning style={{ fontSize: 14, fontWeight: 700, color: "var(--eb-bear)" }}>
              {bottom.name} {pct(bottom.changePct)}
            </div>
          </div>
        </div>
      ) : null}
      {data.sectors.map((s) => (
        <SectorBar key={s.symbol} s={s} />
      ))}
    </Card>
  );
}

/* ------------------------------ news ------------------------------ */

function NewsCard() {
  const { data } = useSuspenseQuery(newsQuery());
  return (
    <Card title="MARKET NEWS · WHY UP / DOWN" sub="LIVE" accent="var(--eb-bn)">
      {data.items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }}>
          No headlines available right now.
        </div>
      ) : (
        data.items.map((n: NewsItem, i) => (
          <a
            key={i}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              padding: "8px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              textDecoration: "none",
            }}
          >
            <div style={{ fontSize: 13, color: "var(--eb-text)", lineHeight: 1.4 }}>{n.title}</div>
            <div style={{ fontSize: 10, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)", marginTop: 3 }}>
              {n.source}
              {n.time ? ` · ${n.time} IST` : ""}
            </div>
          </a>
        ))
      )}
    </Card>
  );
}

/* ---------------------------- section ----------------------------- */

export function InsightsSection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="eb-grid">
        <FnoBullish />
        <FnoBearish />
      </div>
      <div
        style={{ display: "grid", gridTemplateColumns: "minmax(300px,1fr) minmax(320px,1fr)", gap: 14 }}
        className="eb-grid"
      >
        <SectorsCard />
        <NewsCard />
      </div>
    </div>
  );
}
