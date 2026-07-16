import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useMemo, useState } from "react";

import { getMarketData, type IndexQuote } from "@/lib/market.functions";
import { computeLevels } from "@/lib/levels";
import { InsightsSection, prefetchInsights } from "@/components/InsightsSection";
import { Disclaimer } from "@/components/Disclaimer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NewsCenter } from "@/components/NewsPopup";
import { NewsFeed, newsQuery } from "@/components/NewsFeed";
import { FiiDiiActivity, fiiDiiQuery } from "@/components/FiiDiiActivity";
import { Seasonality, seasonalityQuery } from "@/components/Seasonality";
import logoUrl from "@/assets/eaglebaba-logo.png";
import { useIstClock } from "@/hooks/use-scheduler";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import {
  DashboardDataProvider,
  type DashboardTabKey,
} from "@/components/dashboard/DashboardDataContext";
import {
  LEGACY_DASHBOARD_WIDGETS,
  legacyWidgetsById,
} from "@/lib/dashboard-widgets";
import { deriveDashboardFreshness } from "@/lib/dashboard-freshness-adapter";
import { DashboardParityDiagnostic } from "@/components/dashboard/DashboardParityDiagnostic";

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

function Dashboard() {
  const { data, dataUpdatedAt, isFetching, isStale, error, refetch } =
    useSuspenseQuery(marketQuery());
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

  const [tab, setTab] = useState<DashboardTabKey>("nifty");
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  const quote = active.quote;
  const accent = active.accent;
  const safeBand = active.safeBand;
  const levels = useMemo(
    () => computeLevels(quote.prevDay, safeBand),
    [quote.prevDay, safeBand],
  );

  const freshnessByDependency = useMemo(
    () =>
      deriveDashboardFreshness({
        nifty: data.nifty,
        banknifty: data.banknifty,
        gold: data.gold,
        silver: data.silver,
        queryReceivedAt: dataUpdatedAt || null,
        providerStatus: "OK",
      }),
    [data.nifty, data.banknifty, data.gold, data.silver, dataUpdatedAt],
  );

  const dashboardCtx = useMemo(
    () => ({
      data,
      dataUpdatedAt,
      isFetching,
      activeTab: tab,
      activeQuote: quote,
      accent,
      safeBand,
      levels,
      queryReceivedAt: dataUpdatedAt || null,
      lastSuccessfulUpdate: dataUpdatedAt || null,
      freshnessByDependency,
      providerMetadata: { name: "Yahoo Finance", status: "OK" as const },
      queryError: error,
      queryStale: isStale,
    }),
    [
      data,
      dataUpdatedAt,
      isFetching,
      tab,
      quote,
      accent,
      safeBand,
      levels,
      freshnessByDependency,
      error,
      isStale,
    ],
  );

  // Legacy `/` widget set is registry-driven. Both rails render the same
  // DashboardGrid renderer in single-column ("mobile") mode; the outer CSS
  // grid preserves the pre-24C two-rail layout on desktop and collapses to
  // one column via `.eb-grid` at <820px.
  const widgetById = useMemo(() => legacyWidgetsById(), []);
  const leftRail = useMemo(
    () => {
      const ids: string[] = [
        "legacy-quote",
        ...(data.vix ? ["legacy-vix"] : []),
        "legacy-gold-silver",
        "legacy-signal",
        "legacy-global-markets",
      ];
      return ids.map((id) => widgetById.get(id)!).filter(Boolean);
    },
    [widgetById, data.vix],
  );
  const cprWidget = [widgetById.get("legacy-cpr")!];
  const safeZonesWidget = [widgetById.get("legacy-safe-zones")!];
  const gannWidget = [widgetById.get("legacy-gann")!];
  const pivotWidget = [widgetById.get("legacy-pivot")!];
  const gannCycleWidget = [widgetById.get("legacy-gann-cycle")!];

  return (
    <div className="eb-shell eb-scanlines">
      <div className="eb-space-bg" aria-hidden="true" />
      <Header
        clock={clock}
        nifty={data.nifty}
        banknifty={data.banknifty}
        vix={data.vix}
        btc={data.btc}
        gold={data.gold}
        goldSilverRatio={data.goldSilverRatio}
      />

      <LiveTicker
        nifty={data.nifty}
        banknifty={data.banknifty}
        vix={data.vix}
        btc={data.btc}
        gold={data.gold}
        silver={data.silver}
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
        <DashboardDataProvider value={dashboardCtx}>
          <div
            data-eb-dashboard-root
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(280px,1fr) minmax(360px,1.4fr)",
              gap: 14,
              alignItems: "start",
            }}
            className="eb-grid"
          >
            <DashboardGrid
              device="mobile"
              context={{ plan: "free" }}
              widgets={leftRail}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <DashboardGrid device="mobile" context={{ plan: "free" }} widgets={cprWidget} />
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
                className="eb-grid"
              >
                <DashboardGrid device="mobile" context={{ plan: "free" }} widgets={safeZonesWidget} />
                <DashboardGrid device="mobile" context={{ plan: "free" }} widgets={gannWidget} />
              </div>
              <DashboardGrid device="mobile" context={{ plan: "free" }} widgets={pivotWidget} />
              <DashboardGrid device="mobile" context={{ plan: "free" }} widgets={gannCycleWidget} />
            </div>
          </div>
        </DashboardDataProvider>

        {import.meta.env.DEV ||
        (typeof window !== "undefined" &&
          window.localStorage?.getItem("eb-diagnostics") === "on") ? (
          <DashboardParityDiagnostic
            widgetContext={{ plan: "free" }}
            navContext={{ plan: "free" }}
          />
        ) : null}

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
        /* The sticky mobile top bar already shows the brand, so hide the
           duplicate wordmark in the page header on phones/tablets. */
        @media(max-width:860px){
          .eb-header-brand{display:none !important;}
          .eb-header{justify-content:flex-start !important;}
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
        className="eb-header-brand"
        style={{
          fontFamily: "var(--eb-head)",
          fontSize: 26,
          letterSpacing: 3,
          color: "var(--eb-accent)",
          textShadow: "0 0 18px rgba(240,165,0,0.4)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <img
          src={logoUrl}
          alt="EagleBABA logo"
          width={44}
          height={44}
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            objectFit: "cover",
            boxShadow: "0 0 16px rgba(212,175,55,0.35)",
          }}
        />
        <span>
        EAGLE<span style={{ color: "var(--eb-accent2)" }}>BABA</span>
        <span style={{ fontSize: 13, letterSpacing: 2, color: "var(--eb-muted)", marginLeft: 10 }}>
          · ASTRO LEVELS
        </span>
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
        <NewsCenter />
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

/* ------------------------- Live scrolling ticker ------------------------ */

function LiveTicker({
  nifty,
  banknifty,
  vix,
  btc,
  gold,
  silver,
}: {
  nifty: IndexQuote;
  banknifty: IndexQuote;
  vix: IndexQuote | null;
  btc: IndexQuote | null;
  gold: IndexQuote | null;
  silver: IndexQuote | null;
}) {
  const items: { label: string; q: IndexQuote; color: string; invert?: boolean }[] = [
    { label: "NIFTY 50", q: nifty, color: "var(--eb-accent)" },
    { label: "BANKNIFTY", q: banknifty, color: "var(--eb-bn)" },
  ];
  if (vix) items.push({ label: "INDIA VIX", q: vix, color: "var(--eb-neutral)", invert: true });
  if (gold) items.push({ label: "GOLD", q: gold, color: "var(--eb-accent)" });
  if (silver) items.push({ label: "SILVER", q: silver, color: "var(--eb-muted)" });
  if (btc) items.push({ label: "BTC/USD", q: btc, color: "#f7931a" });

  const row = (keyPrefix: string) =>
    items.map(({ label, q, color, invert }) => {
      const up = q.change >= 0;
      const tone = (invert ? !up : up) ? "var(--eb-bull)" : "var(--eb-bear)";
      return (
        <span className="eb-ticker-item" key={`${keyPrefix}-${label}`}>
          <span className="eb-ticker-sym" style={{ color }}>{label}</span>
          <span suppressHydrationWarning style={{ color: "var(--eb-text)" }}>{fmt(q.livePrice)}</span>
          <span suppressHydrationWarning style={{ color: tone }}>
            {up ? "▲" : "▼"} {q.changePct}%
          </span>
        </span>
      );
    });

  return (
    <div className="eb-ticker" role="marquee" aria-label="Live market ticker">
      <div className="eb-ticker-track">
        {row("a")}
        {row("b")}
      </div>
    </div>
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
