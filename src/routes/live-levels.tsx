import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { getLiveLevels, type LiveLevelsData, type MarketBlock, type MarketPlanet, type MarketKey } from "@/lib/live-levels.functions";
import { buildLevelBoard, computeSignal } from "@/lib/astro-levels";
import { Disclaimer } from "@/components/Disclaimer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppSidebar } from "@/components/AppSidebar";
import { ApexChart } from "@/components/ApexChart";
import { NewsCenter } from "@/components/NewsPopup";
import { Bell, X, Download, Printer, FileSpreadsheet, FileText, Radio, Volume2, VolumeX } from "lucide-react";
import logoUrl from "@/assets/eaglebaba-logo.png";
import { useIstClock } from "@/hooks/use-scheduler";
import { PLANET_STYLE, orbStyle } from "@/lib/planet-style";
import { downloadBlob } from "@/lib/download";
import { inrRound, usdLike } from "@/lib/format";
import type { LevelStatus, Lvl } from "@/types/levels";
import { buildLevels } from "@/lib/level-engine";
import { FormulaBadge } from "@/components/FormulaBadge";
import { astroFormulaSlug, DEFAULT_ASTRO_FORMULA_VERSION, type AstroFormulaVersion } from "@/lib/engine-version";

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

const REFRESH_MS = 60_000;

const levelsQuery = () =>
  queryOptions({
    queryKey: ["live-levels"],
    queryFn: () => getLiveLevels(),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/live-levels")({
  loader: ({ context }) => context.queryClient.ensureQueryData(levelsQuery()),
  component: LiveLevelsTerminal,
  head: () => ({
    meta: [
      { title: "Live Astro Level Terminal | EagleBABA" },
      {
        name: "description",
        content:
          "Institutional-grade live Astro support/resistance terminal for NIFTY 50, BANK NIFTY, GOLD, SILVER and BTC — auto-updating R1/R2/R3 & S1/S2/S3 levels, nearest-level detection and BUY/SELL/WAIT signals refreshed every minute.",
      },
      { property: "og:title", content: "Live Astro Level Terminal | EagleBABA" },
      {
        property: "og:description",
        content: "Real-time Astro support/resistance levels for NIFTY, BANK NIFTY, GOLD, SILVER and BTC.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 40, color: C.red }}>
      <p style={{ fontFamily: "var(--eb-mono)" }}>Terminal data unavailable: {error.message}</p>
      <Link to="/astro" style={{ color: C.blue }}>← Back to Astro dashboard</Link>
    </div>
  ),
  notFoundComponent: () => (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 40, color: C.muted }}>
      <p style={{ fontFamily: "var(--eb-mono)" }}>Terminal not found.</p>
      <Link to="/" style={{ color: C.blue }}>← Back to dashboard</Link>
    </div>
  ),
});

/* ------------------------------ constants ------------------------------ */

/* ------------------------------ helpers ------------------------------ */

// Tolerance scales with instrument price so gold/silver/btc get sensible bands.
function tolFor(price: number): number {
  if (price >= 20000) return Math.max(50, price * 0.0015); // BTC
  if (price >= 2000) return 8; // gold / bank nifty
  if (price >= 100) return 5; // silver-ish
  return 2;
}

function makeFmt(m: MarketBlock) {
  const inr = m.currency === "₹";
  return (n: number) => m.currency + (inr ? inrRound(n) : usdLike(n));
}

const STATUS_COLOR: Record<LevelStatus, string> = {
  ACTIVE: C.blue,
  TOUCHED: C.gold,
  BROKEN: C.green,
  REJECTED: "#f97316",
  PENDING: C.muted,
};

function buildLvls(planets: MarketPlanet[], price: number, tol: number): Lvl[] {
  return buildLevels(planets, price, tol);
}

/* ------------------------------ exports ------------------------------ */

const EXPORT_COLS = ["Planet", "Degree", "Sign", "Nakshatra", "Motion", "R1", "R2", "R3", "S1", "S2", "S3"];
const exportRow = (p: MarketPlanet) =>
  [p.planet, p.degree, p.sign, p.nakshatra, p.motion, p.r1, p.r2, p.r3, p.s1, p.s2, p.s3];

function exportCsv(m: MarketBlock, version: AstroFormulaVersion = DEFAULT_ASTRO_FORMULA_VERSION) {
  const slug = astroFormulaSlug(version);
  const rows = m.planets.map((p) => exportRow(p).join(","));
  downloadBlob(
    [`# EagleBABA Live Levels · ${version} · R3/S3 = EagleBaba Extended`, EXPORT_COLS.join(","), ...rows].join("\n"),
    `${m.key}-astro-levels-${slug}.csv`,
    "text/csv",
  );
}
function exportExcel(m: MarketBlock, version: AstroFormulaVersion = DEFAULT_ASTRO_FORMULA_VERSION) {
  const slug = astroFormulaSlug(version);
  const cells = (arr: (string | number)[]) => arr.map((c) => `<td>${c}</td>`).join("");
  const head = "<tr>" + cells(EXPORT_COLS) + "</tr>";
  const body = m.planets.map((p) => "<tr>" + cells(exportRow(p)) + "</tr>").join("");
  downloadBlob(
    `<html><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`,
    `${m.key}-astro-levels-${slug}.xls`,
    "application/vnd.ms-excel",
  );
}

/* ------------------------------ component ------------------------------ */

function LiveLevelsTerminal() {
  const { data, isFetching, dataUpdatedAt } = useSuspenseQuery(levelsQuery());
  const clock = useIstClock();
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<MarketKey>("NIFTY");
  const [selected, setSelected] = useState<MarketPlanet | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [sound, setSound] = useState(false);
  const [alerts, setAlerts] = useState<{ id: string; text: string; tone: "up" | "down" | "info"; at: string }[]>([]);
  const prevRef = useRef<LiveLevelsData | null>(null);

  useEffect(() => {
    setMounted(true);
    const savedTab = typeof localStorage !== "undefined" ? localStorage.getItem("eb-ll-tab") : null;
    if (savedTab) setActive(savedTab as MarketKey);
    const savedSound = typeof localStorage !== "undefined" ? localStorage.getItem("eb-ll-sound") : null;
    if (savedSound === "1") setSound(true);
  }, []);

  useEffect(() => {
    if (typeof localStorage !== "undefined") localStorage.setItem("eb-ll-tab", active);
  }, [active]);
  useEffect(() => {
    if (typeof localStorage !== "undefined") localStorage.setItem("eb-ll-sound", sound ? "1" : "0");
  }, [sound]);

  const market = useMemo(
    () => data.markets.find((m) => m.key === active) ?? data.markets[0],
    [data.markets, active],
  );

  const tol = useMemo(() => tolFor(market.livePrice), [market.livePrice]);
  const fmt = useMemo(() => makeFmt(market), [market]);

  const lvls = useMemo(() => buildLvls(market.planets, market.livePrice, tol), [market.planets, market.livePrice, tol]);
  const sorted = useMemo(() => [...lvls].sort((a, b) => a.distance - b.distance), [lvls]);

  // Reuse existing signal engine (unchanged trading logic).
  const signal = useMemo(() => {
    const board = buildLevelBoard(market.planets, market.livePrice);
    return computeSignal({
      price: market.livePrice,
      board,
      moonNakshatra: data.moonNakshatra,
      retroCount: data.retroCount,
      totalPlanets: market.planets.length,
      bullRetroCount: data.bullRetroCount,
      bearRetroCount: data.bearRetroCount,
    });
  }, [market, data]);

  const nearest = sorted[0] ?? null;
  const nearestSupport = useMemo(() => sorted.find((l) => !l.isResistance) ?? null, [sorted]);
  const nearestResistance = useMemo(() => sorted.find((l) => l.isResistance) ?? null, [sorted]);

  const bias = signal.confidence >= 60 ? "Bullish" : signal.confidence <= 40 ? "Bearish" : "Neutral";
  const biasColor = bias === "Bullish" ? C.green : bias === "Bearish" ? C.red : C.gold;
  const signalColor = signal.signal === "BUY" ? C.green : signal.signal === "SELL" ? C.red : C.gold;

  const pricePosition = nearestResistance && market.livePrice > nearestResistance.value
    ? "Above Resistance"
    : nearestSupport && market.livePrice < nearestSupport.value
      ? "Below Support"
      : "Inside Range";

  const lastUpdated = new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kolkata" });

  // Alert engine — diff current snapshot vs previous (across the active market).
  useEffect(() => {
    const prev = prevRef.current;
    if (prev) {
      const fresh: typeof alerts = [];
      const at = new Date(data.asOf).toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kolkata" });
      const push = (text: string, tone: "up" | "down" | "info") =>
        fresh.push({ id: `${text}-${data.asOf}`, text, tone, at });

      if (prev.moonNakshatra !== data.moonNakshatra)
        push(`🌙 Moon entered ${data.moonNakshatra} nakshatra`, "info");

      for (const p of data.planets) {
        const old = prev.planets.find((x) => x.planet === p.planet);
        if (!old) continue;
        if (old.sign !== p.sign) push(`${p.planet} changed sign → ${p.sign}`, "info");
        if (!old.retro && p.retro) push(`${p.planet} started Retrograde (R)`, "down");
        if (old.retro && !p.retro) push(`${p.planet} ended Retrograde (Direct)`, "up");
      }

      const oldMarket = prev.markets.find((m) => m.key === market.key);
      if (oldMarket) {
        const prevLvls = buildLvls(oldMarket.planets, oldMarket.livePrice, tolFor(oldMarket.livePrice));
        for (const l of lvls) {
          const old = prevLvls.find((x) => x.planet === l.planet && x.kind === l.kind);
          if (!old) continue;
          if (old.status !== "TOUCHED" && l.status === "TOUCHED")
            push(`${market.name}: price touched ${l.planet} ${l.kind} (${fmt(l.value)})`, "info");
          if (old.status !== "BROKEN" && l.status === "BROKEN")
            push(`${market.name}: price broke ${l.planet} ${l.kind} (${fmt(l.value)})`, l.isResistance ? "up" : "down");
        }
      }

      if (fresh.length) {
        setAlerts((a) => [...fresh, ...a].slice(0, 40));
        if (sound && typeof window !== "undefined") {
          try {
            const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (AC) {
              const ctx = new AC();
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.frequency.value = 880;
              g.gain.value = 0.05;
              o.connect(g); g.connect(ctx.destination);
              o.start();
              setTimeout(() => { o.stop(); ctx.close(); }, 160);
            }
          } catch { /* ignore */ }
        }
      }
    }
    prevRef.current = data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.asOf]);

  const unread = alerts.length;

  if (!mounted) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.text }}>📡 Live Astro Level Terminal</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>Connecting to live planetary & multi-market feed…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--eb-head, system-ui, sans-serif)" }}>
      <div className="eb-space-bg" aria-hidden="true" />
      <style>{`
        .ll-grid { display:grid; gap:12px; }
        .ll-mono { font-family:var(--eb-mono, ui-monospace, monospace); }
        .ll-table { width:100%; border-collapse:collapse; font-size:12.5px; }
        .ll-table th { text-align:left; color:var(--eb-muted); font-weight:600; font-size:10.5px; text-transform:uppercase; letter-spacing:.5px; padding:9px 10px; border-bottom:1px solid var(--eb-border); position:sticky; top:0; background:var(--eb-card); z-index:1; }
        .ll-table td { padding:9px 10px; border-bottom:1px solid var(--eb-border); white-space:nowrap; }
        .ll-table tbody tr { cursor:pointer; transition:background .15s; }
        .ll-table tbody tr:hover { background:color-mix(in srgb, var(--eb-accent) 8%, transparent); }
        .ll-row-near { background:color-mix(in srgb, var(--eb-blue) 12%, transparent) !important; box-shadow: inset 3px 0 0 var(--eb-blue); }
        @keyframes llPulse { 0%,100%{opacity:1;box-shadow:0 0 8px var(--orb-glow,rgba(168,85,247,.6))} 50%{opacity:.6;box-shadow:0 0 18px rgba(168,85,247,.9)} }
        .ll-retro { animation: llPulse 1.1s infinite; }
        .ll-live-dot { width:8px;height:8px;border-radius:50%;background:var(--eb-bull);box-shadow:0 0 8px var(--eb-bull);animation:llPulse 1.4s infinite;display:inline-block }
        .ll-tabs { display:flex; gap:8px; flex-wrap:wrap; }
        .ll-tab { position:relative; background:transparent; border:1px solid var(--eb-border); color:var(--eb-muted); padding:9px 18px; border-radius:12px; font-size:13px; font-weight:700; letter-spacing:.4px; cursor:pointer; transition:all .18s; display:flex; align-items:center; gap:8px; }
        .ll-tab:hover { border-color:var(--eb-accent); color:var(--eb-text); transform:translateY(-1px); }
        .ll-tab.is-active { border-color:var(--eb-accent); color:#000; background:var(--eb-gold-grad, var(--eb-accent)); box-shadow:0 6px 18px rgba(212,175,55,.28); }
        @media print { .no-print { display:none !important; } body { background:#fff !important; } }
        @media (max-width:820px){ .ll-drawer{ width:100% !important; } }
      `}</style>

      <div style={{ maxWidth: 1520, margin: "0 auto", padding: "18px 16px 48px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src={logoUrl} alt="EagleBABA logo" width={52} height={52} style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", boxShadow: "0 0 16px rgba(212,175,55,0.35)" }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 10 }}>
                Live Astro Level Terminal
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: C.green, border: `1px solid ${C.green}`, borderRadius: 20, padding: "2px 10px" }}>
                  <span className="ll-live-dot" /> LIVE
                </span>
              </h1>
              <div style={{ fontSize: 12, color: C.muted }}>
                NIFTY · BANK NIFTY · GOLD · SILVER · BTC · Asia/Kolkata · auto-refresh 60s
              </div>
              <div style={{ marginTop: 6 }}>
                <FormulaBadge version={data.formulaVersion} extended compact />
              </div>
            </div>
          </div>
          <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="ll-mono" style={{ fontSize: 13, color: C.muted }}>IST {clock}</span>
            <button onClick={() => setSound((s) => !s)} title={sound ? "Sound on" : "Sound off"} style={{ ...ghost(sound ? C.gold : C.muted), padding: "6px 9px" }}>
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button onClick={() => setShowAlerts((s) => !s)} title="Alerts" style={{ ...ghost(C.gold), position: "relative", padding: "6px 9px" }}>
              <Bell size={16} />
              {unread > 0 ? <span style={{ position: "absolute", top: -6, right: -6, background: C.red, color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 20, padding: "1px 5px" }}>{unread}</span> : null}
            </button>
            <Link to="/live-terminal" style={{ fontSize: 12, color: C.blue, textDecoration: "none", border: `1px solid ${C.border}`, padding: "5px 10px", borderRadius: 8 }}>Planet Terminal</Link>
            <Link to="/absolute-intraday" style={{ fontSize: 12, color: C.gold, textDecoration: "none", border: `1px solid ${C.gold}`, padding: "5px 10px", borderRadius: 8 }} title="Preview: Absolute-Degree Intraday v1 (paid-course methodology)">Absolute · Preview</Link>
            <NewsCenter />
            <ThemeToggle />
          </div>
        </div>

        {/* Market tabs */}
        <div className="ll-tabs no-print" style={{ marginBottom: 16 }}>
          {data.markets.map((m) => {
            const up = m.change >= 0;
            return (
              <button key={m.key} className={`ll-tab${m.key === active ? " is-active" : ""}`} onClick={() => setActive(m.key)}>
                {m.name}
                <span className="ll-mono" style={{ fontSize: 11, fontWeight: 700, color: m.key === active ? "#000" : up ? C.green : C.red }}>
                  {up ? "▲" : "▼"}{Math.abs(m.changePct).toFixed(2)}%
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <AppSidebar />
          <main style={{ flex: 1, minWidth: 0 }}>

            {isFetching ? (
              <div className="no-print ll-mono" style={{ fontSize: 11, color: C.gold, marginBottom: 8 }}>⟳ Refreshing live planetary & price data…</div>
            ) : null}

            {/* Summary bar */}
            <div className="ll-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 14 }}>
              <Stat label="Instrument" value={market.name} color={C.gold} sub={market.marketState === "OPEN" ? "● Market Open" : "○ Market Closed"} />
              <Stat label="Live Price" value={<span className="ll-mono">{fmt(market.livePrice)}</span>} color={C.blue} sub={`Prev ${fmt(market.prevClose)}`} />
              <Stat label="Today's Change" value={<span className="ll-mono" style={{ color: market.change >= 0 ? C.green : C.red }}>{market.change >= 0 ? "▲" : "▼"} {Math.abs(market.change).toFixed(2)}</span>} sub={`${market.changePct.toFixed(2)}%`} />
              <Stat label="Bias" value={bias} color={biasColor} sub={`${data.bullCount} bull · ${data.bearCount} bear nak`} />
              <Stat label="Moon Nakshatra" value={data.moonNakshatra} sub={`${data.moonSign} ${data.moonDegree.toFixed(1)}°`} />
              <Stat label="Retrograde" value={data.retroCount} color={data.retroCount >= 3 ? C.red : C.text} sub={`${data.bullRetroCount}▲ / ${data.bearRetroCount}▼`} />
              <Stat label="Nearest Planet" value={nearest?.planet ?? "—"} sub={nearest ? `${nearest.kind} · ${Math.round(nearest.distance)} pts` : undefined} />
              <Stat label="Nearest Support" value={nearestSupport ? <span className="ll-mono">{fmt(nearestSupport.value)}</span> : "—"} color={C.green} sub={nearestSupport ? `${nearestSupport.planet} ${nearestSupport.kind}` : undefined} />
              <Stat label="Nearest Resistance" value={nearestResistance ? <span className="ll-mono">{fmt(nearestResistance.value)}</span> : "—"} color={C.red} sub={nearestResistance ? `${nearestResistance.planet} ${nearestResistance.kind}` : undefined} />
              <Stat label="Signal" value={<span style={{ color: signalColor }}>{signal.emoji} {signal.signal}</span>} sub={`${signal.strength} · ${signal.confidence}%`} />
              <Stat label="Price Position" value={pricePosition} color={pricePosition === "Above Resistance" ? C.green : pricePosition === "Below Support" ? C.red : C.gold} />
              <Stat label="Last Updated" value={<span className="ll-mono">{lastUpdated}</span>} sub="IST · auto 60s" />
            </div>

            {/* Signal + bias hero */}
            <div className="ll-grid" style={{ gridTemplateColumns: "1.2fr 1fr", marginBottom: 14 }}>
              <Card style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${signalColor} 16%, transparent), ${C.card})`, border: `1px solid ${signalColor}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Live Signal Engine · {market.name}</div>
                  <span className="ll-mono" style={{ fontSize: 10, color: C.muted }}><Radio size={11} style={{ verticalAlign: -1 }} /> every minute</span>
                </div>
                <div style={{ fontSize: 40, fontWeight: 900, color: signalColor, lineHeight: 1.1, marginTop: 4 }}>{signal.emoji} {signal.signal}</div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{signal.strength} · Confidence <b>{signal.confidence}%</b></div>
                <div style={{ height: 7, background: "rgba(255,255,255,0.08)", borderRadius: 4, margin: "8px 0" }}>
                  <div style={{ height: "100%", width: `${signal.confidence}%`, background: signalColor, borderRadius: 4, transition: "width .5s" }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {signal.reasons.map((r, i) => (
                    <span key={i} style={{ fontSize: 11, background: "rgba(76,157,255,0.12)", border: `1px solid ${C.blue}`, padding: "2px 8px", borderRadius: 6 }}>{r}</span>
                  ))}
                </div>
              </Card>
              <Card style={{ border: `1px solid ${biasColor}`, background: `linear-gradient(135deg, color-mix(in oklab, ${biasColor} 14%, transparent), ${C.card})` }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Market Bias</div>
                <div style={{ fontSize: 34, fontWeight: 900, color: biasColor, marginTop: 4 }}>{bias}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginTop: 10, fontSize: 12 }}>
                  <MiniField label="Moon Nakshatra" value={data.moonNakshatra} />
                  <MiniField label="Retrograde" value={`${data.retroCount} planets`} />
                  <MiniField label="Base Cycle" value={<span className="ll-mono">{market.cycles.base}</span>} />
                  <MiniField label="Price Position" value={pricePosition} />
                  <MiniField label="Nearest Support" value={nearestSupport ? fmt(nearestSupport.value) : "—"} />
                  <MiniField label="Nearest Resistance" value={nearestResistance ? fmt(nearestResistance.value) : "—"} />
                </div>
              </Card>
            </div>

            {/* Nearest detection cards */}
            <div className="ll-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginBottom: 16 }}>
              <NearestCard title="Nearest Planet" planet={nearest?.planet} main={nearest ? `${nearest.kind}` : "—"} sub={nearest ? `${fmt(nearest.value)} · ${Math.round(nearest.distance)} pts` : ""} color={C.blue} />
              <NearestCard title="Nearest Support" planet={nearestSupport?.planet} main={nearestSupport ? fmt(nearestSupport.value) : "—"} sub={nearestSupport ? `${nearestSupport.planet} ${nearestSupport.kind} · ${Math.round(nearestSupport.distance)} pts` : ""} color={C.green} />
              <NearestCard title="Nearest Resistance" planet={nearestResistance?.planet} main={nearestResistance ? fmt(nearestResistance.value) : "—"} sub={nearestResistance ? `${nearestResistance.planet} ${nearestResistance.kind} · ${Math.round(nearestResistance.distance)} pts` : ""} color={C.red} />
              <NearestCard title="Price Position" planet={undefined} main={pricePosition} sub={nearest ? `${nearest.planet} ${nearest.kind}` : ""} color={C.gold} />
            </div>

            {/* Live astro level matrix */}
            <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
              <SectionHead
                title={`LIVE ASTRO LEVEL MATRIX · ${market.name}`}
                note={`Base ${market.cycles.base} · Upper ${fmt(market.cycles.upper)} · Lower ${fmt(market.cycles.lower)}`}
              />
              <div style={{ overflowX: "auto" }}>
                <table className="ll-table">
                  <thead>
                    <tr>
                      <th>Planet</th><th>Degree</th>
                      <th style={{ color: C.red }}>R1</th><th style={{ color: C.red }}>R2</th><th style={{ color: C.red }}>R3</th>
                      <th style={{ color: C.blue }}>Price</th>
                      <th style={{ color: C.green }}>S1</th><th style={{ color: C.green }}>S2</th><th style={{ color: C.green }}>S3</th>
                      <th>Nearest</th><th>Dist</th><th>Status</th><th>Signal</th><th>Conf</th><th>Motion</th><th>Retro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {market.planets.map((p) => {
                      const rows = sorted.filter((l) => l.planet === p.planet);
                      const near = rows[0];
                      const isNearestRow = nearest?.planet === p.planet;
                      return (
                        <tr key={p.planet} className={isNearestRow ? "ll-row-near" : undefined} onClick={() => setSelected(p)}>
                          <td>
                            <span style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 700 }}>
                              <span className="eb-planet-orb" style={{ width: 20, height: 20, ...orbStyle(p.planet) }} />
                              {p.planet}
                            </span>
                          </td>
                          <td className="ll-mono">{p.degree.toFixed(2)}°</td>
                          <td className="ll-mono" style={{ color: C.red }}>{fmt(p.r1)}</td>
                          <td className="ll-mono" style={{ color: C.red }}>{fmt(p.r2)}</td>
                          <td className="ll-mono" style={{ color: C.red }}>{fmt(p.r3)}</td>
                          <td className="ll-mono" style={{ color: C.blue, fontWeight: 700 }}>{fmt(market.livePrice)}</td>
                          <td className="ll-mono" style={{ color: C.green }}>{fmt(p.s1)}</td>
                          <td className="ll-mono" style={{ color: C.green }}>{fmt(p.s2)}</td>
                          <td className="ll-mono" style={{ color: C.green }}>{fmt(p.s3)}</td>
                          <td className="ll-mono" style={{ fontWeight: 700 }}>{near ? `${near.kind} ${fmt(near.value)}` : "—"}</td>
                          <td className="ll-mono">{near ? Math.round(near.distance) : "—"}</td>
                          <td><span style={{ color: near ? STATUS_COLOR[near.status] : C.muted, fontWeight: 700, fontSize: 11 }}>{near?.status ?? "—"}</span></td>
                          <td><span style={{ color: near ? (near.signal === "BUY" ? C.green : near.signal === "SELL" ? C.red : C.gold) : C.muted, fontWeight: 700, fontSize: 11 }}>{near?.signal ?? "—"}</span></td>
                          <td className="ll-mono" style={{ color: C.blue }}>{near ? `${near.confidence}%` : "—"}</td>
                          <td style={{ color: p.retro ? C.red : C.green, fontWeight: 700 }}>{p.motion}</td>
                          <td>{p.retro ? <RetroBadge /> : <span style={{ color: C.muted }}>—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Chart */}
            <Card style={{ marginBottom: 16 }}>
              <SectionHead title={`ASTRO LEVEL MAP · ${market.name}`} note={`Live price vs planetary R1/S1 levels`} bare />
              <LevelChart market={market} fmt={fmt} />
            </Card>

            {/* Planet panel */}
            <Card style={{ marginBottom: 16 }}>
              <SectionHead title="PLANET POSITION PANEL" note={`As of ${lastUpdated} IST`} bare />
              <div className="ll-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
                {market.planets.map((p) => (
                  <PlanetCard key={p.planet} p={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            </Card>

            {/* Controls / export */}
            <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <button onClick={() => exportCsv(market, data.formulaVersion)} style={ghost(C.green)}><Download size={14} style={{ verticalAlign: -2 }} /> CSV</button>
              <button onClick={() => exportExcel(market, data.formulaVersion)} style={ghost(C.blue)}><FileSpreadsheet size={14} style={{ verticalAlign: -2 }} /> Excel</button>
              <button onClick={() => window.print()} style={ghost(C.gold)}><FileText size={14} style={{ verticalAlign: -2 }} /> PDF</button>
              <button onClick={() => window.print()} style={ghost(C.muted)}><Printer size={14} style={{ verticalAlign: -2 }} /> Print</button>
            </div>

            {/* News */}
            <Card style={{ marginBottom: 16 }}>
              <SectionHead title="MARKET NEWS" note="Latest financial & market headlines" bare />
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Open the live news center for full breaking-news coverage, filters and AI market view.</div>
              <NewsCenter />
            </Card>

            <div className="ll-mono" style={{ fontSize: 11, color: C.muted, textAlign: "center", marginBottom: 16 }}>
              Last updated {lastUpdated} IST · Auto-refresh every 60 seconds · No manual refresh required
            </div>

            <Disclaimer />
          </main>
        </div>
      </div>

      {/* Alerts panel */}
      {showAlerts ? (
        <div className="ll-drawer no-print" style={drawerStyle(360)}>
          <DrawerHead title="Live Alerts" onClose={() => setShowAlerts(false)} />
          <div style={{ padding: 14, overflowY: "auto" }}>
            {alerts.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, textAlign: "center", marginTop: 30 }}>
                No alerts yet. You'll be notified when price touches/breaks a level, the Moon changes nakshatra, a planet changes sign, or a retrograde starts/ends.
              </div>
            ) : (
              alerts.map((a) => {
                const col = a.tone === "up" ? C.green : a.tone === "down" ? C.red : C.blue;
                return (
                  <div key={a.id} style={{ borderLeft: `3px solid ${col}`, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "9px 12px", marginBottom: 8 }}>
                    <div style={{ fontSize: 13 }}>{a.text}</div>
                    <div className="ll-mono" style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{a.at} IST</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {/* Planet detail drawer */}
      {selected ? (
        <PlanetDrawer p={selected} price={market.livePrice} fmt={fmt} lvls={sorted.filter((l) => l.planet === selected.planet)} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

/* ------------------------------ subcomponents ------------------------------ */

function ghost(color: string): React.CSSProperties {
  return { background: "transparent", border: `1px solid ${color}`, color, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" };
}

function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <div className={`eb-card eb-glass${className ? ` ${className}` : ""}`} style={{ borderRadius: 16, padding: 16, ...style }}>{children}</div>;
}

function SectionHead({ title, note, bare }: { title: string; note?: string; bare?: boolean }) {
  return (
    <div style={{ padding: bare ? "0 0 10px" : "12px 16px", borderBottom: bare ? "none" : `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontWeight: 700, letterSpacing: 1, fontSize: 13 }}>{title}</span>
      {note ? <span className="ll-mono" style={{ fontSize: 11, color: C.muted }}>{note}</span> : null}
    </div>
  );
}

function Stat({ label, value, color, sub }: { label: string; value: React.ReactNode; color?: string; sub?: string }) {
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? C.text, marginTop: 4 }} suppressHydrationWarning>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }} suppressHydrationWarning>{sub}</div> : null}
    </Card>
  );
}

function MiniField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function NearestCard({ title, planet, main, sub, color }: { title: string; planet?: string; main: string; sub: string; color: string }) {
  return (
    <Card style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        {planet ? <span className="eb-planet-orb" style={{ width: 30, height: 30, ...orbStyle(planet) }} /> : null}
        <div>
          <div className="ll-mono" style={{ fontSize: 20, fontWeight: 800, color }}>{main}</div>
          {sub ? <div style={{ fontSize: 11, color: C.muted }}>{sub}</div> : null}
        </div>
      </div>
    </Card>
  );
}

function PlanetCard({ p, onClick }: { p: MarketPlanet; onClick: () => void }) {
  return (
    <button onClick={onClick} className="eb-card eb-glass" style={{ textAlign: "left", cursor: "pointer", borderRadius: 14, padding: 14, border: `1px solid ${C.border}`, background: "var(--eb-card)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="eb-planet-orb" style={{ width: 38, height: 38, ...orbStyle(p.planet) }} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>{p.planet}{p.retro ? <RetroBadge /> : null}</div>
          <div className="ll-mono" style={{ fontSize: 11, color: C.muted }}>{p.degree.toFixed(2)}° {p.sign}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", marginTop: 10, fontSize: 11 }}>
        <MiniField label="Nakshatra" value={p.nakshatra} />
        <MiniField label="Lord" value={p.lord} />
        <MiniField label="Pada" value={<span className="ll-mono">{p.pada}</span>} />
        <MiniField label="Motion" value={<span style={{ color: p.retro ? C.red : C.green }}>{p.motion}</span>} />
      </div>
      <div style={{ marginTop: 8 }}><BullBearBadge bull={p.bull} bear={p.bear} /></div>
    </button>
  );
}

function RetroBadge() {
  return <span className="ll-retro" style={{ background: "#a855f7", color: "#fff", fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 6, border: "1px solid #c084fc" }}>R</span>;
}

function BullBearBadge({ bull, bear }: { bull: boolean; bear: boolean }) {
  if (!bull && !bear) return <span style={{ color: C.muted, fontSize: 11 }}>Neutral</span>;
  const col = bull ? C.green : C.red;
  return (
    <span style={{ background: bull ? "rgba(16,185,129,0.16)" : "rgba(225,29,72,0.16)", color: bull ? "#4ade80" : "#f87171", border: `1px solid ${col}`, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
      {bull ? "BULLISH" : "BEARISH"}
    </span>
  );
}

function drawerStyle(width: number): React.CSSProperties {
  return {
    position: "fixed", top: 0, right: 0, height: "100vh", width, maxWidth: "100%",
    background: "var(--eb-card)", borderLeft: "1px solid var(--eb-border)",
    boxShadow: "-16px 0 40px rgba(0,0,0,0.45)", zIndex: 60, display: "flex", flexDirection: "column",
  };
}

function DrawerHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontWeight: 800, letterSpacing: 0.5 }}>{title}</span>
      <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer" }}><X size={20} /></button>
    </div>
  );
}

function PlanetDrawer({ p, price, fmt, lvls, onClose }: { p: MarketPlanet; price: number; fmt: (n: number) => string; lvls: Lvl[]; onClose: () => void }) {
  const near = lvls[0];
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 55 }} />
      <div className="ll-drawer no-print" style={drawerStyle(400)}>
        <DrawerHead title={`${p.planet} · Details`} onClose={onClose} />
        <div style={{ padding: 18, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <span className="eb-planet-orb" style={{ width: 72, height: 72, ...orbStyle(p.planet) }} />
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
                {p.planet} {p.retro ? <RetroBadge /> : null}
              </div>
              <div style={{ fontSize: 13, color: C.muted }}>{p.degree.toFixed(2)}° {p.sign}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <MiniField label="Absolute Degree" value={<span className="ll-mono">{p.absDegree.toFixed(2)}°</span>} />
            <MiniField label="Sign" value={p.sign} />
            <MiniField label="Nakshatra" value={p.nakshatra} />
            <MiniField label="Lord" value={p.lord} />
            <MiniField label="Pada" value={<span className="ll-mono">{p.pada}</span>} />
            <MiniField label="Speed" value={<span className="ll-mono">{p.speed.toFixed(4)}</span>} />
            <MiniField label="Motion" value={<span style={{ color: p.retro ? C.red : C.green }}>{p.motion}</span>} />
            <MiniField label="Bull / Bear" value={<BullBearBadge bull={p.bull} bear={p.bear} />} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.muted, marginBottom: 8 }}>ASTRO LEVELS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            {(["r1", "r2", "r3", "s1", "s2", "s3"] as const).map((k) => (
              <div key={k} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px", borderLeft: `3px solid ${k.startsWith("r") ? C.red : C.green}` }}>
                <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>{k}</div>
                <div className="ll-mono" style={{ fontWeight: 800 }}>{fmt(p[k])}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(76,157,255,0.08)", border: `1px solid ${C.blue}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Nearest Price Level</div>
            {near ? (
              <>
                <div className="ll-mono" style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{near.kind} · {fmt(near.value)}</div>
                <div style={{ fontSize: 12, color: C.muted }}>Distance from live price ({fmt(price)}): <b className="ll-mono" style={{ color: C.text }}>{Math.round(near.distance)} pts</b></div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Status <b style={{ color: STATUS_COLOR[near.status] }}>{near.status}</b> · Signal <b style={{ color: near.signal === "BUY" ? C.green : near.signal === "SELL" ? C.red : C.gold }}>{near.signal}</b></div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function LevelChart({ market, fmt }: { market: MarketBlock; fmt: (n: number) => string }) {
  const series = useMemo(
    () =>
      market.planets.map((p) => ({
        name: p.planet,
        data: [
          { x: "S3", y: p.s3 }, { x: "S2", y: p.s2 }, { x: "S1", y: p.s1 },
          { x: "R1", y: p.r1 }, { x: "R2", y: p.r2 }, { x: "R3", y: p.r3 },
        ],
      })),
    [market.planets],
  );

  const options = useMemo(
    () => ({
      chart: {
        toolbar: { show: true, tools: { zoom: true, pan: true, reset: true, download: true } },
        zoom: { enabled: true },
        animations: { enabled: true },
      },
      stroke: { width: 2, curve: "straight" as const },
      colors: market.planets.map((p) => PLANET_STYLE[p.planet]?.line ?? "#888"),
      xaxis: { categories: ["S3", "S2", "S1", "R1", "R2", "R3"], labels: { style: { colors: "var(--eb-muted)" } } },
      yaxis: { labels: { style: { colors: "var(--eb-muted)" }, formatter: (v: number) => fmt(v) } },
      grid: { borderColor: "rgba(255,255,255,0.06)" },
      legend: { position: "bottom" as const, labels: { colors: "var(--eb-muted)" } },
      tooltip: { theme: "dark" as const, y: { formatter: (v: number) => fmt(v) } },
      markers: { size: 3 },
      annotations: {
        yaxis: [
          {
            y: market.livePrice,
            borderColor: "var(--eb-accent)",
            strokeDashArray: 4,
            label: { text: `${market.name} ${fmt(market.livePrice)}`, style: { background: "var(--eb-accent)", color: "#000" } },
          },
        ],
      },
    }),
    [market, fmt],
  );

  return <ApexChart type="line" series={series} options={options as any} height={360} />;
}
