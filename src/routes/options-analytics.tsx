import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { useHydrated } from "@/hooks/use-hydrated";
import { getOptionsChain, type OptionsSymbol } from "@/lib/options-chain.functions";
import { getAstro } from "@/lib/astro.functions";
import { getMarketData } from "@/lib/market.functions";
import {
  atmStrike,
  classifyMoneyness,
  computePCR,
  computeMaxPain,
  confirmFocus,
  confluenceTolerance,
  interpretPcr,
  nearestAstroLevel,
  rankUnwinding,
  rankWriting,
  scoreRecommendation,
  selectOptionsLevels,
  assessDataQuality,
  type AstroLevelLite,
  type FocusSample,
  type OptionLeg,
} from "@/lib/options-analytics";
import {
  evaluateOptionsTradability,
  computeSpotDivergence,
  atmCoverage,
  safeRecommendationAction,
  exportFilename,
  isExpiryValid,
  type SourceStatus,
} from "@/lib/options-integrity";
import { nseSession } from "@/lib/terminal-clock";
import { downloadBlob } from "@/lib/download";

const C = {
  bg: "var(--eb-bg)",
  card: "var(--eb-card)",
  border: "var(--eb-border)",
  green: "var(--eb-bull)",
  red: "var(--eb-bear)",
  gold: "var(--eb-accent)",
  blue: "var(--eb-blue)",
  text: "var(--eb-text)",
  muted: "var(--eb-muted)",
};

const REFRESH_MS = 30_000;

function HydratedTime({ iso }: { iso: string | null }) {
  const hydrated = useHydrated();
  if (!iso) return <>—</>;
  if (!hydrated) return <>—</>;
  return <>{new Date(iso).toLocaleTimeString()}</>;
}

const chainQuery = (symbol: OptionsSymbol, expiry?: string, demo = false) =>
  queryOptions({
    queryKey: ["options-chain", demo ? "demo" : "live", symbol, expiry ?? "auto"],
    queryFn: () => getOptionsChain({ data: { symbol, expiry, demo } }),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

const astroQuery = () =>
  queryOptions({
    queryKey: ["astro-for-options"],
    queryFn: () => getAstro(),
    refetchInterval: 60_000,
  });

const marketQuery = () =>
  queryOptions({
    queryKey: ["market-for-options"],
    queryFn: () => getMarketData(),
    refetchInterval: REFRESH_MS,
  });

export const Route = createFileRoute("/options-analytics")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(chainQuery("NIFTY")),
      context.queryClient.ensureQueryData(astroQuery()),
      context.queryClient.ensureQueryData(marketQuery()),
    ]),
  component: OptionsAnalyticsPage,
  head: () => ({
    meta: [
      { title: "Options Analytics Terminal | EagleBABA" },
      {
        name: "description",
        content:
          "Institutional options analytics for NIFTY 50 and BANK NIFTY — OI, PCR, Max Pain, writing/unwinding, options S/R, Astro confluence and BUY CE / BUY PE / WAIT recommendation.",
      },
      { property: "og:title", content: "Options Analytics Terminal | EagleBABA" },
      {
        property: "og:description",
        content: "Live option-chain analytics with Astro level confluence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function OptionsAnalyticsPage() {
  const [symbol, setSymbol] = useState<OptionsSymbol>("NIFTY");
  const [expiry, setExpiry] = useState<string | undefined>(undefined);
  const [showMethod, setShowMethod] = useState(false);
  const [strikeSearch, setStrikeSearch] = useState("");
  const [demoMode, setDemoMode] = useState(false);

  const chainQ = useSuspenseQuery(chainQuery(symbol, expiry, demoMode));
  const astroQ = useSuspenseQuery(astroQuery());
  const marketQ = useSuspenseQuery(marketQuery());

  const { snapshot, expiries, selectedExpiry, step, degraded, errorMessage, integrity, yahooSpot } =
    chainQ.data;
  const astro = astroQ.data;
  const market = marketQ.data;

  const session = nseSession();
  const marketOpen = session.isOpen;

  const sourceStatus: SourceStatus = integrity.sourceStatus;
  const isUnavailable = sourceStatus === "UNAVAILABLE";
  const isDemo = sourceStatus === "DEMO";

  // Focus alert confirmation history (last snapshots only, in memory).
  const focusHistory = useRef<FocusSample[]>([]);
  // Reset confirmation history whenever symbol / expiry / provider / status / demo mode changes.
  const historyKey = `${symbol}::${selectedExpiry}::${snapshot.provider}::${sourceStatus}::${demoMode}`;
  const prevHistoryKey = useRef(historyKey);
  if (prevHistoryKey.current !== historyKey) {
    focusHistory.current = [];
    prevHistoryKey.current = historyKey;
  }
  useEffect(() => {
    // Only accumulate alert-confirmation samples on true LIVE snapshots during market hours.
    if (sourceStatus !== "LIVE" || !marketOpen) return;
    const pcr = computePCR(snapshot.legs);
    let cw = 0,
      pw = 0;
    for (const l of snapshot.legs) {
      if (l.changeOi > 0) {
        if (l.side === "CE") cw += l.changeOi;
        else pw += l.changeOi;
      }
    }
    focusHistory.current = [
      ...focusHistory.current.slice(-9),
      { ts: Date.now(), putWriting: pw, callWriting: cw },
    ];
    void pcr;
  }, [snapshot, sourceStatus, marketOpen]);

  const analytics = useMemo(() => {
    if (isUnavailable) {
      // No analytics on an unavailable chain.
      return null;
    }
    const legs = snapshot.legs;
    const spot = snapshot.spot;
    const atm = atmStrike(spot, snapshot.strikes);
    const pcr = computePCR(legs);
    const mp = computeMaxPain(legs);
    const levels = selectOptionsLevels(legs);
    const callWritingRows = rankWriting(legs, spot, "CE", 5);
    const putWritingRows = rankWriting(legs, spot, "PE", 5);
    const callUnwindingRows = rankUnwinding(legs, spot, "CE", 5);
    const putUnwindingRows = rankUnwinding(legs, spot, "PE", 5);
    let totalCallWriting = 0,
      totalPutWriting = 0;
    for (const l of legs) {
      if (l.changeOi > 0) {
        if (l.side === "CE") totalCallWriting += l.changeOi;
        else totalPutWriting += l.changeOi;
      }
    }
    const hiCall = [...legs.filter((l) => l.side === "CE")].sort((a, b) => b.oi - a.oi)[0];
    const hiPut = [...legs.filter((l) => l.side === "PE")].sort((a, b) => b.oi - a.oi)[0];

    // Astro levels only make sense for NIFTY; scale tolerance for BANKNIFTY.
    const astroLevels: AstroLevelLite[] = astro.planets.flatMap((p) => [
      { planet: p.planet, label: `${p.planet} R1`, value: p.r1 },
      { planet: p.planet, label: `${p.planet} S1`, value: p.s1 },
      { planet: p.planet, label: `${p.planet} R2`, value: p.r2 },
      { planet: p.planet, label: `${p.planet} S2`, value: p.s2 },
    ]);
    const tol = confluenceTolerance(symbol);
    const levelsWithConfluence = levels.map((lv) => ({
      ...lv,
      confluence: nearestAstroLevel(lv.strike, astroLevels, tol),
    }));
    const sup = levelsWithConfluence.find((l) => l.kind === "SUPPORT" && l.rank === "PRIMARY");
    const res = levelsWithConfluence.find((l) => l.kind === "RESISTANCE" && l.rank === "PRIMARY");

    const vix = market.vix?.livePrice ?? null;
    const breadthBias =
      astro.emaBias === "Bullish" ? "Bullish" : astro.emaBias === "Bearish" ? "Bearish" : "Neutral";
    const astroBias: "Bullish" | "Bearish" | "Neutral" =
      astro.bullCount > astro.bearCount + 1
        ? "Bullish"
        : astro.bearCount > astro.bullCount + 1
          ? "Bearish"
          : "Neutral";

    const dq = assessDataQuality(snapshot);
    const recommendation = scoreRecommendation({
      spot,
      atm,
      maxPain: mp.strike,
      pcrOi: pcr.pcrOi,
      pcrVolume: pcr.pcrVolume,
      pcrTrend: 0,
      callWriting: totalCallWriting,
      putWriting: totalPutWriting,
      vix,
      breadthBias,
      astroBias,
      supportConfluence: sup?.confluence?.strength ?? null,
      resistanceConfluence: res?.confluence?.strength ?? null,
      dataComplete: dq.ok,
    });

    const focus = confirmFocus(focusHistory.current);

    return {
      atm,
      pcr,
      mp,
      levelsWithConfluence,
      callWritingRows,
      putWritingRows,
      callUnwindingRows,
      putUnwindingRows,
      hiCall,
      hiPut,
      totalCallWriting,
      totalPutWriting,
      vix,
      breadthBias,
      astroBias,
      dq,
      recommendation,
      focus,
    };
    // focusHistory is a ref; safe to omit
  }, [snapshot, astro, market, symbol, isUnavailable]);

  const spotChangePct = market.nifty.changePct;
  const daysToExpiry =
    expiries.find((e) => e.expiry === selectedExpiry)?.daysToExpiry ?? 0;

  // Tradability gate — always compute so the source bar can render.
  const coverage = analytics
    ? atmCoverage(snapshot.strikes, analytics.atm)
    : { below: 0, above: 0 };
  const hasCallOi = snapshot.legs.some((l) => l.side === "CE" && Number.isFinite(l.oi));
  const hasPutOi = snapshot.legs.some((l) => l.side === "PE" && Number.isFinite(l.oi));
  const expiryValid = isExpiryValid(
    selectedExpiry,
    expiries.map((e) => e.expiry),
  );
  const tradability = evaluateOptionsTradability({
    demo: demoMode,
    sourceStatus,
    underlying: snapshot.spot || null,
    expiry: selectedExpiry || null,
    expiryValid,
    strikesBelowAtm: coverage.below,
    strikesAboveAtm: coverage.above,
    hasCallOi,
    hasPutOi,
    providerTimestampValid: Boolean(integrity.providerTimestamp),
    marketOpen,
  });

  const divergence = computeSpotDivergence(snapshot.spot || null, yahooSpot);

  const rawAction = analytics?.recommendation.action ?? "WAIT";
  const safeAction = safeRecommendationAction(rawAction, tradability, marketOpen);
  const safeConfidence =
    safeAction === "BUY_CE" || safeAction === "BUY_PE" || safeAction === "WAIT"
      ? sourceStatus === "DELAYED"
        ? Math.round((analytics?.recommendation.confidence ?? 0) * 0.5)
        : (analytics?.recommendation.confidence ?? 0)
      : 0;
  const showRealRecommendation =
    !isDemo && !isUnavailable && safeAction !== "MARKET_CLOSED" && safeAction !== "DATA_INCOMPLETE";

  const filteredLegs = useMemo(() => {
    const byStrike = new Map<number, { ce?: OptionLeg; pe?: OptionLeg }>();
    for (const l of snapshot.legs) {
      const row = byStrike.get(l.strike) ?? {};
      if (l.side === "CE") row.ce = l;
      else row.pe = l;
      byStrike.set(l.strike, row);
    }
    const search = strikeSearch.trim();
    return Array.from(byStrike.entries())
      .filter(([k]) => (search ? String(k).includes(search) : true))
      .sort((a, b) => a[0] - b[0]);
  }, [snapshot, strikeSearch]);

  const exportCsv = () => {
    if (isUnavailable) return;
    const mode: "LIVE" | "DEMO" = isDemo ? "DEMO" : "LIVE";
    const meta = [
      `# EagleBABA Options Analytics export`,
      `# instrument=${symbol}`,
      `# expiry=${selectedExpiry}`,
      `# mode=${mode}`,
      `# source_status=${sourceStatus}`,
      `# provider=${snapshot.provider}`,
      `# provider_timestamp=${integrity.providerTimestamp ?? ""}`,
      `# export_timestamp=${new Date().toISOString()}`,
      `# data_age_seconds=${integrity.dataAgeSeconds}`,
      `# warnings=${tradability.blockingReasons.concat(tradability.warnings).join("; ")}`,
    ].join("\n");
    const rows = [
      [
        "strike",
        "ce_oi",
        "ce_chg_oi",
        "ce_vol",
        "ce_ltp",
        "ce_iv",
        "pe_oi",
        "pe_chg_oi",
        "pe_vol",
        "pe_ltp",
        "pe_iv",
      ],
      ...filteredLegs.map(([k, r]) => [
        k,
        r.ce?.oi ?? "",
        r.ce?.changeOi ?? "",
        r.ce?.volume ?? "",
        r.ce?.ltp ?? "",
        r.ce?.iv ?? "",
        r.pe?.oi ?? "",
        r.pe?.changeOi ?? "",
        r.pe?.volume ?? "",
        r.pe?.ltp ?? "",
        r.pe?.iv ?? "",
      ]),
    ]
      .map((r) => r.join(","))
      .join("\n");
    downloadBlob(
      `${meta}\n${rows}`,
      exportFilename("OPTIONS", symbol, selectedExpiry, mode, "csv"),
      "text/csv",
    );
  };

  const exportJson = () => {
    if (isUnavailable) return;
    const mode: "LIVE" | "DEMO" = isDemo ? "DEMO" : "LIVE";
    downloadBlob(
      JSON.stringify(
        {
          mode,
          integrity,
          tradability,
          snapshot,
          analytics,
          exportTimestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
      exportFilename("OPTIONS", symbol, selectedExpiry, mode, "json"),
      "application/json",
    );
  };

  const recColor =
    safeAction === "BUY_CE"
      ? C.green
      : safeAction === "BUY_PE"
        ? C.red
        : safeAction === "MARKET_CLOSED"
          ? C.blue
          : safeAction === "DATA_INCOMPLETE"
            ? C.red
            : C.gold;
  const recLabel =
    safeAction === "BUY_CE"
      ? "BUY CE"
      : safeAction === "BUY_PE"
        ? "BUY PE"
        : safeAction === "MARKET_CLOSED"
          ? "MARKET CLOSED"
          : safeAction === "DATA_INCOMPLETE"
            ? "DATA INCOMPLETE"
            : isDemo
              ? "NO LIVE RECOMMENDATION"
              : "WAIT";

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "1rem" }}>
        {isDemo && <DemoBanner />}
        <SourceBar
          sourceStatus={sourceStatus}
          provider={snapshot.provider}
          providerTimestamp={integrity.providerTimestamp}
          dataAgeSeconds={integrity.dataAgeSeconds}
          expiry={selectedExpiry}
          strikeCount={integrity.strikeCount}
          spot={snapshot.spot}
          yahooSpot={yahooSpot}
          divergencePct={divergence.divergencePct}
          divergenceSevere={divergence.severe}
          cacheStatus={integrity.cacheStatus}
          lastLiveFetchAt={integrity.lastLiveFetchAt}
          marketOpen={marketOpen}
        />
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
          }}
        >
          <div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
              Options Analytics Terminal
            </div>
            <div style={{ color: C.muted, fontSize: "0.85rem" }}>
              {symbol === "NIFTY" ? "NIFTY 50" : "BANK NIFTY"} · Provider:{" "}
              {snapshot.provider} · Snapshot <HydratedTime iso={snapshot.fetchedAt} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link
              to="/"
              style={{
                padding: "0.4rem 0.75rem",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                textDecoration: "none",
                fontSize: "0.85rem",
              }}
            >
              ← Dashboard
            </Link>
            <button
              onClick={() => setDemoMode((v) => !v)}
              style={{
                padding: "0.4rem 0.75rem",
                border: `1px solid ${demoMode ? "#a855f7" : C.border}`,
                borderRadius: 6,
                background: demoMode ? "rgba(168,85,247,0.15)" : "transparent",
                color: demoMode ? "#e9d5ff" : C.text,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
              title="Demo mode uses a deterministic simulated chain. Recommendations, alerts, and live analytics are disabled."
            >
              {demoMode ? "Exit Demo" : "Demo Mode"}
            </button>
            <button
              onClick={() => setShowMethod(true)}
              style={{
                padding: "0.4rem 0.75rem",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                background: "transparent",
                color: C.text,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Methodology
            </button>
            <button
              onClick={exportCsv}
              disabled={isUnavailable}
              style={{
                padding: "0.4rem 0.75rem",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                background: "transparent",
                color: isUnavailable ? C.muted : C.text,
                cursor: isUnavailable ? "not-allowed" : "pointer",
                opacity: isUnavailable ? 0.5 : 1,
                fontSize: "0.85rem",
              }}
            >
              CSV
            </button>
            <button
              onClick={exportJson}
              disabled={isUnavailable}
              style={{
                padding: "0.4rem 0.75rem",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                background: "transparent",
                color: isUnavailable ? C.muted : C.text,
                cursor: isUnavailable ? "not-allowed" : "pointer",
                opacity: isUnavailable ? 0.5 : 1,
                fontSize: "0.85rem",
              }}
            >
              JSON
            </button>
          </div>
        </header>

        {degraded && !isUnavailable && (
          <div
            style={{
              padding: "0.75rem 1rem",
              border: `1px solid ${C.gold}`,
              background: "rgba(255,180,0,0.08)",
              borderRadius: 8,
              marginBottom: "1rem",
              fontSize: "0.85rem",
            }}
          >
            <strong style={{ color: C.gold }}>Degraded feed.</strong> {errorMessage}
          </div>
        )}

        {isUnavailable && (
          <UnavailableState
            errorMessage={errorMessage}
            onRetry={() => chainQ.refetch()}
            onEnableDemo={() => setDemoMode(true)}
            expiries={expiries}
            selectedExpiry={selectedExpiry}
            onChangeExpiry={setExpiry}
          />
        )}

        {/* Controls */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginBottom: "1rem",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: "0.25rem" }}>
            {(["NIFTY", "BANKNIFTY"] as OptionsSymbol[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSymbol(s);
                  setExpiry(undefined);
                }}
                style={{
                  padding: "0.4rem 0.75rem",
                  border: `1px solid ${symbol === s ? C.gold : C.border}`,
                  background: symbol === s ? "rgba(255,180,0,0.1)" : "transparent",
                  color: C.text,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: "0.85rem",
                }}
              >
                {s === "NIFTY" ? "NIFTY 50" : "BANK NIFTY"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
            {expiries.map((e) => (
              <button
                key={e.expiry}
                onClick={() => setExpiry(e.expiry)}
                style={{
                  padding: "0.4rem 0.6rem",
                  border: `1px solid ${e.expiry === selectedExpiry ? C.blue : C.border}`,
                  background:
                    e.expiry === selectedExpiry ? "rgba(70,130,255,0.1)" : "transparent",
                  color: C.text,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: "0.8rem",
                }}
                title={e.category}
              >
                {e.expiry} · {e.daysToExpiry}d ·{" "}
                <span style={{ color: C.muted }}>{e.category.replace("_", " ")}</span>
              </button>
            ))}
          </div>
        </div>

        {!analytics ? null : (
        <>
        {/* Summary cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <Card label="Spot" value={fmt(snapshot.spot, 2)} sub={pct(spotChangePct)} tone={spotChangePct >= 0 ? "green" : "red"} />
          <Card label="Expiry" value={selectedExpiry} sub={`${daysToExpiry} days`} />
          <Card label="ATM Strike" value={fmt(analytics.atm)} sub={`Step ${step}`} />
          <Card label="Max Pain" value={fmt(analytics.mp.strike)} sub={`Δ ${fmt(analytics.mp.strike - snapshot.spot)}`} />
          <Card label="PCR OI" value={analytics.pcr.pcrOi.toFixed(2)} sub={interpretPcr(analytics.pcr.pcrOi)} />
          <Card label="PCR Volume" value={analytics.pcr.pcrVolume.toFixed(2)} />
          <Card label="Total Call OI" value={fmt(analytics.pcr.totalCallOi)} />
          <Card label="Total Put OI" value={fmt(analytics.pcr.totalPutOi)} />
          <Card label="Highest Call OI" value={fmt(analytics.hiCall?.strike ?? 0)} tone="red" sub="Resistance" />
          <Card label="Highest Put OI" value={fmt(analytics.hiPut?.strike ?? 0)} tone="green" sub="Support" />
          <Card label="India VIX" value={analytics.vix != null ? analytics.vix.toFixed(2) : "—"} sub={analytics.vix == null ? undefined : analytics.vix < 15 ? "Low — prefer ITM" : analytics.vix <= 20 ? "Moderate — prefer ATM" : "High — prefer OTM"} />
          <Card label="Astro Bias" value={analytics.astroBias} tone={analytics.astroBias === "Bullish" ? "green" : analytics.astroBias === "Bearish" ? "red" : undefined} />
        </div>

        {/* Recommendation */}
        <div
          style={{
            padding: "1rem",
            border: `1px solid ${recColor}`,
            borderRadius: 10,
            background: `linear-gradient(180deg, ${recColor}18, transparent)`,
            marginBottom: "1rem",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.8rem", color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
                Recommendation
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: recColor }}>
                {recLabel}
              </div>
              <div style={{ fontSize: "0.85rem", color: C.muted }}>
                {showRealRecommendation
                  ? `Confidence ${safeConfidence}%${sourceStatus === "DELAYED" ? " (delayed-data penalty applied)" : ""}`
                  : isDemo
                    ? "Demo mode — live recommendations disabled"
                    : safeAction === "MARKET_CLOSED"
                      ? "Market closed — showing previous-session snapshot"
                      : "Analytics paused until data integrity is restored"}
              </div>
            </div>
            {analytics.focus && sourceStatus === "LIVE" && marketOpen && !isDemo && (
              <div
                style={{
                  padding: "0.5rem 1rem",
                  border: `1px solid ${analytics.focus === "FOCUS_CALL" ? C.green : C.red}`,
                  borderRadius: 8,
                  color: analytics.focus === "FOCUS_CALL" ? C.green : C.red,
                  fontWeight: 700,
                  animation: "pulse 1.5s infinite",
                }}
              >
                {analytics.focus === "FOCUS_CALL" ? "🟢 FOCUS ON CALL" : "🔴 FOCUS ON PUT"}
              </div>
            )}
          </div>
          {(tradability.blockingReasons.length > 0 || tradability.warnings.length > 0) && (
            <ul
              style={{
                margin: "0.75rem 0 0",
                paddingLeft: "1.25rem",
                color: tradability.blockingReasons.length > 0 ? C.red : C.gold,
                fontSize: "0.8rem",
              }}
            >
              {tradability.blockingReasons.map((r) => (
                <li key={`b-${r}`}>Blocking: {r}</li>
              ))}
              {tradability.warnings.map((r) => (
                <li key={`w-${r}`}>Warning: {r}</li>
              ))}
            </ul>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.5rem",
              marginTop: "0.75rem",
            }}
          >
            {(showRealRecommendation ? analytics.recommendation.scores : []).map((s) => (
              <div
                key={s.label}
                style={{
                  padding: "0.5rem 0.75rem",
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  fontSize: "0.8rem",
                }}
              >
                <div style={{ color: C.muted }}>{s.label}</div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: 2 }}>
                  <span style={{ color: C.green }}>CE {s.ce}</span>
                  <span style={{ color: C.red }}>PE {s.pe}</span>
                </div>
                <div style={{ color: C.muted, fontSize: "0.72rem", marginTop: 2 }}>{s.note}</div>
              </div>
            ))}
          </div>
          {showRealRecommendation && analytics.recommendation.reasons.length > 0 && (
            <ul
              style={{
                margin: "0.75rem 0 0",
                paddingLeft: "1.25rem",
                color: C.muted,
                fontSize: "0.82rem",
              }}
            >
              {analytics.recommendation.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Options S/R + Confluence */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          {analytics.levelsWithConfluence.map((lv) => (
            <div
              key={`${lv.kind}-${lv.rank}`}
              style={{
                padding: "0.75rem",
                background: C.card,
                border: `1px solid ${lv.kind === "RESISTANCE" ? C.red : C.green}`,
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 700 }}>
                  {lv.rank === "PRIMARY" ? "Primary" : "Secondary"} {lv.kind === "RESISTANCE" ? "Resistance" : "Support"}
                </div>
                <div style={{ color: lv.kind === "RESISTANCE" ? C.red : C.green, fontWeight: 700 }}>
                  {fmt(lv.strike)}
                </div>
              </div>
              <div style={{ color: C.muted, fontSize: "0.8rem", marginTop: 4 }}>
                OI {fmt(lv.oi)} · ΔOI {fmt(lv.changeOi)}
              </div>
              {lv.confluence && (
                <div style={{ fontSize: "0.8rem", marginTop: 6 }}>
                  Astro: {lv.confluence.level.label} ({fmt(lv.confluence.level.value)}) · Δ {fmt(lv.confluence.distance, 1)}
                  <span
                    style={{
                      marginLeft: 8,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background:
                        lv.confluence.strength === "VERY_STRONG"
                          ? C.gold
                          : lv.confluence.strength === "STRONG"
                            ? C.blue
                            : C.border,
                      color: "#000",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                    }}
                  >
                    {lv.confluence.strength.replace("_", " ")}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Writing / Unwinding */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <MatrixPanel title="Strongest Call Writing" rows={analytics.callWritingRows} tone="red" />
          <MatrixPanel title="Strongest Put Writing" rows={analytics.putWritingRows} tone="green" />
          <MatrixPanel title="Strongest Call Unwinding" rows={analytics.callUnwindingRows} tone="green" />
          <MatrixPanel title="Strongest Put Unwinding" rows={analytics.putUnwindingRows} tone="red" />
        </div>

        {/* Option chain table */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
            <div style={{ fontWeight: 700 }}>Option Chain</div>
            <input
              type="search"
              placeholder="Filter strike…"
              value={strikeSearch}
              onChange={(e) => setStrikeSearch(e.target.value)}
              style={{
                padding: "0.35rem 0.5rem",
                borderRadius: 6,
                background: C.card,
                border: `1px solid ${C.border}`,
                color: C.text,
                fontSize: "0.8rem",
              }}
            />
            <div style={{ color: C.muted, fontSize: "0.75rem" }}>
              {filteredLegs.length} strikes
            </div>
          </div>
          <div
            style={{
              overflowX: "auto",
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              background: C.card,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead style={{ position: "sticky", top: 0, background: C.card }}>
                <tr style={{ color: C.muted }}>
                  <th style={cellStyle("right")}>CE OI</th>
                  <th style={cellStyle("right")}>CE ΔOI</th>
                  <th style={cellStyle("right")}>CE Vol</th>
                  <th style={cellStyle("right")}>CE IV</th>
                  <th style={cellStyle("right")}>CE LTP</th>
                  <th style={{ ...cellStyle("center"), background: C.card, fontWeight: 700 }}>Strike</th>
                  <th style={cellStyle("right")}>PE LTP</th>
                  <th style={cellStyle("right")}>PE IV</th>
                  <th style={cellStyle("right")}>PE Vol</th>
                  <th style={cellStyle("right")}>PE ΔOI</th>
                  <th style={cellStyle("right")}>PE OI</th>
                </tr>
              </thead>
              <tbody>
                {filteredLegs.map(([k, row]) => {
                  const isAtm = k === analytics.atm;
                  const ceMon = classifyMoneyness(k, snapshot.spot, "CE", step);
                  const peMon = classifyMoneyness(k, snapshot.spot, "PE", step);
                  return (
                    <tr
                      key={k}
                      style={{
                        background: isAtm ? "rgba(255,180,0,0.08)" : "transparent",
                        borderTop: `1px solid ${C.border}`,
                      }}
                    >
                      <td style={{ ...cellStyle("right"), background: ceMon === "ITM" ? "rgba(60,150,90,0.10)" : "transparent" }}>{fmt(row.ce?.oi ?? 0)}</td>
                      <td style={{ ...cellStyle("right"), color: (row.ce?.changeOi ?? 0) >= 0 ? C.green : C.red }}>
                        {fmt(row.ce?.changeOi ?? 0)}
                      </td>
                      <td style={cellStyle("right")}>{fmt(row.ce?.volume ?? 0)}</td>
                      <td style={cellStyle("right")}>{row.ce?.iv != null ? row.ce.iv.toFixed(2) : "—"}</td>
                      <td style={cellStyle("right")}>{fmt(row.ce?.ltp ?? 0, 2)}</td>
                      <td style={{ ...cellStyle("center"), fontWeight: isAtm ? 800 : 600, color: isAtm ? C.gold : C.text }}>
                        {fmt(k)}
                        <div style={{ fontSize: "0.65rem", color: C.muted }}>
                          {ceMon}/{peMon}
                        </div>
                      </td>
                      <td style={cellStyle("right")}>{fmt(row.pe?.ltp ?? 0, 2)}</td>
                      <td style={cellStyle("right")}>{row.pe?.iv != null ? row.pe.iv.toFixed(2) : "—"}</td>
                      <td style={cellStyle("right")}>{fmt(row.pe?.volume ?? 0)}</td>
                      <td style={{ ...cellStyle("right"), color: (row.pe?.changeOi ?? 0) >= 0 ? C.green : C.red }}>
                        {fmt(row.pe?.changeOi ?? 0)}
                      </td>
                      <td style={{ ...cellStyle("right"), background: peMon === "ITM" ? "rgba(60,150,90,0.10)" : "transparent" }}>{fmt(row.pe?.oi ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Data quality */}
        <div
          style={{
            padding: "0.75rem 1rem",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            background: C.card,
            fontSize: "0.8rem",
            color: C.muted,
            marginBottom: "1rem",
          }}
        >
          Provider: <strong style={{ color: C.text }}>{snapshot.provider}</strong> · Source:{" "}
          <strong style={{ color: sourceStatus === "LIVE" ? C.green : sourceStatus === "DEMO" ? "#a855f7" : C.gold }}>
            {sourceStatus}
          </strong>{" "}
          · Strikes: {analytics.dq.strikesLoaded} · IV:{" "}
          {analytics.dq.hasIv ? "available" : "unavailable"} · Greeks: not provided · Data
          age: {analytics.dq.ageSeconds}s · Missing: {analytics.dq.missingFields.length || "none"}
        </div>
        </>
        )}

        <div style={{ fontSize: "0.75rem", color: C.muted }}>
          Options analytics are derived from available market data and may be delayed or incomplete. OI,
          IV, Greeks, Max Pain, and directional signals are analytical estimates, not guaranteed
          outcomes.
        </div>

        {showMethod && <MethodologyDrawer onClose={() => setShowMethod(false)} />}
      </div>
      {isDemo && <DemoWatermark />}
    </div>
  );
}

function cellStyle(align: "left" | "center" | "right"): React.CSSProperties {
  return {
    padding: "0.35rem 0.5rem",
    textAlign: align,
    whiteSpace: "nowrap",
  };
}

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "green" | "red";
}) {
  return (
    <div
      style={{
        padding: "0.6rem 0.75rem",
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
      }}
    >
      <div style={{ color: C.muted, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: "1.05rem", fontWeight: 700, color: tone === "green" ? C.green : tone === "red" ? C.red : C.text }}>
        {value}
      </div>
      {sub && <div style={{ color: C.muted, fontSize: "0.75rem" }}>{sub}</div>}
    </div>
  );
}

function MatrixPanel({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { strike: number; changeOi: number; oi: number; distance: number }[];
  tone: "green" | "red";
}) {
  return (
    <div
      style={{
        padding: "0.6rem 0.75rem",
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: tone === "green" ? C.green : C.red }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <div style={{ color: C.muted, fontSize: "0.8rem" }}>No signal in current snapshot.</div>
      ) : (
        <table style={{ width: "100%", fontSize: "0.78rem" }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.strike}>
                <td style={{ padding: "2px 0", fontWeight: 600 }}>{r.strike.toLocaleString("en-IN")}</td>
                <td style={{ padding: "2px 0", textAlign: "right", color: r.changeOi >= 0 ? C.green : C.red }}>
                  {r.changeOi >= 0 ? "+" : ""}
                  {r.changeOi.toLocaleString("en-IN")}
                </td>
                <td style={{ padding: "2px 0", textAlign: "right", color: C.muted }}>
                  OI {r.oi.toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MethodologyDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(500px, 100vw)",
          height: "100vh",
          background: C.bg,
          borderLeft: `1px solid ${C.border}`,
          padding: "1.25rem",
          overflowY: "auto",
          color: C.text,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>Methodology</div>
          <button onClick={onClose} style={{ background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "0.25rem 0.6rem", cursor: "pointer" }}>
            Close
          </button>
        </div>
        <div style={{ fontSize: "0.85rem", lineHeight: 1.55, color: C.muted }}>
          <p><strong style={{ color: C.text }}>Data source.</strong> Live options provider chain when reachable; a clearly-labelled deterministic SIMULATED chain built around the reference spot when the live options provider is unavailable.</p>
          <p><strong style={{ color: C.text }}>Update frequency.</strong> 30-second cache, shared via the global scheduler.</p>
          <p><strong style={{ color: C.text }}>PCR.</strong> PCR OI = Σ Put OI / Σ Call OI; PCR Volume = Σ Put Volume / Σ Call Volume. Interpretation thresholds default to bullish ≥ 1.1 and bearish ≤ 0.85 and are configurable per instrument.</p>
          <p><strong style={{ color: C.text }}>Max Pain.</strong> Strike minimising Σ CE.oi · max(K − s, 0) + Σ PE.oi · max(s − K, 0), across the current chain.</p>
          <p><strong style={{ color: C.text }}>Build-up.</strong> Price↑ & OI↑ = long buildup; Price↓ & OI↑ = short buildup / writing; Price↑ & OI↓ = short covering; Price↓ & OI↓ = long unwinding. Requires a previous snapshot.</p>
          <p><strong style={{ color: C.text }}>Writing / unwinding.</strong> Ranked by change-in-OI; positive = writing, negative = unwinding.</p>
          <p><strong style={{ color: C.text }}>Options S/R.</strong> Primary = highest OI strike; secondary = highest OI-addition strike. Puts → support, Calls → resistance.</p>
          <p><strong style={{ color: C.text }}>Astro confluence.</strong> Distance from the options-derived level to the nearest EagleBaba Astro Level. Bands: ≤ tol very strong, ≤ 2·tol strong, ≤ 4·tol moderate, else weak. Tolerance is 5 pts for NIFTY, 20 pts for BANK NIFTY.</p>
          <p><strong style={{ color: C.text }}>Recommendation.</strong> Transparent weighted score of six components: options OI structure vs Max Pain, PCR, writing/unwinding balance, market breadth, VIX preference (informational), and astro confluence. Confidence = winning-side score / max score. WAIT when data is incomplete or the two sides tie within ±2 points.</p>
          <p><strong style={{ color: C.text }}>Greeks and IV.</strong> Provider values are used verbatim after validation. When the provider does not supply a value it is displayed as "—". Greeks and IV are never fabricated.</p>
          <p><strong style={{ color: C.text }}>Limitations.</strong> Simulated fallback is directional-shape only and must not be traded from. When NSE feed access is unavailable the "SIMULATED" badge and top banner make this explicit.</p>
        </div>
      </div>
    </div>
  );
}
/* ------------------------- Phase 16.1 helpers ------------------------- */

function DemoBanner() {
  return (
    <div
      style={{
        padding: "0.6rem 1rem",
        background: "linear-gradient(90deg, rgba(168,85,247,0.25), rgba(168,85,247,0.10))",
        border: "1px solid #a855f7",
        borderRadius: 8,
        color: "#e9d5ff",
        fontWeight: 700,
        letterSpacing: 0.5,
        textAlign: "center",
        marginBottom: "0.75rem",
        fontSize: "0.9rem",
      }}
    >
      ⚠ DEMO DATA — NOT LIVE MARKET DATA. Recommendations, alerts and exports are disabled or watermarked.
    </div>
  );
}

function DemoWatermark() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        background:
          "repeating-linear-gradient(45deg, transparent 0 120px, rgba(168,85,247,0.05) 120px 240px)",
        zIndex: 1,
      }}
    />
  );
}

function statusTone(status: SourceStatus): { color: string; bg: string; label: string } {
  switch (status) {
    case "LIVE":
      return { color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "LIVE" };
    case "DELAYED":
      return { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "DELAYED" };
    case "STALE":
      return { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "STALE" };
    case "PARTIAL":
      return { color: "#f97316", bg: "rgba(249,115,22,0.12)", label: "PARTIAL" };
    case "UNAVAILABLE":
      return { color: "#ef4444", bg: "rgba(239,68,68,0.18)", label: "UNAVAILABLE" };
    case "DEMO":
      return { color: "#a855f7", bg: "rgba(168,85,247,0.15)", label: "DEMO" };
  }
}

function SourceBar(props: {
  sourceStatus: SourceStatus;
  provider: string;
  providerTimestamp: string | null;
  dataAgeSeconds: number;
  expiry: string;
  strikeCount: number;
  spot: number;
  yahooSpot: number | null;
  divergencePct: number;
  divergenceSevere: boolean;
  cacheStatus: string;
  lastLiveFetchAt: string | null;
  marketOpen: boolean;
}) {
  const tone = statusTone(props.sourceStatus);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.75rem",
        alignItems: "center",
        padding: "0.55rem 0.85rem",
        border: `1px solid ${tone.color}`,
        background: tone.bg,
        borderRadius: 8,
        marginBottom: "0.75rem",
        fontSize: "0.78rem",
        color: C.text,
      }}
    >
      <span
        style={{
          padding: "0.15rem 0.5rem",
          borderRadius: 4,
          background: tone.color,
          color: "#000",
          fontWeight: 800,
          letterSpacing: 0.5,
        }}
      >
        {tone.label}
      </span>
      <span>
        <span style={{ color: C.muted }}>Provider </span>
        <strong>{props.provider}</strong>
      </span>
      <span>
        <span style={{ color: C.muted }}>Age </span>
        <strong>{props.dataAgeSeconds}s</strong>
      </span>
      <span>
        <span style={{ color: C.muted }}>Expiry </span>
        <strong>{props.expiry || "—"}</strong>
      </span>
      <span>
        <span style={{ color: C.muted }}>Strikes </span>
        <strong>{props.strikeCount}</strong>
      </span>
      <span>
        <span style={{ color: C.muted }}>Spot </span>
        <strong>{props.spot ? props.spot.toFixed(2) : "—"}</strong>
        {props.yahooSpot != null && (
          <span style={{ color: C.muted }}>
            {" "}
            / Ref <strong style={{ color: C.text }}>{props.yahooSpot.toFixed(2)}</strong>
            {" · Δ "}
            <strong style={{ color: props.divergenceSevere ? "#ef4444" : C.text }}>
              {props.divergencePct.toFixed(2)}%
            </strong>
            {props.divergenceSevere && (
              <span style={{ color: "#ef4444", marginLeft: 4 }}>SOURCE MISMATCH</span>
            )}
          </span>
        )}
      </span>
      <span>
        <span style={{ color: C.muted }}>Cache </span>
        <strong>{props.cacheStatus}</strong>
      </span>
      <span>
        <span style={{ color: C.muted }}>Last live </span>
        <strong>
          <HydratedTime iso={props.lastLiveFetchAt} />
        </strong>
      </span>
      <span style={{ marginLeft: "auto", color: props.marketOpen ? "#22c55e" : C.muted }}>
        {props.marketOpen ? "Market Open" : "Market Closed"}
      </span>
    </div>
  );
}

function UnavailableState(props: {
  errorMessage: string | null;
  onRetry: () => void;
  onEnableDemo: () => void;
  expiries: { expiry: string; category: string; daysToExpiry: number }[];
  selectedExpiry: string;
  onChangeExpiry: (e: string) => void;
}) {
  return (
    <div
      style={{
        padding: "1rem 1.25rem",
        border: `1px dashed ${C.red}`,
        background: "rgba(239,68,68,0.06)",
        borderRadius: 10,
        marginBottom: "1rem",
      }}
    >
      <div style={{ fontWeight: 800, color: C.red, fontSize: "1.05rem", marginBottom: 4 }}>
        DATA UNAVAILABLE — WAIT
      </div>
      <div style={{ color: C.muted, fontSize: "0.85rem", marginBottom: "0.6rem" }}>
        Live option-chain data is currently unavailable. Analytics and directional recommendations
        have been paused to prevent misleading output.
      </div>
      {props.errorMessage && (
        <div style={{ color: C.muted, fontSize: "0.78rem", marginBottom: "0.6rem" }}>
          {props.errorMessage}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button
          onClick={props.onRetry}
          style={{
            padding: "0.4rem 0.75rem",
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            background: "transparent",
            color: C.text,
            cursor: "pointer",
            fontSize: "0.82rem",
          }}
        >
          Retry
        </button>
        <button
          onClick={props.onEnableDemo}
          style={{
            padding: "0.4rem 0.75rem",
            border: "1px solid #a855f7",
            borderRadius: 6,
            background: "rgba(168,85,247,0.1)",
            color: "#e9d5ff",
            cursor: "pointer",
            fontSize: "0.82rem",
          }}
        >
          Open Demo Mode
        </button>
        {props.expiries.map((e) => (
          <button
            key={e.expiry}
            onClick={() => props.onChangeExpiry(e.expiry)}
            style={{
              padding: "0.4rem 0.6rem",
              border: `1px solid ${e.expiry === props.selectedExpiry ? C.blue : C.border}`,
              borderRadius: 6,
              background: "transparent",
              color: C.text,
              cursor: "pointer",
              fontSize: "0.78rem",
            }}
          >
            {e.expiry}
          </button>
        ))}
      </div>
    </div>
  );
}
