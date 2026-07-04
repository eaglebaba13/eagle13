import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMarketNews, type NewsItem } from "@/lib/news.functions";

export const newsQuery = () =>
  queryOptions({
    queryKey: ["market-news"],
    queryFn: () => getMarketNews(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

const CAT_META: Record<
  NewsItem["category"],
  { label: string; color: string }
> = {
  MARKET: { label: "INDIAN MARKET", color: "var(--eb-accent)" },
  BTC: { label: "BTC", color: "#f7931a" },
  GOLD: { label: "GOLD", color: "var(--eb-accent2, #f0a500)" },
  SILVER: { label: "SILVER", color: "var(--eb-neutral)" },
};

function useAgo(iso: string) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Date.now() - new Date(iso).getTime());
      const m = Math.floor(diff / 60000);
      if (m < 1) setLabel("just now");
      else if (m < 60) setLabel(`${m}m ago`);
      else setLabel(`${Math.floor(m / 60)}h ago`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [iso]);
  return label;
}

function NewsRow({ item }: { item: NewsItem }) {
  const meta = CAT_META[item.category];
  const ago = useAgo(item.pubDate);
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 4px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          fontSize: 9,
          fontFamily: "var(--eb-mono)",
          fontWeight: 700,
          letterSpacing: 0.6,
          padding: "3px 7px",
          borderRadius: 4,
          color: meta.color,
          border: `1px solid ${meta.color}`,
          background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
          minWidth: 92,
          textAlign: "center",
        }}
      >
        {meta.label}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            lineHeight: 1.45,
            color: "var(--eb-text)",
            fontFamily: "var(--eb-body)",
          }}
        >
          {item.title}
        </span>
        <span
          suppressHydrationWarning
          style={{ fontSize: 10.5, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }}
        >
          {item.source}
          {item.source && ago ? " · " : ""}
          {ago}
        </span>
      </span>
    </a>
  );
}

export function NewsFeed() {
  const { data, isFetching } = useSuspenseQuery(newsQuery());
  return (
    <section
      style={{
        marginTop: 18,
        background: "var(--eb-card)",
        border: "1px solid var(--eb-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--eb-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--eb-accent) 12%, transparent), transparent 60%)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--eb-head)",
            fontSize: 15,
            letterSpacing: 2,
            color: "var(--eb-accent)",
          }}
        >
          📰 LIVE MARKET NEWS
        </span>
        <span
          suppressHydrationWarning
          style={{
            fontSize: 10,
            fontFamily: "var(--eb-mono)",
            color: isFetching ? "var(--eb-accent)" : "var(--eb-bull)",
            letterSpacing: 0.6,
          }}
        >
          {isFetching ? "↻ updating…" : "● auto-refresh 30s"}
        </span>
      </div>
      <div style={{ padding: "6px 14px", maxHeight: 460, overflowY: "auto" }}>
        {data.items.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }}>
            No recent headlines available.
          </div>
        ) : (
          data.items.map((it) => <NewsRow key={it.link + it.title} item={it} />)
        )}
      </div>
    </section>
  );
}
