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

const C = {
  bg: "#0B1220",
  card: "#111827",
  border: "#1f2937",
  green: "#16A34A",
  red: "#DC2626",
  orange: "#F59E0B",
  blue: "#2563EB",
  text: "#E5E7EB",
  muted: "#94A3B8",
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
});

/* ------------------------------ helpers ------------------------------ */

const num = (n: number) => Math.round(n).toLocaleString("en-IN");

function useIstClock() {
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("en-GB", {
          hour12: false,
          timeZone: "Asia/Kolkata",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

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
      className={className}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
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
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? C.text, marginTop: 4 }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div> : null}
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

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--eb-head, 'Rajdhani', system-ui, sans-serif)" }}>
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
        .astro-mono { font-family:'Share Tech Mono', ui-monospace, monospace; }
      `}</style>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 16px 40px" }}>
        {/* Header */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>
              🪐 Astro Levels Dashboard
            </h1>
            <div style={{ fontSize: 12, color: C.muted }}>
              Mumbai · Asia/Kolkata · {todayIstLabel()}
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
          </div>
        </div>

        {isFetching ? (
          <div className="no-print astro-mono" style={{ fontSize: 11, color: C.orange, marginBottom: 8 }}>
            ⟳ Updating planetary & price data…
          </div>
        ) : null}

        {/* Signal cards */}
        <div className="astro-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginBottom: 14 }}>
          <Card
            style={{
              gridColumn: "span 1",
              background: `linear-gradient(135deg, ${signalColor}22, ${C.card})`,
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
        <div className="astro-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 16 }}>
          <Stat label="Moon Sign" value={data.moonSign} />
          <Stat label="Moon Nakshatra" value={data.moonNakshatra} />
          <Stat label="Moon Degree" value={<span className="astro-mono">{data.moonDegree.toFixed(2)}°</span>} />
          <Stat label="Retrograde" value={data.retroCount} color={data.retroCount >= 3 ? C.red : C.text} />
          <Stat label="Bull Nakshatra" value={data.bullCount} color={C.green} />
          <Stat label="Bear Nakshatra" value={data.bearCount} color={C.red} />
          <Stat label="Ayanamsa" value={<span className="astro-mono">{data.ayanamsa.toFixed(3)}°</span>} />
          <Stat label="Prev Close" value={<span className="astro-mono">{data.prevClose.toLocaleString("en-IN")}</span>} sub={data.prevDate} />
        </div>

        {/* Moon phase & upcoming New/Full Moon countdown */}
        <MoonPhaseSection moon={data.moonPhase} />

        {/* Nearest level board */}
        <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, letterSpacing: 1 }}>NEAREST ASTRO LEVELS</span>
            <span style={{ fontSize: 11, color: C.muted }}>Sorted by distance to live price</span>
          </div>
          <div style={{ overflowX: "auto", maxHeight: 340 }}>
            <table className="astro-table">
              <thead>
                <tr>
                  <th>Level</th><th>Planet</th><th>Value</th><th>Distance</th><th>Proximity</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {board.slice(0, 12).map((e, i) => {
                  const glow = e.highlight === "red-glow" || e.highlight === "green-glow";
                  return (
                    <tr
                      key={e.label}
                      className={i === 0 && glow ? "astro-flash" : undefined}
                      style={{
                        background: highlightBg[e.highlight],
                        boxShadow: i === 0 ? `inset 3px 0 0 ${C.blue}` : undefined,
                      }}
                    >
                      <td style={{ fontWeight: 700 }}>
                        {e.label}{" "}
                        <span style={{ color: e.isResistance ? C.red : C.green, fontSize: 11 }}>
                          ({e.isResistance ? "R" : "S"})
                        </span>
                      </td>
                      <td>{e.planet}</td>
                      <td className="astro-mono">{num(e.value)}</td>
                      <td className="astro-mono">{Math.round(e.distance)}</td>
                      <td>
                        <span style={{ color: proximityColor[e.proximity], fontWeight: 700, fontSize: 11 }}>
                          {e.proximity === "NORMAL" ? "—" : `● ${e.proximity}`}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: statusColor[e.status], fontWeight: 700, fontSize: 11 }}>
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Controls */}
        <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search planet / sign / nakshatra…"
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

        {/* Planet positions table */}
        <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontWeight: 700, letterSpacing: 1 }}>
            PLANETARY POSITIONS
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="astro-table">
              <thead>
                <tr>
                  <th>Planet</th><th>Degree</th><th>Sign</th><th>Nakshatra</th><th>Lord</th>
                  <th>Pada</th><th>Speed</th><th>Motion</th><th>Abs°</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.planet}>
                    <td style={{ fontWeight: 700 }}>
                      {p.planet}
                      {p.retro ? <RetroBadge /> : null}
                    </td>
                    <td className="astro-mono">{p.degree.toFixed(2)}°</td>
                    <td>{p.sign}</td>
                    <td><NakBadge bull={p.bull} bear={p.bear} name={p.nakshatra} /></td>
                    <td>{p.lord}</td>
                    <td className="astro-mono">{p.pada}</td>
                    <td className="astro-mono">{p.speed.toFixed(3)}</td>
                    <td style={{ color: p.retro ? C.red : C.green, fontWeight: 700 }}>{p.motion}</td>
                    <td className="astro-mono">{p.absDegree.toFixed(2)}°</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

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