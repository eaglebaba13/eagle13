import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { getAstro, type AstroData } from "@/lib/astro.functions";
import {
  buildLevelBoard,
  computeSignal,
  type PlanetRow,
  type LevelEntry,
  type MoonPhaseInfo,
} from "@/lib/astro-levels";
import { Disclaimer } from "@/components/Disclaimer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppSidebar } from "@/components/AppSidebar";
import { ApexChart } from "@/components/ApexChart";
import { NewsCenter } from "@/components/NewsPopup";
import { Moon, Sunrise, Sunset, RotateCcw } from "lucide-react";
import logoUrl from "@/assets/eaglebaba-logo.png";
import { useIstClock } from "@/hooks/use-scheduler";

const C = {
  bg: "var(--eb-bg)",
  card: "var(--eb-card)",
  border: "var(--eb-border)",
  green: "var(--eb-bull)",
  red: "var(--eb-bear)",
  orange: "var(--eb-accent)",
  blue: "var(--eb-blue)",
  text: "var(--eb-text)",
  muted: "var(--eb-muted)",
};

const astroQuery = () =>
  queryOptions({
    queryKey: ["astro"],
    queryFn: () => getAstro(),
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/astro")({
  loader: ({ context }) => context.queryClient.ensureQueryData(astroQuery()),
  component: AstroDashboard,
  head: () => ({
    meta: [
      { title: "Astro Levels | Daily NIFTY Planetary Support & Resistance" },
      {
        name: "description",
        content:
          "Auto-updating Vedic astro trading dashboard: planetary positions, nakshatra, retrograde tracking, and NIFTY astro support/resistance levels with a live BUY/SELL/WAIT signal engine.",
      },
      { property: "og:title", content: "Astro Levels | NIFTY Planetary Dashboard" },
      {
        property: "og:description",
        content:
          "Daily planetary positions and NIFTY astro levels with a live signal engine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 40, color: C.red }}>
      <p style={{ fontFamily: "var(--eb-mono)" }}>
        Astro data unavailable: {error.message}
      </p>
      <Link to="/" style={{ color: C.blue }}>
        ← Back to market dashboard
      </Link>
    </div>
  ),
  notFoundComponent: () => (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 40, color: C.muted }}>
      <p style={{ fontFamily: "var(--eb-mono)" }}>Astro page not found.</p>
      <Link to="/" style={{ color: C.blue }}>
        ← Back to market dashboard
      </Link>
    </div>
  ),
});

/* ------------------------------ helpers ------------------------------ */

const num = (n: number) => Math.round(n).toLocaleString("en-IN");

function todayIstLabel() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function formatMoonDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function daysLabel(d: number) {
  if (d < 1) return "Today";
  const whole = Math.floor(d);
  return `in ${d.toFixed(1)} day${whole === 1 ? "" : "s"}`;
}

function MoonPhaseSection({ moon }: { moon: MoonPhaseInfo }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="astro-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
        <Card>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
            Current Moon Phase
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            🌙 {moon.phaseName}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }} suppressHydrationWarning>
            {moon.illumination}% illuminated · {moon.elongation}° elongation
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4, marginTop: 8 }}>
            <div style={{ height: "100%", width: `${moon.illumination}%`, background: C.blue, borderRadius: 4 }} />
          </div>
        </Card>

        <Card style={{ border: `1px solid ${C.border}`, background: `linear-gradient(135deg, rgba(37,99,235,0.12), ${C.card})` }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
            Next New Moon 🌑
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.blue, marginTop: 4 }} suppressHydrationWarning>
            {daysLabel(moon.daysToNewMoon)}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }} suppressHydrationWarning>
            {formatMoonDate(moon.nextNewMoon)} IST
          </div>
        </Card>

        <Card style={{ border: `1px solid ${C.border}`, background: `linear-gradient(135deg, rgba(245,158,11,0.12), ${C.card})` }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
            Next Full Moon 🌕
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.orange, marginTop: 4 }} suppressHydrationWarning>
            {daysLabel(moon.daysToFullMoon)}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }} suppressHydrationWarning>
            {formatMoonDate(moon.nextFullMoon)} IST
          </div>
        </Card>
      </div>
    </div>
  );
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(planets: PlanetRow[]) {
  const header = [
    "Planet", "Degree", "Sign", "Nakshatra", "Lord", "Pada", "Speed",
    "Motion", "AbsDegree", "R1", "S1", "R2", "S2",
  ];
  const rows = planets.map((p) =>
    [p.planet, p.degree, p.sign, p.nakshatra, p.lord, p.pada, p.speed,
     p.motion, p.absDegree, p.r1, p.s1, p.r2, p.s2].join(","),
  );
  downloadBlob([header.join(","), ...rows].join("\n"), "astro-levels.csv", "text/csv");
}

function exportExcel(planets: PlanetRow[]) {
  const cells = (arr: (string | number)[]) =>
    arr.map((c) => `<td>${c}</td>`).join("");
  const head =
    "<tr>" +
    cells(["Planet", "Degree", "Sign", "Nakshatra", "Lord", "Pada", "Speed", "Motion", "Abs°", "R1", "S1", "R2", "S2"]) +
    "</tr>";
  const body = planets
    .map((p) =>
      "<tr>" +
      cells([p.planet, p.degree, p.sign, p.nakshatra, p.lord, p.pada, p.speed, p.motion, p.absDegree, p.r1, p.s1, p.r2, p.s2]) +
      "</tr>",
    )
    .join("");
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
  downloadBlob(html, "astro-levels.xls", "application/vnd.ms-excel");
}

/* -------------------------------- UI -------------------------------- */

function Card({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`eb-card eb-glass${className ? ` ${className}` : ""}`}
      style={{
        borderRadius: 16,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  sub?: string;
}) {
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? C.text, marginTop: 4 }} suppressHydrationWarning>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }} suppressHydrationWarning>{sub}</div> : null}
    </Card>
  );
}

function RetroBadge() {
  return (
    <span
      style={{
        background: C.red,
        color: "#fff",
        fontSize: 10,
        fontWeight: 700,
        padding: "1px 6px",
        borderRadius: 4,
        marginLeft: 6,
      }}
    >
      R
    </span>
  );
}

function RetroBiasBadge({ bias }: { bias: PlanetRow["retroBias"] }) {
  if (bias === "none") return null;
  const map = {
    bull: { bg: "rgba(22,163,74,0.18)", col: "#4ade80", bd: C.green, txt: "BULL" },
    bear: { bg: "rgba(220,38,38,0.18)", col: "#f87171", bd: C.red, txt: "BEAR" },
    neutral: { bg: "rgba(148,163,184,0.18)", col: "#cbd5e1", bd: C.muted, txt: "NEUTRAL" },
  }[bias];
  return (
    <span
      title="Bias when this planet is retrograde"
      style={{
        background: map.bg,
        color: map.col,
        border: `1px solid ${map.bd}`,
        fontSize: 9,
        fontWeight: 700,
        padding: "1px 6px",
        borderRadius: 4,
        marginLeft: 6,
        letterSpacing: 0.5,
      }}
    >
      {map.txt} R
    </span>
  );
}

function NakBadge({ bull, bear, name }: { bull: boolean; bear: boolean; name: string }) {
  if (!bull && !bear) return <>{name}</>;
  return (
    <span
      style={{
        background: bull ? "rgba(22,163,74,0.18)" : "rgba(220,38,38,0.18)",
        color: bull ? "#4ade80" : "#f87171",
        border: `1px solid ${bull ? C.green : C.red}`,
        padding: "1px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {name}
    </span>
  );
}

const highlightBg: Record<LevelEntry["highlight"], string> = {
  "red-glow": "rgba(220,38,38,0.28)",
  "green-glow": "rgba(22,163,74,0.28)",
  red: "rgba(220,38,38,0.12)",
  green: "rgba(22,163,74,0.12)",
  yellow: "rgba(245,158,11,0.14)",
  none: "transparent",
};

const proximityColor: Record<LevelEntry["proximity"], string> = {
  FLASH: C.red,
  ORANGE: C.orange,
  YELLOW: "#eab308",
  BLUE: C.blue,
  NORMAL: C.muted,
};

const statusColor: Record<LevelEntry["status"], string> = {
  BROKEN: C.green,
  TOUCHED: C.orange,
  ACTIVE: C.blue,
  PENDING: C.muted,
};

function AstroDashboard() {
  const { data, isFetching, dataUpdatedAt, refetch } = useSuspenseQuery(astroQuery());
  const clock = useIstClock();
  const [query, setQuery] = useState("");

  const board = useMemo(
    () => buildLevelBoard(data.planets, data.livePrice),
    [data.planets, data.livePrice],
  );
  const signal = useMemo(
    () =>
      computeSignal({
        price: data.livePrice,
        board,
        moonNakshatra: data.moonNakshatra,
        retroCount: data.retroCount,
        totalPlanets: data.planets.length,
        bullRetroCount: data.bullRetroCount,
        bearRetroCount: data.bearRetroCount,
        emaBias: data.emaBias,
      }),
    [board, data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.planets;
    return data.planets.filter(
      (p) =>
        p.planet.toLowerCase().includes(q) ||
        p.sign.toLowerCase().includes(q) ||
        p.nakshatra.toLowerCase().includes(q) ||
        p.lord.toLowerCase().includes(q),
    );
  }, [query, data.planets]);

  const signalColor =
    signal.signal === "BUY" ? C.green : signal.signal === "SELL" ? C.red : C.orange;

  const lastUpdated = new Date(dataUpdatedAt).toLocaleTimeString("en-GB", {
    hour12: false,
    timeZone: "Asia/Kolkata",
  });

  const nearest = signal.nearest;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div
        style={{
          background: C.bg,
          minHeight: "100vh",
          color: C.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--eb-head, system-ui, sans-serif)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.text }}>🪐 EagleBABA - Astro Levels Dashboard</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>Loading planetary &amp; market data…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--eb-head, system-ui, sans-serif)" }}>
      <div className="eb-space-bg" aria-hidden="true" />
      <style>{`
        .astro-grid { display:grid; gap:12px; }
        @media print {
          .no-print { display:none !important; }
          body { background:#fff !important; }
        }
        @keyframes astroPulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        .astro-flash { animation: astroPulse 1s infinite; }
        .astro-table { width:100%; border-collapse:collapse; font-size:13px; }
        .astro-table th { text-align:left; color:${C.muted}; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.5px; padding:8px 10px; border-bottom:1px solid ${C.border}; position:sticky; top:0; background:${C.card}; }
        .astro-table td { padding:8px 10px; border-bottom:1px solid ${C.border}; }
        .astro-mono { font-family:var(--eb-mono, ui-monospace, monospace); }
      `}</style>

      <div style={{ maxWidth: 1480, margin: "0 auto", padding: "18px 16px 40px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img
              src={logoUrl}
              alt="EagleBABA logo"
              width={52}
              height={52}
              style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", boxShadow: "0 0 16px rgba(212,175,55,0.35)" }}
            />
            <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>
              🪐 EagleBABA - Astro Levels Dashboard
            </h1>
            <div style={{ fontSize: 12, color: C.muted }}>
              Mumbai · Asia/Kolkata · {todayIstLabel()} · Planets fixed @ 09:00 IST
            </div>
            </div>
          </div>
          <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="astro-mono" style={{ fontSize: 13, color: C.muted }}>IST {clock}</span>
            <span
              style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 6, fontWeight: 700,
                background: data.marketState === "OPEN" ? "rgba(22,163,74,0.15)" : "rgba(148,163,184,0.15)",
                color: data.marketState === "OPEN" ? C.green : C.muted,
              }}
            >
              {data.marketState === "OPEN" ? "● MARKET OPEN" : "○ MARKET CLOSED"}
            </span>
            <Link to="/" style={{ fontSize: 12, color: C.blue, textDecoration: "none", border: `1px solid ${C.border}`, padding: "5px 10px", borderRadius: 8 }}>
              Market View
            </Link>
            <NewsCenter />
            <ThemeToggle />
          </div>
        </div>

        <div className="eb-astro-layout" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <AppSidebar />
          <main style={{ flex: 1, minWidth: 0 }}>

        {isFetching ? (
          <div className="no-print astro-mono" style={{ fontSize: 11, color: C.orange, marginBottom: 8 }}>
            ⟳ Updating planetary & price data…
          </div>
        ) : null}

        {/* Signal cards */}
        <div id="signals" className="astro-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginBottom: 14 }}>
          <Card
            style={{
              gridColumn: "span 1",
              background: `linear-gradient(135deg, color-mix(in oklab, ${signalColor} 14%, transparent), ${C.card})`,
              border: `1px solid ${signalColor}`,
            }}
          >
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
              Active Signal
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: signalColor, lineHeight: 1.1, marginTop: 4 }}>
              {signal.emoji} {signal.signal}
            </div>
            <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>
              {signal.strength} · <b>{signal.confidence}%</b>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4, marginTop: 8 }}>
              <div style={{ height: "100%", width: `${signal.confidence}%`, background: signalColor, borderRadius: 4, transition: "width .5s" }} />
            </div>
          </Card>
          <Stat label="Live NIFTY" value={<span className="astro-mono">{data.livePrice.toLocaleString("en-IN")}</span>} color={C.blue} sub={`Prev close ${data.prevClose.toLocaleString("en-IN")}`} />
          <Stat
            label="Nearest Level"
            value={nearest ? <span className="astro-mono">{num(nearest.value)}</span> : "—"}
            color={C.orange}
            sub={nearest ? `${nearest.label} · ${Math.round(nearest.distance)} pts` : undefined}
          />
          <Stat
            label="Bias"
            value={signal.confidence >= 60 ? "Bullish" : signal.confidence <= 40 ? "Bearish" : "Neutral"}
            color={signal.confidence >= 60 ? C.green : signal.confidence <= 40 ? C.red : C.orange}
            sub={`${data.bullCount} bull · ${data.bearCount} bear nakshatra`}
          />
        </div>

        {/* Reason */}
        <Card style={{ marginBottom: 14, padding: 12 }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Signal Reasoning
          </div>
          <div style={{ fontSize: 13, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {signal.reasons.map((r, i) => (
              <span key={i} style={{ background: "rgba(37,99,235,0.12)", border: `1px solid ${C.blue}`, padding: "2px 8px", borderRadius: 6 }}>
                {r}
              </span>
            ))}
          </div>
        </Card>

        {/* Summary cards */}
        <div id="nakshatra" className="astro-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 16 }}>
          <Stat label="Moon Sign" value={data.moonSign} />
          <Stat label="Moon Nakshatra" value={data.moonNakshatra} />
          <Stat label="Moon Degree" value={<span className="astro-mono">{data.moonDegree.toFixed(2)}°</span>} />
          <Stat label="Retrograde" value={data.retroCount} color={data.retroCount >= 3 ? C.red : C.text} />
          <Stat label="Bull Nakshatra" value={data.bullCount} color={C.green} />
          <Stat label="Bear Nakshatra" value={data.bearCount} color={C.red} />
          <Stat
            label="Day EMA 13"
            value={<span className="astro-mono">{data.ema13 != null ? num(data.ema13) : "—"}</span>}
            color={data.emaBias === "Bullish" ? C.green : data.emaBias === "Bearish" ? C.red : C.text}
            sub={data.emaBias ? `${data.emaBias} · price ${data.emaBias === "Bullish" ? "above" : "below"} EMA 13` : "day timeframe"}
          />
          <Stat
            label="Bullish Retro"
            value={data.bullRetroCount}
            color={data.bullRetroCount > 0 ? C.green : C.text}
            sub="Mars / Jupiter Vakri"
          />
          <Stat
            label="Bearish Retro"
            value={data.bearRetroCount}
            color={data.bearRetroCount > 0 ? C.red : C.text}
            sub="Mercury / Saturn Vakri"
          />
          <Stat label="Ayanamsa" value={<span className="astro-mono">{data.ayanamsa.toFixed(3)}°</span>} />
          <Stat label="Prev Close" value={<span className="astro-mono">{data.prevClose.toLocaleString("en-IN")}</span>} sub={data.prevDate} />
        </div>

        {/* Moon phase & upcoming New/Full Moon countdown */}
        <MoonPhaseSection moon={data.moonPhase} />

        {/* Premium charts */}
        <div id="analysis" style={{ scrollMarginTop: 90 }}>
          <AstroCharts
            confidence={signal.confidence}
            signalColor={signalColor}
            bullCount={data.bullCount}
            bearCount={data.bearCount}
            planets={data.planets}
          />
        </div>

        {/* Nearest support/resistance — luxury glass cards */}
        <div id="levels" style={{ scrollMarginTop: 90, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontWeight: 700, letterSpacing: 1 }}>NEAREST ASTRO LEVELS</span>
            <span style={{ fontSize: 11, color: C.muted }}>Sorted by distance to live price</span>
          </div>
          <LevelCards board={board} />
        </div>

        {/* Controls */}
        <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search planet / sign / nakshatra…"
            aria-label="Search planets, signs or nakshatras"
            style={{
              background: C.bg, border: `1px solid ${C.border}`, color: C.text,
              padding: "8px 12px", borderRadius: 8, fontSize: 13, minWidth: 220, flex: "1 1 220px",
            }}
          />
          <button onClick={() => exportCsv(data.planets)} style={btn(C.green)}>Export CSV</button>
          <button onClick={() => exportExcel(data.planets)} style={btn(C.blue)}>Export Excel</button>
          <button onClick={() => window.print()} style={btn(C.orange)}>Print</button>
          <button onClick={() => refetch()} style={btn(C.muted)}>Refresh</button>
        </div>

        {/* Planetary positions — premium cards */}
        <div id="planets" style={{ scrollMarginTop: 90, marginBottom: 16 }}>
          <div style={{ padding: "0 2px 10px", fontWeight: 700, letterSpacing: 1 }}>PLANETARY POSITIONS</div>
          <div className="astro-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(268px,1fr))" }}>
            {filtered.map((p) => (
              <PlanetCard key={p.planet} p={p} />
            ))}
          </div>
        </div>

        {/* Astro level table */}
        <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, letterSpacing: 1 }}>ASTRO LEVELS (R1 / S1 / R2 / S2)</span>
            <span className="astro-mono" style={{ fontSize: 11, color: C.muted }}>
              Base {data.cycles.base} · Upper {num(data.cycles.upper)} · Lower {num(data.cycles.lower)}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="astro-table">
              <thead>
                <tr><th>Planet</th><th>Degree</th><th>R1</th><th>S1</th><th>R2</th><th>S2</th></tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.planet}>
                    <td style={{ fontWeight: 700 }}>{p.planet}</td>
                    <td className="astro-mono">{p.degree.toFixed(2)}</td>
                    <td className="astro-mono" style={{ color: C.red }}>{num(p.r1)}</td>
                    <td className="astro-mono" style={{ color: C.green }}>{num(p.s1)}</td>
                    <td className="astro-mono" style={{ color: C.red }}>{num(p.r2)}</td>
                    <td className="astro-mono" style={{ color: C.green }}>{num(p.s2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="astro-mono" style={{ fontSize: 11, color: C.muted, textAlign: "center", marginBottom: 16 }}>
          Last updated {lastUpdated} IST · Auto-refresh every 45s
        </div>

        <Disclaimer />
          </main>
          <RightPanel data={data} />
        </div>
      </div>
    </div>
  );
}

function btn(color: string): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${color}`,
    color,
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}

/* ==================================================================
 * Premium planet visuals + right panel + luxury level cards + charts
 * (presentation only — all values come from existing computed data)
 * ================================================================== */

const PLANET_STYLE: Record<string, { orb: string; glow: string }> = {
  Sun: { orb: "radial-gradient(circle at 35% 30%, #ffe9a8, #f5a623 55%, #b8620b)", glow: "rgba(245,166,35,0.6)" },
  Moon: { orb: "radial-gradient(circle at 35% 30%, #ffffff, #cfd8e3 55%, #8b98a8)", glow: "rgba(207,216,227,0.55)" },
  Mercury: { orb: "radial-gradient(circle at 35% 30%, #c7f7d4, #34d399 55%, #0f7a4f)", glow: "rgba(52,211,153,0.55)" },
  Venus: { orb: "radial-gradient(circle at 35% 30%, #ffe3ec, #f4a6c0 55%, #c76b8e)", glow: "rgba(244,166,192,0.55)" },
  Mars: { orb: "radial-gradient(circle at 35% 30%, #ffb4a0, #ef4444 55%, #7f1d1d)", glow: "rgba(239,68,68,0.6)" },
  Jupiter: { orb: "radial-gradient(circle at 35% 30%, #fff2b0, #eab308 55%, #a16207)", glow: "rgba(234,179,8,0.6)" },
  Saturn: { orb: "radial-gradient(circle at 35% 30%, #cfe0ee, #64748b 55%, #334155)", glow: "rgba(100,116,139,0.55)" },
  Rahu: { orb: "radial-gradient(circle at 35% 30%, #e9d5ff, #a855f7 55%, #6b21a8)", glow: "rgba(168,85,247,0.6)" },
  Ketu: { orb: "radial-gradient(circle at 35% 30%, #ffd9b0, #f97316 55%, #9a3412)", glow: "rgba(249,115,22,0.6)" },
};

function orbStyleFor(planet: string): React.CSSProperties {
  const s = PLANET_STYLE[planet] ?? { orb: "#888", glow: "rgba(255,255,255,0.35)" };
  return { ["--orb" as any]: s.orb, ["--orb-glow" as any]: s.glow };
}

const PAKSHA_TITHI = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi",
  "Trayodashi", "Chaturdashi", "Purnima/Amavasya",
];

// Tithi derived from Sun-Moon elongation (each tithi spans 12°).
function deriveTithi(elongation: number): { name: string; paksha: string } {
  const e = ((elongation % 360) + 360) % 360;
  const idx = Math.floor(e / 12); // 0..29
  const paksha = idx < 15 ? "Shukla" : "Krishna";
  const within = idx % 15;
  const name = within === 14 ? (idx < 15 ? "Purnima" : "Amavasya") : PAKSHA_TITHI[within];
  return { name, paksha };
}

// Lightweight sunrise/sunset for Mumbai (presentational NOAA approximation).
function sunTimesMumbai(): { sunrise: string; sunset: string } {
  const lat = 19.076, lng = 72.8777, tz = 5.5;
  const now = new Date(Date.now() + tz * 3600 * 1000);
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const day = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start) / 86400000);
  const rad = Math.PI / 180;
  const decl = 23.45 * Math.sin(rad * (360 / 365) * (day - 81));
  const cosH = -Math.tan(lat * rad) * Math.tan(decl * rad);
  const clamped = Math.max(-1, Math.min(1, cosH));
  const H = Math.acos(clamped) / rad; // half-day arc in degrees
  const solarNoon = 12 - lng / 15 + tz; // local clock solar noon
  const toHM = (h: number) => {
    const hh = Math.floor(((h % 24) + 24) % 24);
    const mm = Math.round((h - Math.floor(h)) * 60);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  };
  return { sunrise: toHM(solarNoon - H / 15), sunset: toHM(solarNoon + H / 15) };
}

function PlanetCard({ p }: { p: PlanetRow }) {
  const strength = Math.max(8, Math.min(100, Math.round((Math.abs(p.speed) / 13) * 100)));
  return (
    <div className="eb-card eb-glass eb-planet-card" style={orbStyleFor(p.planet)}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="eb-planet-orb" style={{ width: 54, height: 54 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>{p.planet}</span>
            {p.retro ? <RetroBadge /> : null}
          </div>
          <div className="astro-mono" style={{ fontSize: 12, color: C.muted }}>
            {p.degree.toFixed(2)}° · {p.sign}
          </div>
        </div>
        <span
          style={{
            marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            color: p.retro ? C.red : C.green,
            background: p.retro ? "rgba(225,29,72,0.14)" : "rgba(16,185,129,0.14)",
            border: `1px solid ${p.retro ? C.red : C.green}`,
          }}
        >
          {p.motion}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: 12.5 }}>
        <Field label="Nakshatra" value={<NakBadge bull={p.bull} bear={p.bear} name={p.nakshatra} />} />
        <Field label="Lord" value={p.lord} />
        <Field label="Pada" value={<span className="astro-mono">{p.pada}</span>} />
        <Field label="Speed" value={<span className="astro-mono">{p.speed.toFixed(3)}</span>} />
        <Field label="Abs°" value={<span className="astro-mono">{p.absDegree.toFixed(2)}°</span>} />
        {p.retro ? <Field label="Bias" value={<RetroBiasBadge bias={p.retroBias} />} /> : <span />}
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginBottom: 3 }}>
          <span>PLANET STRENGTH</span><span className="astro-mono">{strength}%</span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
          <div style={{ height: "100%", width: `${strength}%`, borderRadius: 4, background: "var(--eb-gold-grad)" }} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function LevelCards({ board }: { board: LevelEntry[] }) {
  return (
    <div className="astro-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
      {board.slice(0, 8).map((e, i) => {
        const col = e.isResistance ? C.red : C.green;
        return (
          <div
            key={e.label}
            className={`eb-card eb-glass eb-level-card${i === 0 ? " is-nearest" : ""}`}
            style={{ borderLeft: `3px solid ${col}` }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700 }}>
                {e.label}{" "}
                <span style={{ color: col, fontSize: 11 }}>({e.isResistance ? "R" : "S"})</span>
              </span>
              {i === 0 ? (
                <span style={{ fontSize: 9, fontWeight: 700, color: C.blue, letterSpacing: 1 }}>NEAREST</span>
              ) : null}
            </div>
            <div className="astro-mono" style={{ fontSize: 24, fontWeight: 800, color: C.text }}>
              {num(e.value)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: C.muted }}>Dist <b className="astro-mono" style={{ color: C.text }}>{Math.round(e.distance)}</b></span>
              <span style={{ color: proximityColor[e.proximity], fontWeight: 700 }}>
                {e.proximity === "NORMAL" ? "—" : `● ${e.proximity}`}
              </span>
              <span style={{ color: statusColor[e.status], fontWeight: 700 }}>{e.status}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RightPanel({ data }: { data: AstroData }) {
  const tithi = deriveTithi(data.moonPhase.elongation);
  const sun = sunTimesMumbai();
  const retro = data.planets.filter((p) => p.retro);
  return (
    <aside className="eb-rightpanel">
      <div className="eb-card eb-glass eb-anim-border" style={{ borderRadius: 18, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Moon size={16} color="var(--eb-neutral)" />
          <span style={{ fontWeight: 700, letterSpacing: 1, fontSize: 13 }}>PANCHANG NOW</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div className="eb-planet-orb" style={{ width: 46, height: 46, ...orbStyleFor("Moon") }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{data.moonPhase.phaseName}</div>
            <div className="astro-mono" style={{ fontSize: 11, color: C.muted }} suppressHydrationWarning>
              {data.moonPhase.illumination}% lit
            </div>
          </div>
        </div>
        <PanelRow label="Moon Sign" value={data.moonSign} />
        <PanelRow label="Nakshatra" value={data.moonNakshatra} />
        <PanelRow label="Tithi" value={`${tithi.paksha} ${tithi.name}`} />
        <PanelRow label="Moon Degree" value={<span className="astro-mono">{data.moonDegree.toFixed(2)}°</span>} />
      </div>

      <div className="eb-card eb-glass" style={{ borderRadius: 18, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
          <div>
            <Sunrise size={20} color="var(--eb-accent)" />
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>SUNRISE</div>
            <div className="astro-mono" style={{ fontWeight: 700 }} suppressHydrationWarning>{sun.sunrise}</div>
          </div>
          <div style={{ width: 1, background: C.border }} />
          <div>
            <Sunset size={20} color="var(--eb-bn)" />
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>SUNSET</div>
            <div className="astro-mono" style={{ fontWeight: 700 }} suppressHydrationWarning>{sun.sunset}</div>
          </div>
        </div>
        <div style={{ fontSize: 9, color: C.muted, textAlign: "center", marginTop: 8 }}>Mumbai · Asia/Kolkata</div>
      </div>

      <div className="eb-card eb-glass" style={{ borderRadius: 18, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <RotateCcw size={15} color="var(--eb-bear)" />
          <span style={{ fontWeight: 700, letterSpacing: 1, fontSize: 13 }}>RETROGRADE</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>{retro.length} active</span>
        </div>
        {retro.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted }}>All planets direct.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {retro.map((p) => (
              <span key={p.planet} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(225,29,72,0.12)", border: `1px solid ${C.red}`, borderRadius: 8, padding: "4px 8px", fontSize: 12 }}>
                <span className="eb-planet-orb" style={{ width: 14, height: 14, ...orbStyleFor(p.planet) }} />
                {p.planet}
              </span>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function PanelRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function AstroCharts({
  confidence,
  signalColor,
  bullCount,
  bearCount,
  planets,
}: {
  confidence: number;
  signalColor: string;
  bullCount: number;
  bearCount: number;
  planets: PlanetRow[];
}) {
  const neutralCount = Math.max(0, planets.length - bullCount - bearCount);
  const speedPlanets = planets.filter((p) => Math.abs(p.speed) > 0);
  return (
    <div className="astro-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", marginBottom: 16 }}>
      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: C.muted }}>SIGNAL CONFIDENCE</div>
        <ApexChart
          type="radialBar"
          height={240}
          series={[confidence]}
          options={{
            labels: ["Confidence"],
            colors: [signalColor],
            plotOptions: {
              radialBar: {
                hollow: { size: "62%" },
                track: { background: "rgba(255,255,255,0.06)" },
                dataLabels: {
                  name: { color: C.muted, fontSize: "12px" },
                  value: { color: C.text, fontSize: "30px", fontWeight: 800 },
                },
              },
            },
            stroke: { lineCap: "round" },
          }}
        />
      </Card>
      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: C.muted }}>NAKSHATRA BIAS</div>
        <ApexChart
          type="donut"
          height={240}
          series={[bullCount, bearCount, neutralCount]}
          options={{
            labels: ["Bullish", "Bearish", "Neutral"],
            colors: ["#10b981", "#e11d48", "#7d8fac"],
            legend: { position: "bottom", labels: { colors: C.muted } },
            dataLabels: { enabled: true },
            stroke: { width: 0 },
            plotOptions: { pie: { donut: { size: "68%" } } },
          }}
        />
      </Card>
      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: C.muted }}>PLANETARY SPEED (°/day)</div>
        <ApexChart
          type="area"
          height={240}
          series={[{ name: "Speed", data: speedPlanets.map((p) => Number(Math.abs(p.speed).toFixed(3))) }]}
          options={{
            colors: ["#d4af37"],
            xaxis: {
              categories: speedPlanets.map((p) => p.planet),
              labels: { style: { colors: C.muted, fontSize: "10px" }, rotate: -40 },
            },
            yaxis: { labels: { style: { colors: C.muted } } },
            dataLabels: { enabled: false },
            stroke: { curve: "smooth", width: 2 },
            fill: { type: "gradient", gradient: { opacityFrom: 0.5, opacityTo: 0 } },
            grid: { borderColor: "rgba(255,255,255,0.06)" },
            tooltip: { theme: "dark" },
          }}
        />
      </Card>
    </div>
  );
}