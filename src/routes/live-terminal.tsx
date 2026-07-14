import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { getLiveAstro, type LiveAstroData, type LivePlanet, type LiveIndex } from "@/lib/live-astro.functions";
import { buildLevelBoard, computeSignal } from "@/lib/astro-levels";
import { Disclaimer } from "@/components/Disclaimer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppSidebar } from "@/components/AppSidebar";
import { ApexChart } from "@/components/ApexChart";
import { NewsCenter } from "@/components/NewsPopup";
import { Bell, X, MapPin, Download, Printer, FileSpreadsheet, FileText, Radio } from "lucide-react";
import logoUrl from "@/assets/eaglebaba-logo.png";
import { useIstClock } from "@/hooks/use-scheduler";
import { PLANET_STYLE, orbStyle } from "@/lib/planet-style";
import { downloadBlob } from "@/lib/download";
import { deriveTithi, deriveKarana, deriveYoga, sunTimes } from "@/lib/panchang";
import { inrRound } from "@/lib/format";
import type { LevelKind, LevelStatus, Lvl } from "@/types/levels";

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

const liveQuery = () =>
  queryOptions({
    queryKey: ["live-astro"],
    queryFn: () => getLiveAstro(),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/live-terminal")({
  loader: ({ context }) => context.queryClient.ensureQueryData(liveQuery()),
  component: LiveTerminal,
  head: () => ({
    meta: [
      { title: "Live Astro Planet Position Terminal | EagleBABA" },
      {
        name: "description",
        content:
          "Institutional-grade real-time astro trading terminal: live planetary positions, auto-updating NIFTY astro support/resistance levels, market bias and BUY/SELL/WAIT signals refreshed every minute.",
      },
      { property: "og:title", content: "Live Astro Planet Position Terminal | EagleBABA" },
      {
        property: "og:description",
        content: "Real-time planetary positions and auto-updated astro support/resistance levels for NIFTY.",
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

const LOCATIONS: Record<string, { label: string; lat: number; lng: number }> = {
  Mumbai: { label: "Mumbai, Maharashtra", lat: 19.076, lng: 72.8777 },
  Delhi: { label: "New Delhi", lat: 28.6139, lng: 77.209 },
  Kolkata: { label: "Kolkata, West Bengal", lat: 22.5726, lng: 88.3639 },
  Chennai: { label: "Chennai, Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  Bengaluru: { label: "Bengaluru, Karnataka", lat: 12.9716, lng: 77.5946 },
};

/* ------------------------------ helpers ------------------------------ */

const num = inrRound;
const TOL = 8; // NIFTY-point tolerance for a level "touch".

function levelStatus(price: number, value: number, isResistance: boolean): LevelStatus {
  const d = Math.abs(price - value);
  if (d <= TOL) return "TOUCHED";
  if (isResistance) {
    if (price > value) return "BROKEN";
    return d <= TOL * 5 ? "ACTIVE" : "PENDING";
  }
  if (price < value) return "BROKEN";
  return d <= TOL * 5 ? "ACTIVE" : "PENDING";
}

function levelSignal(price: number, value: number, isResistance: boolean): Lvl["signal"] {
  const d = Math.abs(price - value);
  if (d <= TOL) return "WATCH";
  if (isResistance) return price > value ? "BUY" : "SELL";
  return price < value ? "SELL" : "BUY";
}

const STATUS_COLOR: Record<LevelStatus, string> = {
  ACTIVE: C.blue,
  TOUCHED: C.gold,
  BROKEN: "#a855f7",
  REJECTED: "#f97316",
  PENDING: C.muted,
};

function buildLvls(planets: LivePlanet[], price: number): Lvl[] {
  const out: Lvl[] = [];
  for (const p of planets) {
    const defs: [LevelKind, number, boolean][] = [
      ["R3", p.r3, true], ["R2", p.r2, true], ["R1", p.r1, true],
      ["S1", p.s1, false], ["S2", p.s2, false], ["S3", p.s3, false],
    ];
    for (const [kind, value, isR] of defs) {
      const distance = Math.abs(price - value);
      out.push({
        planet: p.planet,
        kind,
        value,
        isResistance: isR,
        distance,
        status: levelStatus(price, value, isR),
        signal: levelSignal(price, value, isR),
        confidence: Math.max(5, Math.min(99, Math.round(100 - Math.min(90, (distance / TOL) * 7)))),
      });
    }
  }
  return out;
}

/* ------------------------------ exports ------------------------------ */

const EXPORT_COLS = ["Planet", "Degree", "AbsDegree", "Sign", "Nakshatra", "Lord", "Pada", "Speed", "Motion", "R1", "R2", "R3", "S1", "S2", "S3"];
const exportRow = (p: LivePlanet) =>
  [p.planet, p.degree, p.absDegree, p.sign, p.nakshatra, p.lord, p.pada, p.speed, p.motion, p.r1, p.r2, p.r3, p.s1, p.s2, p.s3];

function exportCsv(planets: LivePlanet[]) {
  const rows = planets.map((p) => exportRow(p).join(","));
  downloadBlob([EXPORT_COLS.join(","), ...rows].join("\n"), "live-astro-levels.csv", "text/csv");
}
function exportExcel(planets: LivePlanet[]) {
  const cells = (arr: (string | number)[]) => arr.map((c) => `<td>${c}</td>`).join("");
  const head = "<tr>" + cells(EXPORT_COLS) + "</tr>";
  const body = planets.map((p) => "<tr>" + cells(exportRow(p)) + "</tr>").join("");
  downloadBlob(`<html><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`, "live-astro-levels.xls", "application/vnd.ms-excel");
}

/* ------------------------------ component ------------------------------ */

function LiveTerminal() {
  const { data, isFetching, dataUpdatedAt } = useSuspenseQuery(liveQuery());
  const clock = useIstClock();
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<LivePlanet | null>(null);
  const [location, setLocation] = useState("Mumbai");
  const [showSettings, setShowSettings] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alerts, setAlerts] = useState<{ id: string; text: string; tone: "up" | "down" | "info"; at: string }[]>([]);
  const prevRef = useRef<LiveAstroData | null>(null);

  useEffect(() => {
    setMounted(true);
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("eb-terminal-location") : null;
    if (saved && LOCATIONS[saved]) setLocation(saved);
  }, []);

  useEffect(() => {
    if (typeof localStorage !== "undefined") localStorage.setItem("eb-terminal-location", location);
  }, [location]);

  const lvls = useMemo(() => buildLvls(data.planets, data.livePrice), [data.planets, data.livePrice]);
  const sorted = useMemo(() => [...lvls].sort((a, b) => a.distance - b.distance), [lvls]);

  // Reuse existing signal engine (unchanged trading logic).
  const signal = useMemo(() => {
    const board = buildLevelBoard(data.planets, data.livePrice);
    return computeSignal({
      price: data.livePrice,
      board,
      moonNakshatra: data.moonNakshatra,
      retroCount: data.retroCount,
      totalPlanets: data.planets.length,
      bullRetroCount: data.bullRetroCount,
      bearRetroCount: data.bearRetroCount,
    });
  }, [data]);

  const nearest = sorted[0] ?? null;
  const nearestSupport = useMemo(() => sorted.find((l) => !l.isResistance) ?? null, [sorted]);
  const nearestResistance = useMemo(() => sorted.find((l) => l.isResistance) ?? null, [sorted]);

  const bias = signal.confidence >= 60 ? "Bullish" : signal.confidence <= 40 ? "Bearish" : "Neutral";
  const biasColor = bias === "Bullish" ? C.green : bias === "Bearish" ? C.red : C.gold;
  const signalColor = signal.signal === "BUY" ? C.green : signal.signal === "SELL" ? C.red : C.gold;

  const sun = data.planets.find((p) => p.planet === "Sun");
  const moon = data.planets.find((p) => p.planet === "Moon");
  const tithi = deriveTithi(data.moonPhase.elongation);
  const yoga = sun && moon ? deriveYoga(sun.absDegree, moon.absDegree) : "—";
  const karana = deriveKarana(data.moonPhase.elongation);
  const loc = LOCATIONS[location];
  const { sunrise, sunset } = sun ? sunTimes(loc.lat, loc.lng) : { sunrise: "—", sunset: "—" };

  const lastUpdated = new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kolkata" });

  // Alert engine — diff current snapshot vs previous.
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
        if (!old.retro && p.retro) push(`${p.planet} turned Retrograde (R)`, "down");
        if (old.retro && !p.retro) push(`${p.planet} turned Direct`, "up");
      }

      // Price crossing nearest levels.
      const prevLvls = buildLvls(prev.planets, prev.livePrice);
      for (const l of lvls) {
        const old = prevLvls.find((x) => x.planet === l.planet && x.kind === l.kind);
        if (!old) continue;
        if (old.status !== "TOUCHED" && l.status === "TOUCHED")
          push(`Price touched ${l.planet} ${l.kind} (${num(l.value)})`, "info");
        if (old.status !== "BROKEN" && l.status === "BROKEN")
          push(`Price broke ${l.planet} ${l.kind} (${num(l.value)})`, l.isResistance ? "up" : "down");
      }

      if (fresh.length) setAlerts((a) => [...fresh, ...a].slice(0, 30));
    }
    prevRef.current = data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.asOf]);

  const unread = alerts.length;

  if (!mounted) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.text }}>🛰️ Live Astro Planet Position Terminal</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>Connecting to live planetary & market feed…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--eb-head, system-ui, sans-serif)" }}>
      <div className="eb-space-bg" aria-hidden="true" />
      <style>{`
        .lt-grid { display:grid; gap:12px; }
        .lt-mono { font-family:var(--eb-mono, ui-monospace, monospace); }
        .lt-table { width:100%; border-collapse:collapse; font-size:12.5px; }
        .lt-table th { text-align:left; color:${"var(--eb-muted)"}; font-weight:600; font-size:10.5px; text-transform:uppercase; letter-spacing:.5px; padding:9px 10px; border-bottom:1px solid var(--eb-border); position:sticky; top:0; background:var(--eb-card); z-index:1; }
        .lt-table td { padding:9px 10px; border-bottom:1px solid var(--eb-border); white-space:nowrap; }
        .lt-table tbody tr { cursor:pointer; transition:background .15s; }
        .lt-table tbody tr:hover { background:color-mix(in srgb, var(--eb-accent) 8%, transparent); }
        @keyframes ltPulse { 0%,100%{opacity:1;box-shadow:0 0 8px var(--orb-glow,rgba(168,85,247,.6))} 50%{opacity:.6;box-shadow:0 0 18px rgba(168,85,247,.9)} }
        .lt-retro { animation: ltPulse 1.1s infinite; }
        .lt-live-dot { width:8px;height:8px;border-radius:50%;background:${"var(--eb-bull)"};box-shadow:0 0 8px var(--eb-bull);animation:ltPulse 1.4s infinite;display:inline-block }
        @media print { .no-print { display:none !important; } body { background:#fff !important; } }
        @media (max-width:820px){ .lt-drawer{ width:100% !important; } }
      `}</style>

      <div style={{ maxWidth: 1520, margin: "0 auto", padding: "18px 16px 48px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src={logoUrl} alt="EagleBABA logo" width={52} height={52} style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", boxShadow: "0 0 16px rgba(212,175,55,0.35)" }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 10 }}>
                Live Astro Planet Position Terminal
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: C.green, border: `1px solid ${C.green}`, borderRadius: 20, padding: "2px 10px" }}>
                  <span className="lt-live-dot" /> LIVE
                </span>
              </h1>
              <div style={{ fontSize: 12, color: C.muted }}>
                <MapPin size={12} style={{ verticalAlign: -2 }} /> {loc.label} · Asia/Kolkata · auto-refresh 60s
              </div>
            </div>
          </div>
          <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="lt-mono" style={{ fontSize: 13, color: C.muted }}>IST {clock}</span>
            <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, fontWeight: 700, background: data.marketState === "OPEN" ? "rgba(16,185,129,0.15)" : "rgba(148,163,184,0.15)", color: data.marketState === "OPEN" ? C.green : C.muted }}>
              {data.marketState === "OPEN" ? "● MARKET OPEN" : "○ MARKET CLOSED"}
            </span>
            <button onClick={() => setShowAlerts((s) => !s)} title="Alerts" style={{ ...ghost(C.gold), position: "relative", padding: "6px 9px" }}>
              <Bell size={16} />
              {unread > 0 ? <span style={{ position: "absolute", top: -6, right: -6, background: C.red, color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 20, padding: "1px 5px" }}>{unread}</span> : null}
            </button>
            <button onClick={() => setShowSettings((s) => !s)} title="Settings" style={{ ...ghost(C.muted), padding: "6px 9px" }}><MapPin size={16} /></button>
            <Link to="/astro" style={{ fontSize: 12, color: C.blue, textDecoration: "none", border: `1px solid ${C.border}`, padding: "5px 10px", borderRadius: 8 }}>Astro View</Link>
            <NewsCenter />
            <ThemeToggle />
          </div>
        </div>

        {showSettings ? (
          <Card className="no-print" style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: C.muted }}>LOCATION</span>
            <select value={location} onChange={(e) => setLocation(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "7px 12px", borderRadius: 8, fontSize: 13 }}>
              {Object.entries(LOCATIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <span style={{ fontSize: 11, color: C.muted }}>Timezone Asia/Kolkata · Sunrise {sunrise} · Sunset {sunset}</span>
          </Card>
        ) : null}

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <AppSidebar />
          <main style={{ flex: 1, minWidth: 0 }}>

            {isFetching ? (
              <div className="no-print lt-mono" style={{ fontSize: 11, color: C.gold, marginBottom: 8 }}>⟳ Refreshing live planetary & price data…</div>
            ) : null}

            {/* Index strip */}
            <div className="lt-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 14 }}>
              {data.indices.map((ix) => <IndexTile key={ix.symbol} ix={ix} />)}
            </div>

            {/* Top summary premium cards */}
            <div className="lt-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 14 }}>
              <Stat label="Live NIFTY" value={<span className="lt-mono">{num(data.livePrice)}</span>} color={C.blue} sub={`Prev ${num(data.prevClose)}`} />
              <Stat label="Signal" value={<span style={{ color: signalColor }}>{signal.emoji} {signal.signal}</span>} sub={`${signal.strength} · ${signal.confidence}%`} />
              <Stat label="Market Bias" value={bias} color={biasColor} sub={`${data.bullCount} bull · ${data.bearCount} bear nak`} />
              <Stat label="Moon Sign" value={data.moonSign} sub={`${data.moonDegree.toFixed(2)}°`} />
              <Stat label="Nakshatra" value={data.moonNakshatra} />
              <Stat label="Tithi" value={tithi.name} sub={tithi.paksha} />
              <Stat label="Yoga" value={yoga} />
              <Stat label="Karana" value={karana} />
              <Stat label="Retrograde" value={data.retroCount} color={data.retroCount >= 3 ? C.red : C.text} />
              <Stat label="Nearest Planet" value={nearest?.planet ?? "—"} sub={nearest ? `${nearest.kind} · ${Math.round(nearest.distance)} pts` : undefined} />
              <Stat label="Nearest Support" value={nearestSupport ? <span className="lt-mono">{num(nearestSupport.value)}</span> : "—"} color={C.green} sub={nearestSupport ? `${nearestSupport.planet} ${nearestSupport.kind}` : undefined} />
              <Stat label="Nearest Resistance" value={nearestResistance ? <span className="lt-mono">{num(nearestResistance.value)}</span> : "—"} color={C.red} sub={nearestResistance ? `${nearestResistance.planet} ${nearestResistance.kind}` : undefined} />
            </div>

            {/* Signal + bias hero */}
            <div className="lt-grid" style={{ gridTemplateColumns: "1.2fr 1fr", marginBottom: 14 }}>
              <Card style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${signalColor} 16%, transparent), ${C.card})`, border: `1px solid ${signalColor}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Live Signal Engine</div>
                  <span className="lt-mono" style={{ fontSize: 10, color: C.muted }}><Radio size={11} style={{ verticalAlign: -1 }} /> updates every minute</span>
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
                  <MiniField label="Bull Retro" value={`${data.bullRetroCount} (Mars/Jup)`} />
                  <MiniField label="Bear Retro" value={`${data.bearRetroCount} (Merc/Sat)`} />
                  <MiniField label="Price vs Support" value={nearestSupport ? `${data.livePrice > nearestSupport.value ? "Above" : "Below"}` : "—"} />
                  <MiniField label="Price vs Resistance" value={nearestResistance ? `${data.livePrice > nearestResistance.value ? "Above" : "Below"}` : "—"} />
                </div>
              </Card>
            </div>

            {/* Nearest detection cards */}
            <div className="lt-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginBottom: 16 }}>
              <NearestCard title="Nearest Planet" planet={nearest?.planet} main={nearest ? `${nearest.kind}` : "—"} sub={nearest ? `${num(nearest.value)} · ${Math.round(nearest.distance)} pts` : ""} color={C.blue} />
              <NearestCard title="Nearest Support" planet={nearestSupport?.planet} main={nearestSupport ? num(nearestSupport.value) : "—"} sub={nearestSupport ? `${nearestSupport.planet} ${nearestSupport.kind} · ${Math.round(nearestSupport.distance)} pts` : ""} color={C.green} />
              <NearestCard title="Nearest Resistance" planet={nearestResistance?.planet} main={nearestResistance ? num(nearestResistance.value) : "—"} sub={nearestResistance ? `${nearestResistance.planet} ${nearestResistance.kind} · ${Math.round(nearestResistance.distance)} pts` : ""} color={C.red} />
              <NearestCard title="Direction" planet={undefined} main={nearest ? (nearest.isResistance ? "▲ Toward R" : "▼ Toward S") : "—"} sub={nearest ? `${nearest.planet} ${nearest.kind}` : ""} color={C.gold} />
            </div>

            {/* Live planet table */}
            <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
              <SectionHead title="LIVE PLANETARY POSITIONS" note={`As of ${lastUpdated} IST`} />
              <div style={{ overflowX: "auto" }}>
                <table className="lt-table">
                  <thead>
                    <tr>
                      <th>Planet</th><th>Degree</th><th>Abs°</th><th>Sign</th><th>Nakshatra</th><th>Lord</th><th>Pada</th><th>Speed</th><th>Motion</th><th>Retro</th><th>Bull/Bear</th><th>Strength</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.planets.map((p) => {
                      const strength = Math.max(8, Math.min(100, Math.round((Math.abs(p.speed) / 13) * 100)));
                      return (
                        <tr key={p.planet} onClick={() => setSelected(p)}>
                          <td>
                            <span style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 700 }}>
                              <span className="eb-planet-orb" style={{ width: 22, height: 22, ...orbStyle(p.planet) }} />
                              {p.planet}
                            </span>
                          </td>
                          <td className="lt-mono">{p.degree.toFixed(2)}°</td>
                          <td className="lt-mono">{p.absDegree.toFixed(2)}°</td>
                          <td>{p.sign}</td>
                          <td>{p.nakshatra}</td>
                          <td>{p.lord}</td>
                          <td className="lt-mono">{p.pada}</td>
                          <td className="lt-mono" style={{ color: p.retro ? C.red : C.green }}>{p.speed.toFixed(3)}</td>
                          <td style={{ color: p.retro ? C.red : C.green, fontWeight: 700 }}>{p.motion}</td>
                          <td>{p.retro ? <RetroBadge /> : <span style={{ color: C.muted }}>—</span>}</td>
                          <td><BullBearBadge bull={p.bull} bear={p.bear} /></td>
                          <td style={{ minWidth: 90 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
                                <div style={{ height: "100%", width: `${strength}%`, borderRadius: 4, background: "var(--eb-gold-grad)" }} />
                              </div>
                              <span className="lt-mono" style={{ fontSize: 10, color: C.muted }}>{strength}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Live astro level table */}
            <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
              <SectionHead
                title="LIVE ASTRO LEVELS (R1 · R2 · R3 · S1 · S2 · S3)"
                note={`Base ${data.cycles.base} · Upper ${num(data.cycles.upper)} · Lower ${num(data.cycles.lower)}`}
              />
              <div style={{ overflowX: "auto" }}>
                <table className="lt-table">
                  <thead>
                    <tr>
                      <th>Planet</th><th>Degree</th><th style={{ color: C.red }}>R1</th><th style={{ color: C.red }}>R2</th><th style={{ color: C.red }}>R3</th><th style={{ color: C.green }}>S1</th><th style={{ color: C.green }}>S2</th><th style={{ color: C.green }}>S3</th><th>Nearest</th><th>Dist</th><th>Status</th><th>Signal</th><th>Conf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.planets.map((p) => {
                      const rows = sorted.filter((l) => l.planet === p.planet);
                      const near = rows[0];
                      return (
                        <tr key={p.planet} onClick={() => setSelected(p)}>
                          <td style={{ fontWeight: 700 }}>{p.planet}</td>
                          <td className="lt-mono">{p.degree.toFixed(2)}°</td>
                          <td className="lt-mono" style={{ color: C.red }}>{num(p.r1)}</td>
                          <td className="lt-mono" style={{ color: C.red }}>{num(p.r2)}</td>
                          <td className="lt-mono" style={{ color: C.red }}>{num(p.r3)}</td>
                          <td className="lt-mono" style={{ color: C.green }}>{num(p.s1)}</td>
                          <td className="lt-mono" style={{ color: C.green }}>{num(p.s2)}</td>
                          <td className="lt-mono" style={{ color: C.green }}>{num(p.s3)}</td>
                          <td className="lt-mono" style={{ fontWeight: 700 }}>{near ? `${near.kind} ${num(near.value)}` : "—"}</td>
                          <td className="lt-mono">{near ? Math.round(near.distance) : "—"}</td>
                          <td><span style={{ color: near ? STATUS_COLOR[near.status] : C.muted, fontWeight: 700, fontSize: 11 }}>{near?.status ?? "—"}</span></td>
                          <td><span style={{ color: near ? (near.signal === "BUY" ? C.green : near.signal === "SELL" ? C.red : C.gold) : C.muted, fontWeight: 700, fontSize: 11 }}>{near?.signal ?? "—"}</span></td>
                          <td className="lt-mono" style={{ color: C.blue }}>{near ? `${near.confidence}%` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Chart */}
            <Card style={{ marginBottom: 16 }}>
              <SectionHead title="ASTRO LEVEL MAP" note="Live NIFTY vs planetary R1/S1 levels" bare />
              <LevelChart planets={data.planets} price={data.livePrice} />
            </Card>

            {/* Controls / export */}
            <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <button onClick={() => exportCsv(data.planets)} style={ghost(C.green)}><Download size={14} style={{ verticalAlign: -2 }} /> CSV</button>
              <button onClick={() => exportExcel(data.planets)} style={ghost(C.blue)}><FileSpreadsheet size={14} style={{ verticalAlign: -2 }} /> Excel</button>
              <button onClick={() => window.print()} style={ghost(C.gold)}><FileText size={14} style={{ verticalAlign: -2 }} /> PDF</button>
              <button onClick={() => window.print()} style={ghost(C.muted)}><Printer size={14} style={{ verticalAlign: -2 }} /> Print</button>
            </div>

            <div className="lt-mono" style={{ fontSize: 11, color: C.muted, textAlign: "center", marginBottom: 16 }}>
              Last updated {lastUpdated} IST · Auto-refresh every 60 seconds · No manual refresh required
            </div>

            <Disclaimer />
          </main>
        </div>
      </div>

      {/* Alerts panel */}
      {showAlerts ? (
        <div className="lt-drawer no-print" style={drawerStyle(360)}>
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
                    <div className="lt-mono" style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{a.at} IST</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {/* Planet detail drawer */}
      {selected ? (
        <PlanetDrawer p={selected} price={data.livePrice} lvls={sorted.filter((l) => l.planet === selected.planet)} onClose={() => setSelected(null)} />
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
      {note ? <span className="lt-mono" style={{ fontSize: 11, color: C.muted }}>{note}</span> : null}
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

function IndexTile({ ix }: { ix: LiveIndex }) {
  const up = ix.change >= 0;
  const col = up ? C.green : C.red;
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>{ix.name}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: ix.marketState === "OPEN" ? C.green : C.muted }}>{ix.marketState === "OPEN" ? "● LIVE" : "○ CLOSED"}</span>
      </div>
      <div className="lt-mono" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{num(ix.livePrice)}</div>
      <div className="lt-mono" style={{ fontSize: 12, color: col, marginTop: 2 }}>
        {up ? "▲" : "▼"} {Math.abs(ix.change).toFixed(2)} ({ix.changePct.toFixed(2)}%)
      </div>
    </Card>
  );
}

function NearestCard({ title, planet, main, sub, color }: { title: string; planet?: string; main: string; sub: string; color: string }) {
  return (
    <Card style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        {planet ? <span className="eb-planet-orb" style={{ width: 30, height: 30, ...orbStyle(planet) }} /> : null}
        <div>
          <div className="lt-mono" style={{ fontSize: 22, fontWeight: 800, color }}>{main}</div>
          {sub ? <div style={{ fontSize: 11, color: C.muted }}>{sub}</div> : null}
        </div>
      </div>
    </Card>
  );
}

function RetroBadge() {
  return <span className="lt-retro" style={{ background: "#a855f7", color: "#fff", fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 6, border: "1px solid #c084fc" }}>R</span>;
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
    animation: "none",
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

function PlanetDrawer({ p, price, lvls, onClose }: { p: LivePlanet; price: number; lvls: Lvl[]; onClose: () => void }) {
  const near = lvls[0];
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 55 }} />
      <div className="lt-drawer no-print" style={drawerStyle(400)}>
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
            <MiniField label="Absolute Degree" value={<span className="lt-mono">{p.absDegree.toFixed(2)}°</span>} />
            <MiniField label="Sign" value={p.sign} />
            <MiniField label="Nakshatra" value={p.nakshatra} />
            <MiniField label="Lord" value={p.lord} />
            <MiniField label="Pada" value={<span className="lt-mono">{p.pada}</span>} />
            <MiniField label="Speed" value={<span className="lt-mono">{p.speed.toFixed(4)}</span>} />
            <MiniField label="Motion" value={<span style={{ color: p.retro ? C.red : C.green }}>{p.motion}</span>} />
            <MiniField label="Bull / Bear" value={<BullBearBadge bull={p.bull} bear={p.bear} />} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.muted, marginBottom: 8 }}>TODAY'S ASTRO LEVELS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            {(["r1", "r2", "r3", "s1", "s2", "s3"] as const).map((k) => (
              <div key={k} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px", borderLeft: `3px solid ${k.startsWith("r") ? C.red : C.green}` }}>
                <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>{k}</div>
                <div className="lt-mono" style={{ fontWeight: 800 }}>{num(p[k])}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(76,157,255,0.08)", border: `1px solid ${C.blue}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Nearest Price Level</div>
            {near ? (
              <>
                <div className="lt-mono" style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{near.kind} · {num(near.value)}</div>
                <div style={{ fontSize: 12, color: C.muted }}>Distance from live price ({num(price)}): <b className="lt-mono" style={{ color: C.text }}>{Math.round(near.distance)} pts</b></div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Status <b style={{ color: STATUS_COLOR[near.status] }}>{near.status}</b> · Signal <b style={{ color: near.signal === "BUY" ? C.green : near.signal === "SELL" ? C.red : C.gold }}>{near.signal}</b></div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function LevelChart({ planets, price }: { planets: LivePlanet[]; price: number }) {
  const series = useMemo(() => {
    const s: { name: string; data: { x: string; y: number }[] }[] = planets.map((p) => ({
      name: p.planet,
      data: [
        { x: "S1", y: p.s1 },
        { x: "R1", y: p.r1 },
      ],
    }));
    return s;
  }, [planets]);

  const options = useMemo(
    () => ({
      chart: {
        toolbar: { show: true, tools: { zoom: true, pan: true, reset: true, download: true } },
        zoom: { enabled: true },
        animations: { enabled: true },
      },
      stroke: { width: 2, curve: "straight" as const },
      colors: planets.map((p) => PLANET_STYLE[p.planet]?.line ?? "#888"),
      xaxis: { categories: ["S1", "R1"], labels: { style: { colors: "var(--eb-muted)" } } },
      yaxis: {
        labels: { style: { colors: "var(--eb-muted)" }, formatter: (v: number) => num(v) },
      },
      grid: { borderColor: "rgba(255,255,255,0.06)" },
      legend: { position: "bottom" as const, labels: { colors: "var(--eb-muted)" } },
      tooltip: { theme: "dark" as const },
      markers: { size: 4 },
      annotations: {
        yaxis: [
          {
            y: price,
            borderColor: "var(--eb-accent)",
            strokeDashArray: 4,
            label: { text: `NIFTY ${num(price)}`, style: { background: "var(--eb-accent)", color: "#000" } },
          },
        ],
      },
    }),
    [planets, price],
  );

  return <ApexChart type="line" series={series} options={options as any} height={340} />;
}
