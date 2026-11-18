import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { getMarketData, type IndexQuote } from "@/lib/market.functions";
import { computeLevels } from "@/lib/levels";
import { prefetchInsights } from "@/lib/insights.functions";
import { Disclaimer } from "@/components/Disclaimer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { newsQuery } from "@/lib/news.functions";
import { fiiDiiQuery } from "@/lib/fiidii.functions";
import { seasonalityQuery } from "@/lib/seasonality.functions";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import {
  DashboardDataProvider,
  type DashboardTabKey,
} from "@/components/dashboard/DashboardDataContext";
import {
  LEGACY_DASHBOARD_WIDGETS,
  CRYPTO_DASHBOARD_WIDGETS,
  legacyWidgetsById,
} from "@/lib/dashboard-widgets";
import { deriveDashboardFreshness } from "@/lib/dashboard-freshness-adapter";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  isHidden,
  type DashboardPreferences,
} from "@/lib/dashboard-preferences";
import { summarizeDashboardHealth } from "@/lib/dashboard-health";
import type { FreshnessStatus, ProviderStatus } from "@/lib/data-freshness";
import {
  RuntimeReadinessStrip,
  RuntimeReadinessStripFallback,
} from "@/components/runtime-readiness/RuntimeReadinessStrip";
import { useRuntimeReadinessQuery } from "@/lib/runtime-readiness/use-runtime-readiness";
import { AstroRegimeHeroCarousel } from "@/components/dashboard/AstroRegimeHeroCarousel";
import { getCachedFeatures } from "@/lib/features-client";

const GtiSummaryCard = lazy(() =>
  import("@/components/dashboard/GtiSummaryCard").then((m) => ({ default: m.GtiSummaryCard })),
);
const InsightsSection = lazy(() =>
  import("@/components/InsightsSection").then((m) => ({ default: m.InsightsSection })),
);
const FiiDiiActivity = lazy(() =>
  import("@/components/FiiDiiActivity").then((m) => ({ default: m.FiiDiiActivity })),
);
const Seasonality = lazy(() =>
  import("@/components/Seasonality").then((m) => ({ default: m.Seasonality })),
);
const NewsFeed = lazy(() => import("@/components/NewsFeed").then((m) => ({ default: m.NewsFeed })));
const CustomizeDashboardDrawer = lazy(() =>
  import("@/components/dashboard/CustomizeDashboardDrawer").then((m) => ({
    default: m.CustomizeDashboardDrawer,
  })),
);
const DashboardParityDiagnostic = lazy(() =>
  import("@/components/dashboard/DashboardParityDiagnostic").then((m) => ({
    default: m.DashboardParityDiagnostic,
  })),
);

const marketQuery = () =>
  queryOptions({
    queryKey: ["market-data"],
    queryFn: () => getMarketData(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | EagleBABA Trading Terminal" },
      {
        name: "description",
        content:
          "Institutional trading terminal with Gann Square of 9 levels, Planetary Astro timing, Live Option Chain, and Market Replay.",
      },
    ],
  }),
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(marketQuery());
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
        Live data unavailable: {error instanceof Error ? error.message : "Unexpected error"}
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
  const market = useQuery(marketQuery());
  if (!market.data) return (
    <div className="eb-shell p-6"><h1 className="text-lg font-semibold">Research Dashboard</h1>
      <p role="status" className="my-3 text-sm text-amber-400">{market.isPending ? "Loading verified market quotes…" : "Market quotes are temporarily unavailable. Your research session is active."}</p>
      <button type="button" disabled={market.isFetching} onClick={() => void market.refetch()}>Retry market data</button>
    </div>
  );
  return <DashboardContent market={market} />;
}

function DashboardContent({ market }: { market: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getMarketData>>>> }) {
  const { data, dataUpdatedAt, isFetching, isStale, error, refetch } =
    market as typeof market & { data: NonNullable<typeof market.data> };
  type TabKey = "nifty" | "banknifty" | "sensex" | "btc" | "gold";

  const [prefs, setPrefs] = useState<DashboardPreferences>(DEFAULT_PREFERENCES);
  useEffect(() => {
    setPrefs(loadPreferences(typeof window !== "undefined" ? window.localStorage : null));
  }, []);
  const updatePrefs = (next: DashboardPreferences) => {
    setPrefs(next);
    if (typeof window !== "undefined") savePreferences(window.localStorage, next);
  };
  const [drawerOpen, setDrawerOpen] = useState(false);

  const tabs = useMemo(() => {
    const list: {
      key: TabKey;
      label: string;
      badge: string;
      quote: IndexQuote;
      accent: string;
      safeBand: number;
    }[] = [
      {
        key: "nifty",
        label: "NIFTY 50",
        badge: "NSE",
        quote: data.nifty,
        accent: "var(--eb-accent)",
        safeBand: 100,
      },
      {
        key: "banknifty",
        label: "BANKNIFTY",
        badge: "NSE",
        quote: data.banknifty,
        accent: "var(--eb-bn)",
        safeBand: 300,
      },
    ];
    if (data.sensex)
      list.push({
        key: "sensex",
        label: "BSE SENSEX",
        badge: "BSE",
        quote: data.sensex,
        accent: "#38bdf8",
        safeBand: 350,
      });
    if (data.btc)
      list.push({
        key: "btc",
        label: "BTC/USD",
        badge: "CRYPTO",
        quote: data.btc,
        accent: "#f7931a",
        safeBand: 500,
      });
    if (data.gold)
      list.push({
        key: "gold",
        label: "XAU/USD",
        badge: "COMEX",
        quote: data.gold,
        accent: "var(--eb-accent)",
        safeBand: 15,
      });
    return list;
  }, [data.nifty, data.banknifty, data.sensex, data.btc, data.gold]);

  const [tab, setTab] = useState<DashboardTabKey>("nifty");
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  const quote = active.quote;
  const accent = active.accent;
  const safeBand = active.safeBand;
  const levels = useMemo(() => computeLevels(quote.prevDay, safeBand), [quote.prevDay, safeBand]);

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
      providerMetadata: { name: "Market Data Provider", status: "OK" as const },
      marketProviderMetadata: data.providerMetadata,
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
  const leftRail = useMemo(() => {
    const ids: string[] = [
      "legacy-quote",
      "legacy-vix",
      "legacy-gold-silver",
      "legacy-signal",
      "legacy-global-markets",
    ];
    return ids
      .filter((id) => !isHidden(prefs, id))
      .map((id) => widgetById.get(id)!)
      .filter(Boolean);
  }, [widgetById, prefs]);
  const rightRailPick = (id: string) =>
    isHidden(prefs, id) ? [] : [widgetById.get(id)!].filter(Boolean);
  const cprWidget = rightRailPick("legacy-cpr");
  const safeZonesWidget = rightRailPick("legacy-safe-zones");
  const gannWidget = rightRailPick("legacy-gann");
  const pivotWidget = rightRailPick("legacy-pivot");
  const gannCycleWidget = rightRailPick("legacy-gann-cycle");

  const health = useMemo(
    () =>
      summarizeDashboardHealth({
        freshness: freshnessByDependency,
        providerStatus: "OK",
        lastSuccessAt: dataUpdatedAt || null,
        methodologies: [
          "GANN_NIFTY_ASTRO_V1_1",
          "GANN_ASTRO_INTRADAY_ABSOLUTE_V1",
          "LEGACY_EAGLEBABA_CASCADE_V1",
          "CPR_CENTRAL_PIVOT_V1",
          "CLASSIC_PIVOT_V1",
          "SAFE_ZONE_BAND_V1",
          "GOLD_SILVER_RATIO_V1",
        ],
      }),
    [freshnessByDependency, dataUpdatedAt],
  );

  return (
    <div className="eb-shell eb-scanlines">
      <div className="eb-space-bg" aria-hidden="true" />

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Select index"
        style={{
          display: "flex",
          background: "var(--eb-bg2)",
          borderBottom: "2px solid var(--eb-border)",
        }}
        className="eb-tabrow"
      >
        {tabs.map((t) => (
          <TabButton
            key={t.key}
            active={tab === t.key}
            color={t.accent}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <Badge>{t.badge}</Badge>
          </TabButton>
        ))}
      </div>

      <main className="eb-main w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-4 overflow-x-hidden">
        <DashboardRuntimeStrip />
        {getCachedFeatures().heroCarousel !== "hide" ? (
          <AstroRegimeHeroCarousel
            niftySpot={data.nifty?.livePrice}
            bankNiftySpot={data.banknifty?.livePrice}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 10,
          }}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            style={{
              fontFamily: "var(--eb-mono)",
              fontSize: 11,
              letterSpacing: 1,
              padding: "6px 12px",
              minHeight: 32,
              borderRadius: 6,
              border: "1px solid var(--eb-border)",
              background: "transparent",
              color: "var(--eb-text)",
              cursor: "pointer",
            }}
          >
            ⚙ CUSTOMIZE DASHBOARD
          </button>
        </div>
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
            <DashboardGrid device="mobile" preferenceDevice="desktop" preferences={prefs} context={{ plan: "free" }} widgets={leftRail} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <DashboardGrid device="mobile" preferenceDevice="desktop" preferences={prefs} context={{ plan: "free" }}
                widgets={[...cprWidget, ...safeZonesWidget, ...gannWidget, ...pivotWidget, ...gannCycleWidget]} />
              <Suspense fallback={<SectionSkeleton label="Loading GTI Summary…" />}>
                <GtiSummaryCard />
              </Suspense>
            </div>
          </div>
        </DashboardDataProvider>

        <Suspense fallback={<SectionSkeleton label="Loading Crypto & Tokenized Metals…" />}>
          <section
            aria-label="Crypto and tokenized metals"
            style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--eb-muted, #94a3b8)",
              }}
            >
              Crypto & Tokenized Metals · CoinDCX
            </div>
            <DashboardGrid
              device="desktop"
              context={{ plan: "free" }}
              widgets={CRYPTO_DASHBOARD_WIDGETS}
            />
          </section>
        </Suspense>

        <Suspense fallback={null}>
          <CustomizeDashboardDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            prefs={prefs}
            onChange={updatePrefs}
            widgets={LEGACY_DASHBOARD_WIDGETS}
            device="desktop"
          />
        </Suspense>

        {import.meta.env.DEV ||
        (typeof window !== "undefined" &&
          window.localStorage?.getItem("eb-diagnostics") === "on") ? (
          <Suspense fallback={null}>
            <DashboardParityDiagnostic widgetContext={{ plan: "free" }} navContext={{}} />
          </Suspense>
        ) : null}

        <Suspense fallback={<SectionSkeleton label="Loading insights…" />}>
          <InsightsSection />
        </Suspense>

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
        overall={health.overall}
        staleCount={health.staleCount}
        unavailableCount={health.unavailableCount}
        providerStatus={health.providerStatus}
      />

      <style>{`
        .eb-shell{background:var(--eb-bg);color:var(--eb-text);font-family:var(--eb-body);min-height:100vh;}
        .eb-tabrow{overflow-x:auto;-webkit-overflow-scrolling:touch;}
        @media(max-width:820px){.eb-grid{grid-template-columns:1fr !important;}}
        .eb-tab:hover{color:var(--eb-text);}
        @media(max-width:820px){
          .eb-grid{grid-template-columns:1fr !important;}
        }
        /* AppShell header already provides brand + profile, hide duplicate brand in page header */
        .eb-header-brand{display:none !important;}
        .eb-header{padding:8px 20px !important;justify-content:space-between !important;}
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minWidth: 240,
          flex: "1 1 320px",
        }}
      >
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
        <span
          style={{
            fontSize: 13,
            color: "var(--eb-text)",
            lineHeight: 1.5,
            fontFamily: "var(--eb-body)",
          }}
        >
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
  overall,
  staleCount,
  unavailableCount,
  providerStatus,
}: {
  updatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
  quote: IndexQuote;
  overall?: FreshnessStatus;
  staleCount?: number;
  unavailableCount?: number;
  providerStatus?: ProviderStatus;
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
      {overall ? (
        <span
          aria-label={`Dashboard health ${overall}`}
          style={{ color: "var(--eb-muted)" }}
          data-eb-health
        >
          Health: {overall}
          {typeof staleCount === "number" && staleCount > 0 ? ` · ${staleCount} stale` : ""}
          {typeof unavailableCount === "number" && unavailableCount > 0
            ? ` · ${unavailableCount} unavailable`
            : ""}
          {providerStatus ? ` · Provider ${providerStatus}` : ""}
        </span>
      ) : null}
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

function DashboardRuntimeStrip() {
  const q = useRuntimeReadinessQuery();
  if (q.data) {
    return (
      <div style={{ marginBottom: 10 }}>
        <RuntimeReadinessStrip report={q.data} />
      </div>
    );
  }
  if (q.isLoading) return null;
  const reason = q.error ? q.error.message : "Runtime readiness unavailable";
  return (
    <div style={{ marginBottom: 10 }}>
      <RuntimeReadinessStripFallback reason={reason} />
    </div>
  );
}
