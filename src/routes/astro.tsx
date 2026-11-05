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
import { useMarketSession } from "@/hooks/use-market-session";
import { ApexChart } from "@/components/ApexChart";
import { NewsCenter } from "@/components/NewsPopup";
import { Moon, Sunrise, Sunset, RotateCcw } from "lucide-react";
import logoUrl from "@/assets/eaglebaba-logo.png";
import { useIstClock } from "@/hooks/use-scheduler";
import { orbStyle as orbStyleFor } from "@/lib/planet-style";
import { deriveTithi, sunTimes } from "@/lib/panchang";
import { inrRound } from "@/lib/format";
import { FormulaBadge } from "@/components/FormulaBadge";
import {
  astroFormulaSlug,
  DEFAULT_ASTRO_FORMULA_VERSION,
  type AstroFormulaVersion,
} from "@/lib/engine-version";

/* ------------------------------ color tokens ------------------------------ */

const C = {
  bg: "#070a0e",
  card: "rgba(24, 24, 27, 0.5)",
  border: "rgba(39, 39, 42, 0.8)",
  green: "#10b981", // Emerald 500
  red: "#f43f5e",   // Rose 500
  gold: "#f59e0b",  // Amber 500
  blue: "#38bdf8",  // Sky 400
  purple: "#a855f7",
  text: "#f4f4f5",  // Zinc 100
  muted: "#a1a1aa", // Zinc 400
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
        content: "Daily planetary positions and NIFTY astro levels with a live signal engine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-[#070a0e] p-8 flex flex-col items-center justify-center text-center">
      <div className="card-institutional bg-zinc-900/60 border border-rose-500/30 p-8 max-w-lg rounded-xl">
        <p className="font-mono text-rose-400 text-sm mb-4">
          Astro data unavailable: {error instanceof Error ? error.message : "Unexpected error"}
        </p>
        <Link
          to="/"
          className="inline-flex items-center text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors"
        >
          ← Back to market dashboard
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-[#070a0e] p-8 flex flex-col items-center justify-center text-center">
      <div className="card-institutional bg-zinc-900/60 border border-zinc-800 p-8 max-w-lg rounded-xl">
        <p className="font-mono text-zinc-400 text-sm mb-4">Astro page not found.</p>
        <Link
          to="/"
          className="inline-flex items-center text-xs font-mono text-amber-400 hover:text-amber-300 transition-colors"
        >
          ← Back to market dashboard
        </Link>
      </div>
    </div>
  ),
});

/* ------------------------------ helpers ------------------------------ */

const num = inrRound;

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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <Card>
        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
          Current Moon Phase
        </div>
        <div className="text-xl sm:text-2xl font-bold text-zinc-100 mt-1">
          🌙 {moon.phaseName}
        </div>
        <div className="text-xs font-mono text-zinc-400 mt-1" suppressHydrationWarning>
          {moon.illumination}% illuminated · {moon.elongation}° elongation
        </div>
        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden mt-3">
          <div
            className="h-full bg-sky-400 rounded-full transition-all duration-500"
            style={{ width: `${moon.illumination}%` }}
          />
        </div>
      </Card>

      <Card className="border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-zinc-900/50 to-zinc-900/50">
        <div className="text-[10px] font-mono uppercase tracking-wider text-sky-400">
          Next New Moon 🌑
        </div>
        <div
          className="text-2xl sm:text-3xl font-extrabold text-sky-400 mt-1"
          suppressHydrationWarning
        >
          {daysLabel(moon.daysToNewMoon)}
        </div>
        <div className="text-xs font-mono text-zinc-400 mt-1" suppressHydrationWarning>
          {formatMoonDate(moon.nextNewMoon)} IST
        </div>
      </Card>

      <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-zinc-900/50 to-zinc-900/50">
        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
          Next Full Moon 🌕
        </div>
        <div
          className="text-2xl sm:text-3xl font-extrabold text-amber-400 mt-1"
          suppressHydrationWarning
        >
          {daysLabel(moon.daysToFullMoon)}
        </div>
        <div className="text-xs font-mono text-zinc-400 mt-1" suppressHydrationWarning>
          {formatMoonDate(moon.nextFullMoon)} IST
        </div>
      </Card>
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

function exportCsv(
  planets: PlanetRow[],
  version: AstroFormulaVersion = DEFAULT_ASTRO_FORMULA_VERSION,
) {
  const slug = astroFormulaSlug(version);
  const header = [
    "Planet",
    "Degree",
    "Sign",
    "Nakshatra",
    "Lord",
    "Pada",
    "Speed",
    "Motion",
    "AbsDegree",
    "R1",
    "S1",
    "R2",
    "S2",
  ];
  const rows = planets.map((p) =>
    [
      p.planet,
      p.degree,
      p.sign,
      p.nakshatra,
      p.lord,
      p.pada,
      p.speed,
      p.motion,
      p.absDegree,
      p.r1,
      p.s1,
      p.r2,
      p.s2,
    ].join(","),
  );
  downloadBlob(
    [`# EagleBABA Astro Levels · ${version}`, header.join(","), ...rows].join("\n"),
    `astro-levels-${slug}.csv`,
    "text/csv",
  );
}

function exportExcel(
  planets: PlanetRow[],
  version: AstroFormulaVersion = DEFAULT_ASTRO_FORMULA_VERSION,
) {
  const slug = astroFormulaSlug(version);
  const cells = (arr: (string | number)[]) => arr.map((c) => `<td>${c}</td>`).join("");
  const head =
    "<tr>" +
    cells([
      "Planet",
      "Degree",
      "Sign",
      "Nakshatra",
      "Lord",
      "Pada",
      "Speed",
      "Motion",
      "Abs°",
      "R1",
      "S1",
      "R2",
      "S2",
    ]) +
    "</tr>";
  const body = planets
    .map(
      (p) =>
        "<tr>" +
        cells([
          p.planet,
          p.degree,
          p.sign,
          p.nakshatra,
          p.lord,
          p.pada,
          p.speed,
          p.motion,
          p.absDegree,
          p.r1,
          p.s1,
          p.r2,
          p.s2,
        ]) +
        "</tr>",
    )
    .join("");
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
  downloadBlob(html, `astro-levels-${slug}.xls`, "application/vnd.ms-excel");
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
      className={`card-institutional bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 hover:border-amber-500/40 transition-colors rounded-xl p-4 ${className || ""}`}
      style={style}
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
  className,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div
      className={`card-institutional bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 hover:border-amber-500/40 transition-colors rounded-xl p-3 sm:p-3.5 flex flex-col justify-between ${className || ""}`}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 truncate">
        {label}
      </div>
      <div
        className="text-lg sm:text-xl lg:text-2xl font-bold text-zinc-100 mt-1"
        style={color ? { color } : undefined}
        suppressHydrationWarning
      >
        {value}
      </div>
      {sub ? (
        <div
          className="text-[11px] font-mono text-zinc-400 mt-1 truncate"
          title={sub}
          suppressHydrationWarning
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function RetroBadge() {
  return (
    <span className="bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ml-1.5">
      R
    </span>
  );
}

function RetroBiasBadge({ bias }: { bias: PlanetRow["retroBias"] }) {
  if (bias === "none") return null;
  const isBull = bias === "bull";
  const isBear = bias === "bear";
  return (
    <span
      title="Bias when this planet is retrograde"
      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ml-1.5 tracking-wider border ${
        isBull
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : isBear
            ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
            : "bg-zinc-800 text-zinc-300 border-zinc-700"
      }`}
    >
      {isBull ? "BULL R" : isBear ? "BEAR R" : "NEUTRAL R"}
    </span>
  );
}

function NakBadge({ bull, bear, name }: { bull: boolean; bear: boolean; name: string }) {
  if (!bull && !bear) return <span className="text-zinc-200">{name}</span>;
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-semibold border ${
        bull
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-rose-500/15 text-rose-400 border-rose-500/30"
      }`}
    >
      {name}
    </span>
  );
}

const proximityBadgeClass: Record<LevelEntry["proximity"], string> = {
  FLASH: "text-rose-400 animate-pulse font-bold",
  ORANGE: "text-amber-400 font-bold",
  YELLOW: "text-yellow-400 font-bold",
  BLUE: "text-sky-400 font-bold",
  NORMAL: "text-zinc-500 font-normal",
};

const statusBadgeClass: Record<LevelEntry["status"], string> = {
  BROKEN: "text-emerald-400 font-bold",
  TOUCHED: "text-amber-400 font-bold",
  ACTIVE: "text-sky-400 font-bold",
  PENDING: "text-zinc-500 font-normal",
};

function AstroDashboard() {
  const { data, isFetching, dataUpdatedAt, refetch } = useSuspenseQuery(astroQuery());
  const clock = useIstClock();
  const session = useMarketSession();
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

  const isBuy = signal.signal === "BUY";
  const isSell = signal.signal === "SELL";
  const signalColorHex = isBuy ? C.green : isSell ? C.red : C.gold;
  const signalTextColor = isBuy ? "text-emerald-400" : isSell ? "text-rose-400" : "text-amber-400";
  const signalBgClass = isBuy
    ? "from-emerald-500/15 via-zinc-900/60 to-zinc-900/60 border-emerald-500/40"
    : isSell
      ? "from-rose-500/15 via-zinc-900/60 to-zinc-900/60 border-rose-500/40"
      : "from-amber-500/15 via-zinc-900/60 to-zinc-900/60 border-amber-500/40";
  const signalBarBg = isBuy ? "bg-emerald-500" : isSell ? "bg-rose-500" : "bg-amber-500";

  const lastUpdated = new Date(dataUpdatedAt).toLocaleTimeString("en-GB", {
    hour12: false,
    timeZone: "Asia/Kolkata",
  });

  const nearest = signal.nearest;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#070a0e] text-zinc-400 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-wide">
            🪐 EagleBABA - Astro Levels Dashboard
          </div>
          <div className="mt-2 text-xs font-mono text-zinc-500">
            Loading planetary &amp; market data…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070a0e] text-zinc-100 font-sans selection:bg-amber-500/20 selection:text-amber-200">
      <div className="eb-space-bg" aria-hidden="true" />

      <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-4 overflow-x-hidden relative z-1">
        {/* Header */}
        <header className="flex flex-wrap justify-between items-center gap-3 pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-3.5">
            <img
              src={logoUrl}
              alt="EagleBABA logo"
              width={48}
              height={48}
              className="w-12 h-12 rounded-xl object-cover shadow-[0_0_16px_rgba(212,175,55,0.35)] ring-1 ring-amber-500/30"
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                <span>🪐 EagleBABA - Astro Levels Dashboard</span>
              </h1>
              <div className="text-xs font-mono text-zinc-400 mt-0.5 flex flex-wrap items-center gap-2">
                <span>Mumbai · Asia/Kolkata · {todayIstLabel()}</span>
                <span className="text-zinc-600">|</span>
                <span className="text-amber-400/90">Planets fixed @ 09:00 IST</span>
              </div>
              <div className="mt-1.5">
                <FormulaBadge version={data.formulaVersion} compact />
              </div>
            </div>
          </div>

          <div className="no-print flex items-center flex-wrap gap-2.5">
            <span className="font-mono text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800 px-2.5 py-1 rounded-md">
              IST {clock}
            </span>
            <span
              className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md border ${
                session.isOpen
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-zinc-800/60 text-zinc-400 border-zinc-700/60"
              }`}
            >
              {session.isOpen ? "● MARKET OPEN" : `○ MARKET ${session.status}`}
            </span>
            <Link
              to="/"
              className="text-xs font-mono text-sky-400 hover:text-sky-300 border border-sky-500/30 bg-sky-500/10 px-3 py-1 rounded-md transition-colors"
            >
              Market View
            </Link>
            <NewsCenter />
            <ThemeToggle />
          </div>
        </header>

        {/* Layout with Sidebar + Main Content + Right Panels */}
        <div className="flex gap-4 items-start w-full">
          <AppSidebar />

          <main className="flex-1 min-w-0 w-full space-y-4">
            {isFetching ? (
              <div className="no-print font-mono text-xs text-amber-400 animate-pulse flex items-center gap-2">
                <span>⟳ Updating planetary &amp; price data…</span>
              </div>
            ) : null}

            {/* Top Metric Band: 5 columns */}
            <section
              id="signals"
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
            >
              {/* Card 1: Signal */}
              <div
                className={`card-institutional bg-gradient-to-br ${signalBgClass} border rounded-xl p-3 sm:p-4 flex flex-col justify-between`}
              >
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Active Signal
                </div>
                <div className={`text-2xl sm:text-3xl font-extrabold ${signalTextColor} mt-1 flex items-center gap-1.5`}>
                  <span>{signal.emoji}</span>
                  <span>{signal.signal}</span>
                </div>
                <div className="text-xs font-mono text-zinc-300 mt-1 flex justify-between items-center">
                  <span>{signal.strength}</span>
                  <span className="font-bold text-zinc-100">{signal.confidence}%</span>
                </div>
                <div className="h-1.5 w-full bg-zinc-800/80 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full ${signalBarBg} rounded-full transition-all duration-500`}
                    style={{ width: `${signal.confidence}%` }}
                  />
                </div>
              </div>

              {/* Card 2: Live NIFTY */}
              <Stat
                label="Live NIFTY"
                value={<span className="font-mono text-sky-400">{data.livePrice.toLocaleString("en-IN")}</span>}
                sub={`Prev close ${data.prevClose.toLocaleString("en-IN")}`}
              />

              {/* Card 3: Nearest Level */}
              <Stat
                label="Nearest Level"
                value={nearest ? <span className="font-mono text-amber-400">{num(nearest.value)}</span> : "—"}
                sub={nearest ? `${nearest.label} · ${Math.round(nearest.distance)} pts` : undefined}
              />

              {/* Card 4: Bias */}
              <Stat
                label="Bias"
                value={
                  signal.confidence >= 60
                    ? "Bullish"
                    : signal.confidence <= 40
                      ? "Bearish"
                      : "Neutral"
                }
                color={
                  signal.confidence >= 60 ? C.green : signal.confidence <= 40 ? C.red : C.gold
                }
                sub={`${data.bullCount} bull · ${data.bearCount} bear nakshatra`}
              />

              {/* Card 5: Days to Moon Phase */}
              <Stat
                label={`Next Phase (${data.moonPhase.daysToNewMoon <= data.moonPhase.daysToFullMoon ? "New Moon" : "Full Moon"})`}
                value={
                  <span className="font-mono text-amber-300">
                    {daysLabel(Math.min(data.moonPhase.daysToNewMoon, data.moonPhase.daysToFullMoon))}
                  </span>
                }
                sub={`${data.moonPhase.phaseName} · ${data.moonPhase.illumination}% lit`}
              />
            </section>

            {/* Signal Reasoning */}
            <div className="card-institutional bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 rounded-xl p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-2">
                Signal Reasoning
              </div>
              <div className="flex flex-wrap gap-2">
                {signal.reasons.map((r, i) => (
                  <span
                    key={i}
                    className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono px-2.5 py-1 rounded-md"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>

            {/* Middle Astro Metrics: 7 columns */}
            <section
              id="nakshatra"
              className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3"
            >
              <Stat label="Moon Sign" value={data.moonSign} />
              <Stat label="Moon Nakshatra" value={data.moonNakshatra} />
              <Stat
                label="Moon Degree"
                value={<span className="font-mono">{data.moonDegree.toFixed(2)}°</span>}
              />
              <Stat
                label="Retrograde"
                value={data.retroCount}
                color={data.retroCount >= 3 ? C.red : undefined}
                sub={`${data.retroCount} in Vakri`}
              />
              <Stat label="Bull Nakshatra" value={data.bullCount} color={C.green} />
              <Stat label="Bear Nakshatra" value={data.bearCount} color={C.red} />
              <Stat
                label="Day EMA 13"
                value={
                  <span className="font-mono">{data.ema13 != null ? num(data.ema13) : "—"}</span>
                }
                color={
                  data.emaBias === "Bullish" ? C.green : data.emaBias === "Bearish" ? C.red : undefined
                }
                sub={
                  data.emaBias
                    ? `${data.emaBias} · price ${data.emaBias === "Bullish" ? "above" : "below"} EMA 13`
                    : "day timeframe"
                }
              />
            </section>

            {/* Moon Phase & Upcoming New/Full Moon countdown cards */}
            <MoonPhaseSection moon={data.moonPhase} />

            {/* Responsive Right Panels on Mobile/Tablet */}
            <div className="block xl:hidden">
              <RightPanelContent data={data} />
            </div>

            {/* Bottom Visual Gauges: 3 columns */}
            <section id="analysis" className="scroll-mt-24">
              <AstroCharts
                confidence={signal.confidence}
                signalColor={signalColorHex}
                bullCount={data.bullCount}
                bearCount={data.bearCount}
                planets={data.planets}
              />
            </section>

            {/* Nearest Astro Levels */}
            <section id="levels" className="scroll-mt-24 space-y-2.5">
              <div className="flex justify-between items-center px-1">
                <span className="font-mono text-xs uppercase tracking-wider text-zinc-300 font-bold">
                  NEAREST ASTRO LEVELS
                </span>
                <span className="text-[11px] font-mono text-zinc-400">
                  Sorted by distance to live price
                </span>
              </div>
              <LevelCards board={board} />
            </section>

            {/* Controls Bar */}
            <div className="no-print flex flex-wrap gap-2.5 items-center justify-between pt-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search planet / sign / nakshatra…"
                aria-label="Search planets, signs or nakshatras"
                className="bg-zinc-950/70 border border-zinc-800 focus:border-amber-500/60 focus:outline-none text-zinc-100 text-xs rounded-lg px-3 py-2 min-w-[200px] flex-1 sm:max-w-xs transition-colors font-mono"
              />
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={() => exportCsv(data.planets, data.formulaVersion)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all font-mono cursor-pointer"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => exportExcel(data.planets, data.formulaVersion)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition-all font-mono cursor-pointer"
                >
                  Export Excel
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-all font-mono cursor-pointer"
                >
                  Print
                </button>
                <button
                  onClick={() => refetch()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-all font-mono cursor-pointer"
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* Planetary Positions Grid */}
            <section id="planets" className="scroll-mt-24 space-y-3">
              <div className="font-mono text-xs uppercase tracking-wider text-zinc-300 font-bold px-1">
                PLANETARY POSITIONS ({filtered.length} BODIES)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filtered.map((p) => (
                  <PlanetCard key={p.planet} p={p} />
                ))}
              </div>
            </section>

            {/* Astro Level Table */}
            <section className="card-institutional bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 rounded-xl overflow-hidden">
              <div className="p-3 sm:p-4 border-b border-zinc-800/80 flex flex-wrap justify-between items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-zinc-200 tracking-wider font-mono">
                  ASTRO LEVELS (R1 / S1 / R2 / S2)
                </span>
                <span className="text-[11px] font-mono text-zinc-400">
                  Base {data.cycles.base} · Upper {num(data.cycles.upper)} · Lower{" "}
                  {num(data.cycles.lower)}
                </span>
              </div>
              <div className="table-responsive-container">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-950/70 border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                      <th className="py-2.5 px-3">Planet</th>
                      <th className="py-2.5 px-3">Degree</th>
                      <th className="py-2.5 px-3">R1</th>
                      <th className="py-2.5 px-3">S1</th>
                      <th className="py-2.5 px-3">R2</th>
                      <th className="py-2.5 px-3">S2</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {filtered.map((p) => (
                      <tr key={p.planet} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-zinc-200">{p.planet}</td>
                        <td className="py-2.5 px-3 text-zinc-300">{p.degree.toFixed(2)}°</td>
                        <td className="py-2.5 px-3 text-rose-400 font-semibold">{num(p.r1)}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold">{num(p.s1)}</td>
                        <td className="py-2.5 px-3 text-rose-400 font-semibold">{num(p.r2)}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold">{num(p.s2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="font-mono text-[11px] text-zinc-500 text-center py-2">
              Last updated {lastUpdated} IST · Auto-refresh every 45s
            </div>

            <Disclaimer />
          </main>

          {/* Dedicated Right Panel on Desktop (xl+) */}
          <aside className="hidden xl:flex xl:w-72 xl:shrink-0 flex-col gap-3">
            <RightPanelContent data={data} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
 * Premium planet visuals + right panel + luxury level cards + charts
 * ================================================================== */

const sunTimesMumbai = () => sunTimes(19.076, 72.8777);

function PlanetCard({ p }: { p: PlanetRow }) {
  const strength = Math.max(8, Math.min(100, Math.round((Math.abs(p.speed) / 13) * 100)));
  const isRetro = p.retro;
  return (
    <div
      className="card-institutional bg-zinc-900/50 backdrop-blur-md border border-zinc-800/80 hover:border-amber-500/40 rounded-xl p-3.5 flex flex-col gap-3 transition-all"
      style={orbStyleFor(p.planet)}
    >
      <div className="flex items-center gap-3">
        <div className="eb-planet-orb w-11 h-11 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-zinc-100 text-sm tracking-wide">{p.planet}</span>
            {isRetro ? <RetroBadge /> : null}
          </div>
          <div className="font-mono text-xs text-zinc-400">
            {p.degree.toFixed(2)}° · {p.sign}
          </div>
        </div>
        <span
          className={`ml-auto text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
            isRetro
              ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
              : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
          }`}
        >
          {p.motion}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs pt-1 border-t border-zinc-800/60">
        <Field
          label="Nakshatra"
          value={<NakBadge bull={p.bull} bear={p.bear} name={p.nakshatra} />}
        />
        <Field label="Lord" value={<span className="text-zinc-200">{p.lord}</span>} />
        <Field label="Pada" value={<span className="font-mono text-zinc-300">{p.pada}</span>} />
        <Field label="Speed" value={<span className="font-mono text-zinc-300">{p.speed.toFixed(3)}</span>} />
        <Field label="Abs°" value={<span className="font-mono text-zinc-300">{p.absDegree.toFixed(2)}°</span>} />
        {isRetro ? (
          <Field label="Bias" value={<RetroBiasBadge bias={p.retroBias} />} />
        ) : (
          <span />
        )}
      </div>

      <div className="pt-1">
        <div className="flex justify-between text-[10px] font-mono text-zinc-400 mb-1">
          <span>PLANET STRENGTH</span>
          <span>{strength}%</span>
        </div>
        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full"
            style={{ width: `${strength}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
        {label}
      </span>
      <span className="font-semibold text-xs text-zinc-200 truncate">{value}</span>
    </div>
  );
}

function LevelCards({ board }: { board: LevelEntry[] }) {
  return (
    <div className="table-responsive-container pb-2">
      <div className="flex gap-2.5 min-w-max sm:grid sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 sm:min-w-0">
        {board.slice(0, 8).map((e, i) => {
          const isRes = e.isResistance;
          return (
            <div
              key={e.label}
              className={`card-institutional bg-zinc-900/60 backdrop-blur-md rounded-xl p-3 flex flex-col justify-between transition-all w-48 sm:w-auto shrink-0 sm:shrink border ${
                i === 0
                  ? "border-amber-500/80 shadow-[0_0_18px_rgba(245,158,11,0.25)] ring-1 ring-amber-500/40"
                  : isRes
                    ? "border-zinc-800/80 hover:border-rose-500/40"
                    : "border-zinc-800/80 hover:border-emerald-500/40"
              }`}
              style={{ borderLeftWidth: 4, borderLeftColor: isRes ? "#f43f5e" : "#10b981" }}
            >
              <div className="flex justify-between items-center gap-1">
                <span className="font-bold text-xs text-zinc-200 truncate">
                  {e.label}{" "}
                  <span
                    className={`text-[10px] font-mono ${
                      isRes ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    ({isRes ? "R" : "S"})
                  </span>
                </span>
                {i === 0 ? (
                  <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1 py-0.2 rounded">
                    NEAREST
                  </span>
                ) : null}
              </div>
              <div className="font-mono text-xl sm:text-2xl font-black text-zinc-100 my-1">
                {num(e.value)}
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono pt-1 border-t border-zinc-800/60">
                <span className="text-zinc-400">
                  Δ <b className="text-zinc-200">{Math.round(e.distance)}</b>
                </span>
                <span className={proximityBadgeClass[e.proximity]}>
                  {e.proximity === "NORMAL" ? "—" : `● ${e.proximity}`}
                </span>
                <span className={statusBadgeClass[e.status]}>{e.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RightPanelContent({ data }: { data: AstroData }) {
  const tithi = deriveTithi(data.moonPhase.elongation);
  const sun = sunTimesMumbai();
  const retro = data.planets.filter((p) => p.retro);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 xl:flex xl:flex-col gap-3 w-full">
      {/* Panchang Now */}
      <Card className="border-amber-500/20">
        <div className="flex items-center gap-2 mb-2.5">
          <Moon size={16} className="text-amber-400" />
          <span className="font-mono text-xs uppercase tracking-wider text-amber-300 font-bold">
            PANCHANG NOW
          </span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="eb-planet-orb w-10 h-10 shrink-0"
            style={orbStyleFor("Moon")}
          />
          <div>
            <div className="text-sm font-bold text-zinc-100">{data.moonPhase.phaseName}</div>
            <div className="font-mono text-xs text-zinc-400" suppressHydrationWarning>
              {data.moonPhase.illumination}% lit
            </div>
          </div>
        </div>
        <PanelRow label="Moon Sign" value={data.moonSign} />
        <PanelRow label="Nakshatra" value={data.moonNakshatra} />
        <PanelRow label="Tithi" value={`${tithi.paksha} ${tithi.name}`} />
        <PanelRow
          label="Moon Degree"
          value={<span className="font-mono text-zinc-300">{data.moonDegree.toFixed(2)}°</span>}
        />
      </Card>

      {/* Sunrise / Sunset */}
      <Card>
        <div className="flex justify-around items-center text-center">
          <div>
            <Sunrise size={20} className="text-amber-400 mx-auto" />
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mt-1">
              SUNRISE
            </div>
            <div className="font-mono text-sm font-bold text-zinc-200" suppressHydrationWarning>
              {sun.sunrise}
            </div>
          </div>
          <div className="w-px h-8 bg-zinc-800" />
          <div>
            <Sunset size={20} className="text-purple-400 mx-auto" />
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mt-1">
              SUNSET
            </div>
            <div className="font-mono text-sm font-bold text-zinc-200" suppressHydrationWarning>
              {sun.sunset}
            </div>
          </div>
        </div>
        <div className="text-[10px] font-mono text-zinc-500 text-center mt-2.5">
          Mumbai · Asia/Kolkata
        </div>
      </Card>

      {/* Retrograde */}
      <Card>
        <div className="flex items-center gap-2 mb-2.5">
          <RotateCcw size={15} className="text-rose-400" />
          <span className="font-mono text-xs uppercase tracking-wider text-zinc-300 font-bold">
            RETROGRADE
          </span>
          <span className="ml-auto text-[11px] font-mono text-zinc-400">
            {retro.length} active
          </span>
        </div>
        {retro.length === 0 ? (
          <div className="text-xs text-zinc-500 font-mono">All planets direct.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {retro.map((p) => (
              <span
                key={p.planet}
                className="inline-flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1 text-xs font-mono text-rose-300"
              >
                <span
                  className="eb-planet-orb w-3 h-3 shrink-0"
                  style={orbStyleFor(p.planet)}
                />
                {p.planet}
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PanelRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-t border-zinc-800/60 text-xs">
      <span className="text-zinc-400 font-mono">{label}</span>
      <span className="font-semibold text-zinc-200">{value}</span>
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Chart 1: Signal Confidence */}
      <Card>
        <div className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2">
          SIGNAL CONFIDENCE
        </div>
        <ApexChart
          type="radialBar"
          height={240}
          width="100%"
          series={[confidence]}
          options={{
            labels: ["Confidence"],
            colors: [signalColor],
            plotOptions: {
              radialBar: {
                hollow: { size: "62%" },
                track: { background: "rgba(255,255,255,0.04)" },
                dataLabels: {
                  name: { color: "#a1a1aa", fontSize: "12px" },
                  value: { color: "#f4f4f5", fontSize: "28px", fontWeight: 800 },
                },
              },
            },
            stroke: { lineCap: "round" },
          }}
        />
      </Card>

      {/* Chart 2: Nakshatra Bias */}
      <Card>
        <div className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2">
          NAKSHATRA BIAS
        </div>
        <ApexChart
          type="donut"
          height={240}
          width="100%"
          series={[bullCount, bearCount, neutralCount]}
          options={{
            labels: ["Bullish", "Bearish", "Neutral"],
            colors: ["#10b981", "#f43f5e", "#71717a"],
            legend: { position: "bottom", labels: { colors: "#a1a1aa" } },
            dataLabels: { enabled: true },
            stroke: { width: 0 },
            plotOptions: { pie: { donut: { size: "68%" } } },
          }}
        />
      </Card>

      {/* Chart 3: Planetary Speed */}
      <Card>
        <div className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2">
          PLANETARY SPEED (°/day)
        </div>
        <ApexChart
          type="area"
          height={240}
          width="100%"
          series={[
            { name: "Speed", data: speedPlanets.map((p) => Number(Math.abs(p.speed).toFixed(3))) },
          ]}
          options={{
            colors: ["#f59e0b"],
            xaxis: {
              categories: speedPlanets.map((p) => p.planet),
              labels: { style: { colors: "#a1a1aa", fontSize: "10px" }, rotate: -40 },
            },
            yaxis: { labels: { style: { colors: "#a1a1aa" } } },
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
