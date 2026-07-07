import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { getMarketData, type IndexQuote } from "@/lib/market.functions";
import { computeLevels, cprBias, type Levels } from "@/lib/levels";
import { InsightsSection, prefetchInsights } from "@/components/InsightsSection";
import { Disclaimer } from "@/components/Disclaimer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NewsFeed, newsQuery } from "@/components/NewsFeed";
import { FiiDiiActivity, fiiDiiQuery } from "@/components/FiiDiiActivity";
import { Seasonality, seasonalityQuery } from "@/components/Seasonality";

const marketQuery = () =>
  queryOptions({
    queryKey: ["market-data"],
    queryFn: () => getMarketData(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(marketQuery());
    // Secondary sections stream in on their own Suspense boundaries, so we
    // only prime their caches (non-blocking) instead of awaiting them during
    // the critical above-the-fold render.
    context.queryClient.prefetchQuery(newsQuery());
    context.queryClient.prefetchQuery(fiiDiiQuery());
    context.queryClient.prefetchQuery(seasonalityQuery());
    prefetchInsights(context.queryClient);
  },
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div className="eb-shell" style={{ padding: 40 }}>
      <p style={{ color: "var(--eb-bear)", fontFamily: "var(--eb-mono)" }}>
        Live data unavailable: {error.message}
      </p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="eb-shell" style={{ padding: 40 }}>
      <p style={{ color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }}>
        Nothing to show here.
      </p>
    </div>
  ),
});

/* ------------------------------------------------------------------ */

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useIstClock() {
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () => {
      const t = new Date().toLocaleTimeString("en-GB", {
        hour12: false,
        timeZone: "Asia/Kolkata",
      });
      setNow(t);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Dashboard() {
  const { data, dataUpdatedAt, isFetching, refetch } = useSuspenseQuery(marketQuery());
  const clock = useIstClock();
  type TabKey = "nifty" | "banknifty" | "btc" | "gold";

  const tabs = useMemo(() => {
    const list: {
      key: TabKey;
      label: string;
      badge: string;
      quote: IndexQuote;
      accent: string;
      safeBand: number;
    }[] = [
      { key: "nifty", label: "NIFTY 50", badge: "NSE", quote: data.nifty, accent: "var(--eb-accent)", safeBand: 100 },
      { key: "banknifty", label: "BANKNIFTY", badge: "NSE", quote: data.banknifty, accent: "var(--eb-bn)", safeBand: 300 },
    ];
    if (data.btc) list.push({ key: "btc", label: "BTC/USD", badge: "CRYPTO", quote: data.btc, accent: "#f7931a", safeBand: 500 });
    if (data.gold) list.push({ key: "gold", label: "XAU/USD", badge: "COMEX", quote: data.gold, accent: "var(--eb-accent)", safeBand: 15 });
    return list;
  }, [data.nifty, data.banknifty, data.btc, data.gold]);

  const [tab, setTab] = useState<TabKey>("nifty");
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  const quote = active.quote;
  const accent = active.accent;
  const safeBand = active.safeBand;
  const levels = useMemo(
    () => computeLevels(quote.prevDay, safeBand),
    [quote.prevDay, safeBand],
  );

  return (
    <div className="eb-shell eb-scanlines">
      <Header
        clock={clock}
        nifty={data.nifty}
        banknifty={data.banknifty}
        vix={data.vix}
        btc={data.btc}
        gold={data.gold}
        goldSilverRatio={data.goldSilverRatio}
      />

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Select index"
        style={{ display: "flex", background: "var(--eb-bg2)", borderBottom: "2px solid var(--eb-border)" }}
        className="eb-tabrow"
      >
        {tabs.map((t) => (
          <TabButton key={t.key} active={tab === t.key} color={t.accent} onClick={() => setTab(t.key)}>
            {t.label}
            <Badge>{t.badge}</Badge>
          </TabButton>
        ))}
      </div>

      <main className="eb-main" style={{ padding: "16px 18px", maxWidth: 1280, margin: "0 auto" }}>
        <ReferralBanner />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px,1fr) minmax(360px,1.4fr)",
            gap: 14,
            alignItems: "start",
          }}
          className="eb-grid"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <QuoteCard quote={quote} accent={accent} />
            {data.vix ? <VixCard vix={data.vix} /> : null}
            <SignalCard levels={levels} />
            <GlobalMarketsCard
              btc={data.btc}
              gold={data.gold}
              silver={data.silver}
              goldSilverRatio={data.goldSilverRatio}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CprCard quote={quote} levels={levels} accent={accent} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="eb-grid">
              <SafeZonesCard levels={levels} band={safeBand} />
              <GannCard levels={levels} />
            </div>
            <PivotCard levels={levels} accent={accent} />
            <GannCycleCard levels={levels} />
          </div>
        </div>

        <InsightsSection />

        <Suspense fallback={<SectionSkeleton label="Loading FII & DII activity…" />}>
          <FiiDiiActivity />
        </Suspense>

        <Suspense fallback={<SectionSkeleton label="Loading seasonality…" />}>
          <Seasonality />
        </Suspense>

        <Suspense fallback={<SectionSkeleton label="Loading market news…" />}>
          <NewsFeed />
        </Suspense>

        <Disclaimer />
      </main>

      <StatusBar
        updatedAt={dataUpdatedAt}
        isFetching={isFetching}
        onRefresh={() => refetch()}
        quote={quote}
      />

      <style>{`
        .eb-shell{background:var(--eb-bg);color:var(--eb-text);font-family:var(--eb-body);min-height:100vh;}
        .eb-tabrow{overflow-x:auto;-webkit-overflow-scrolling:touch;}
        @media(max-width:820px){.eb-grid{grid-template-columns:1fr !important;}}
        .eb-tab:hover{color:var(--eb-text);}
        @media(max-width:820px){
          .eb-grid{grid-template-columns:1fr !important;}
        }
        @media(max-width:640px){
          .eb-header{padding:12px 16px !important;}
          .eb-header-brand{font-size:21px !important;letter-spacing:2px !important;}
          .eb-main{padding:12px 12px !important;}
          .eb-tab{padding:11px 18px !important;font-size:15px !important;flex:1;text-align:center;}
          .eb-statusbar{padding:8px 14px !important;}
        }
      `}</style>
    </div>
  );
}

/* ---------------------------- Header ------------------------------ */

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: 24,
        textAlign: "center",
        color: "var(--eb-muted)",
        fontFamily: "var(--eb-mono)",
        fontSize: 12,
        border: "1px solid var(--eb-border)",
        borderRadius: 8,
        background: "var(--eb-card)",
      }}
    >
      {label}
    </div>
  );
}

function Header({
  clock,
  nifty,
  banknifty,
  vix,
  btc,
  gold,
  goldSilverRatio,
}: {
  clock: string;
  nifty: IndexQuote;
  banknifty: IndexQuote;
  vix: IndexQuote | null;
  btc: IndexQuote | null;
  gold: IndexQuote | null;
  goldSilverRatio: number | null;
}) {
  return (
    <header
      className="eb-header"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 28px",
        borderBottom: "1px solid var(--eb-border)",
        background: "linear-gradient(135deg,var(--eb-bg),var(--eb-bg2))",
        position: "sticky",
        top: 0,
        zIndex: 500,
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: "var(--eb-head)",
          fontSize: 26,
          letterSpacing: 3,
          color: "var(--eb-accent)",
          textShadow: "0 0 18px rgba(240,165,0,0.4)",
        }}
      >
        EAGLE<span style={{ color: "var(--eb-accent2)" }}>BABA</span>
        <span style={{ fontSize: 13, letterSpacing: 2, color: "var(--eb-muted)", marginLeft: 10 }}>
          · ASTRO LEVELS
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 22,
          alignItems: "center",
          fontFamily: "var(--eb-mono)",
          fontSize: 12,
          color: "var(--eb-muted)",
          flexWrap: "wrap",
        }}
      >
        <MiniTicker q={nifty} color="var(--eb-accent)" />
        <MiniTicker q={banknifty} color="var(--eb-bn)" />
        {vix ? <VixTicker q={vix} /> : null}
        {btc ? <MiniTicker q={btc} color="#f7931a" label="BTC" /> : null}
        {gold ? <MiniTicker q={gold} color="var(--eb-accent)" label="XAU/USD" /> : null}
        {goldSilverRatio != null ? (
          <span style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ color: "var(--eb-neutral)", fontWeight: 700 }}>GS RATIO</span>
            <span suppressHydrationWarning style={{ color: "var(--eb-text)" }}>{goldSilverRatio}</span>
          </span>
        ) : null}
        <span>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--eb-bull)",
              boxShadow: "0 0 7px var(--eb-bull)",
              animation: "eb-pulse 1.5s infinite",
              display: "inline-block",
              marginRight: 5,
            }}
          />
          NSE INDIA
        </span>
        <span style={{ color: "var(--eb-neutral)" }}>{clock} IST</span>
        <Link
          to="/astro"
          style={{
            color: "var(--eb-neutral)",
            textDecoration: "none",
            border: "1px solid var(--eb-line, #1f2937)",
            padding: "3px 9px",
            borderRadius: 7,
            fontSize: 12,
          }}
        >
          🪐 Astro Levels
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

function MiniTicker({ q, color, label }: { q: IndexQuote; color: string; label?: string }) {
  const up = q.change >= 0;
  return (
    <span style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
      <span style={{ color, fontWeight: 700 }}>{label ?? q.name}</span>
      <span suppressHydrationWarning style={{ color: "var(--eb-text)" }}>{fmt(q.livePrice)}</span>
      <span suppressHydrationWarning style={{ color: up ? "var(--eb-bull)" : "var(--eb-bear)" }}>
        {up ? "▲" : "▼"} {q.changePct}%
      </span>
    </span>
  );
}

// For India VIX a RISE means more fear (bearish for market), so colors invert.
function VixTicker({ q }: { q: IndexQuote }) {
  const up = q.change >= 0;
  const col = up ? "var(--eb-bear)" : "var(--eb-bull)";
  return (
    <span style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
      <span style={{ color: "var(--eb-neutral)", fontWeight: 700 }}>VIX</span>
      <span suppressHydrationWarning style={{ color: "var(--eb-text)" }}>{fmt(q.livePrice)}</span>
      <span suppressHydrationWarning style={{ color: col }}>
        {up ? "▲" : "▼"} {q.changePct}%
      </span>
    </span>
  );
}

/* ---------------------------- Tabs -------------------------------- */

function TabButton({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="eb-tab"
      style={{
        padding: "12px 34px",
        fontFamily: "var(--eb-head)",
        fontSize: 18,
        letterSpacing: 2,
        cursor: "pointer",
        background: "transparent",
        border: "none",
        borderBottom: `3px solid ${active ? color : "transparent"}`,
        color: active ? color : "var(--eb-muted)",
        transition: "all .2s",
        userSelect: "none",
        marginBottom: -2,
      }}
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: "var(--eb-mono)",
        marginLeft: 7,
        padding: "1px 5px",
        borderRadius: 3,
        background: "rgba(255,255,255,0.06)",
        color: "var(--eb-muted)",
        letterSpacing: 1,
      }}
    >
      {children}
    </span>
  );
}

/* ---------------------------- Cards ------------------------------- */

function ReferralBanner() {
  return (
    <div
      style={{
        marginBottom: 16,
        borderRadius: 10,
        border: "1px solid var(--eb-accent)",
        background:
          "linear-gradient(120deg, color-mix(in srgb, var(--eb-accent) 16%, transparent), var(--eb-card) 70%)",
        padding: "14px 18px",
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240, flex: "1 1 320px" }}>
        <span
          style={{
            fontFamily: "var(--eb-head)",
            fontSize: 17,
            letterSpacing: 1,
            color: "var(--eb-accent)",
          }}
        >
          📈 Open Your Demat Account with INDmoney
        </span>
        <span style={{ fontSize: 13, color: "var(--eb-text)", lineHeight: 1.5, fontFamily: "var(--eb-body)" }}>
          Invest across 6000+ Stocks &amp; ETFs 🚀 Real-time price alerts ✨ Custom watchlists for
          your favourite stocks.
        </span>
        <span style={{ fontSize: 12, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }}>
          Referral code:{" "}
          <span style={{ color: "var(--eb-accent)", fontWeight: 700, letterSpacing: 1 }}>
            QUJLFDEOIND
          </span>
        </span>
      </div>
      <a
        href="https://indmoney.onelink.me/RmHC/0mewvsqe"
        target="_blank"
        rel="noopener noreferrer sponsored"
        style={{
          flexShrink: 0,
          padding: "11px 22px",
          borderRadius: 8,
          background: "var(--eb-accent)",
          color: "#0b1220",
          fontFamily: "var(--eb-head)",
          fontSize: 15,
          letterSpacing: 1,
          textDecoration: "none",
          fontWeight: 700,
          boxShadow: "0 0 18px color-mix(in srgb, var(--eb-accent) 45%, transparent)",
        }}
      >
        JOIN &amp; INVEST 🎉
      </a>
    </div>
  );
}

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
      className="eb-card eb-glass"
      style={{
        borderRadius: 12,
        overflow: "hidden",
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
      <div style={{ padding: "12px 13px" }}>{children}</div>
    </div>
  );
}

function FlashValue({ value, color }: { value: number; color?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && ref.current) {
      ref.current.style.animation = "none";
      // force reflow
      void ref.current.offsetWidth;
      ref.current.style.animation = "eb-flash 1.1s ease-out";
      prev.current = value;
    }
  }, [value]);
  return (
    <span
      ref={ref}
      style={{
        fontFamily: "var(--eb-mono)",
        fontSize: 15,
        fontWeight: 700,
        color: color ?? "var(--eb-text)",
        padding: "1px 4px",
        borderRadius: 3,
      }}
    >
      {fmt(value)}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "7px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--eb-muted)", fontFamily: "var(--eb-mono)" }}>{label}</span>
      {children}
    </div>
  );
}

function QuoteCard({ quote, accent }: { quote: IndexQuote; accent: string }) {
  const up = quote.change >= 0;
  return (
    <Card
      title={`${quote.name} — LIVE`}
      sub={quote.marketState === "OPEN" ? "MARKET OPEN" : "MARKET CLOSED"}
      accent={accent}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <span suppressHydrationWarning style={{ fontFamily: "var(--eb-mono)", fontSize: 30, fontWeight: 700, color: "var(--eb-text)" }}>
          {fmt(quote.livePrice)}
        </span>
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

function VixCard({ vix }: { vix: IndexQuote }) {
  // VIX up = rising fear/volatility (risk-off); VIX down = calm (risk-on).
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

function CprCard({
  quote,
  levels,
  accent,
}: {
  quote: IndexQuote;
  levels: Levels;
  accent: string;
}) {
  const bias = cprBias(levels);
  const toneColor =
    bias.tone === "bull" ? "var(--eb-bull)" : bias.tone === "bear" ? "var(--eb-bear)" : "var(--eb-neutral)";
  return (
    <Card title={`${quote.name} — CPR LEVELS`} sub="PP · TC · BC" accent={accent}>
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
        <span style={{ fontSize: 11, fontFamily: "var(--eb-head)", letterSpacing: 1, color: toneColor }}>
          {bias.label}
        </span>
      </div>
    </Card>
  );
}

function GlobalMarketsCard({
  btc,
  gold,
  silver,
  goldSilverRatio,
}: {
  btc: IndexQuote | null;
  gold: IndexQuote | null;
  silver: IndexQuote | null;
  goldSilverRatio: number | null;
}) {
  const items: { label: string; q: IndexQuote; color: string; suffix?: string }[] = [];
  if (btc) items.push({ label: "BTC / USD", q: btc, color: "#f7931a" });
  if (gold) items.push({ label: "XAU / USD (GOLD)", q: gold, color: "var(--eb-accent)" });
  if (silver) items.push({ label: "XAG / USD (SILVER)", q: silver, color: "var(--eb-neutral)" });

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
      {goldSilverRatio != null ? (
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
            {goldSilverRatio}
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

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        padding: 9,
        borderRadius: 5,
        textAlign: "center",
        background: "rgba(255,255,255,0.025)",
        border: "1px solid var(--eb-border)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--eb-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 15, fontWeight: 700, color, marginTop: 3 }}>
        {fmt(value)}
      </div>
    </div>
  );
}

function PivotCard({ levels, accent }: { levels: Levels; accent: string }) {
  const rows = [
    { k: "R3", v: levels.r3, c: "var(--eb-bull)" },
    { k: "R2", v: levels.r2, c: "var(--eb-bull)" },
    { k: "R1", v: levels.r1, c: "var(--eb-bull)" },
    { k: "PP", v: levels.pivot, c: accent },
    { k: "S1", v: levels.s1, c: "var(--eb-bear)" },
    { k: "S2", v: levels.s2, c: "var(--eb-bear)" },
    { k: "S3", v: levels.s3, c: "var(--eb-bear)" },
  ];
  return (
    <Card title="PIVOT LEVELS" sub="R1-R3 · S1-S3" accent={accent}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Level</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td style={{ ...tdStyle, color: r.c, fontWeight: 700 }}>{r.k}</td>
              <td style={{ ...tdStyle, textAlign: "right", color: r.c }}>{fmt(r.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const thStyle: React.CSSProperties = {
  padding: "6px 9px",
  textAlign: "left",
  fontSize: 10,
  color: "var(--eb-muted)",
  fontFamily: "var(--eb-mono)",
  letterSpacing: 0.8,
  borderBottom: "1px solid var(--eb-border)",
  fontWeight: "normal",
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 9px",
  fontFamily: "var(--eb-mono)",
  fontSize: 13,
  borderBottom: "1px solid rgba(255,255,255,0.025)",
};

function SafeZonesCard({ levels, band }: { levels: Levels; band: number }) {
  return (
    <Card title="SAFE ZONES" sub={`±${band} pts`} accent="var(--eb-neutral)">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div
          style={{
            padding: 9,
            borderRadius: 5,
            textAlign: "center",
            background: "rgba(0,201,122,0.08)",
            border: "1px solid rgba(0,201,122,0.22)",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--eb-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Safe Buy
          </div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 16, fontWeight: 700, color: "var(--eb-bull)", marginTop: 3 }}>
            {fmt(levels.safeBuy)}
          </div>
        </div>
        <div
          style={{
            padding: 9,
            borderRadius: 5,
            textAlign: "center",
            background: "rgba(255,58,92,0.08)",
            border: "1px solid rgba(255,58,92,0.22)",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--eb-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Safe Sell
          </div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 16, fontWeight: 700, color: "var(--eb-bear)", marginTop: 3 }}>
            {fmt(levels.safeSell)}
          </div>
        </div>
      </div>
    </Card>
  );
}

function GannCard({ levels }: { levels: Levels }) {
  return (
    <Card title="GANN 360° ZONES" sub="√ projection" accent="var(--eb-neutral)">
      <Row label="Gann Up">
        <span style={{ fontFamily: "var(--eb-mono)", fontSize: 15, fontWeight: 700, color: "var(--eb-bull)" }}>
          {fmt(levels.gannUp)}
        </span>
      </Row>
      <Row label="Gann Down">
        <span style={{ fontFamily: "var(--eb-mono)", fontSize: 15, fontWeight: 700, color: "var(--eb-bear)" }}>
          {fmt(levels.gannDown)}
        </span>
      </Row>
    </Card>
  );
}

function GannCycleCard({ levels }: { levels: Levels }) {
  return (
    <Card title="GANN CYCLE" sub="SQUARE OF 9 · 45° STEPS" accent="var(--eb-bn)">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["ANGLE", "RESISTANCE ▲", "SUPPORT ▼"].map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: i === 0 ? "left" : "right",
                  fontSize: 9,
                  letterSpacing: 0.5,
                  color: "var(--eb-muted)",
                  fontWeight: 700,
                  padding: "4px 2px",
                  borderBottom: "1px solid var(--eb-border)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.gannCycle.map((g) => (
            <tr key={g.deg} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: "var(--eb-text)", padding: "5px 2px" }}>
                {g.deg}°
              </td>
              <td
                style={{
                  fontFamily: "var(--eb-mono)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--eb-bull)",
                  textAlign: "right",
                  padding: "5px 2px",
                }}
              >
                {fmt(g.up)}
              </td>
              <td
                style={{
                  fontFamily: "var(--eb-mono)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--eb-bear)",
                  textAlign: "right",
                  padding: "5px 2px",
                }}
              >
                {fmt(g.down)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SignalCard({ levels }: { levels: Levels }) {
  const bias = cprBias(levels);
  const isBull = bias.tone === "bull";
  const tone = bias.tone === "neutral" ? "var(--eb-neutral)" : isBull ? "var(--eb-bull)" : "var(--eb-bear)";
  return (
    <Card title="MARKET SIGNAL" sub="AUTO" accent="var(--eb-neutral)">
      <div
        style={{
          padding: 12,
          textAlign: "center",
          borderRadius: 6,
          border: `1px solid ${tone}`,
          background: "rgba(255,255,255,0.02)",
          marginBottom: 9,
        }}
      >
        <div style={{ fontFamily: "var(--eb-head)", fontSize: 21, letterSpacing: 2, color: tone }}>
          {bias.headline}
        </div>
        <div style={{ fontSize: 11, color: "var(--eb-muted)", marginTop: 2 }}>{bias.label}</div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--eb-muted)",
          fontFamily: "var(--eb-mono)",
          padding: "7px 10px",
          background: "rgba(255,255,255,0.02)",
          borderRadius: 5,
          lineHeight: 1.5,
        }}
      >
        Levels auto-computed from the previous working day OHLC. CPR width drives the
        trending vs range read. Not financial advice.
      </div>
    </Card>
  );
}

/* -------------------------- Status bar ---------------------------- */

function StatusBar({
  updatedAt,
  isFetching,
  onRefresh,
  quote,
}: {
  updatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
  quote: IndexQuote;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const t = new Date(updatedAt).toLocaleTimeString("en-GB", {
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
  return (
    <div
      className="eb-statusbar"
      style={{
        padding: "8px 24px",
        fontFamily: "var(--eb-mono)",
        fontSize: 11,
        color: "var(--eb-muted)",
        borderTop: "1px solid var(--eb-border)",
        background: "var(--eb-bg2)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <span
        suppressHydrationWarning
        className={isFetching ? "" : "eb-ok"}
        style={{ color: isFetching ? "var(--eb-accent)" : "var(--eb-bull)" }}
      >
        {!mounted
          ? "✓ Live · auto-refresh 30s"
          : isFetching
            ? "↻ Updating live data…"
            : `✓ Live · updated ${t} IST · auto-refresh 30s`}
      </span>
      <button
        onClick={onRefresh}
        style={{
          padding: "5px 14px",
          borderRadius: 4,
          border: "1px solid var(--eb-border)",
          background: "var(--eb-bg3)",
          color: "var(--eb-neutral)",
          cursor: "pointer",
          fontFamily: "var(--eb-body)",
          fontSize: 13,
          letterSpacing: 1,
        }}
      >
        ↺ REFRESH {quote.name}
      </button>
    </div>
  );
}
