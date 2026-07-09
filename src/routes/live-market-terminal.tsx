import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import {
  getLiveLevels,
  type LiveLevelsData,
  type MarketBlock,
  type MarketKey,
} from "@/lib/live-levels.functions";
import { buildLevelBoard, computeSignal, type SignalKind } from "@/lib/astro-levels";
import {
  fmtClock,
  fmtDur,
  moonEvents,
  planetEvents,
  nseSession,
  mcxSession,
  cryptoSession,
  type SessionState,
} from "@/lib/terminal-clock";
import { AppSidebar, MobileBottomNav } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApexChart } from "@/components/ApexChart";
import { Disclaimer } from "@/components/Disclaimer";
import { NewsCenter } from "@/components/NewsPopup";
import {
  Activity,
  Bell,
  Clock,
  Globe,
  Moon,
  Orbit,
  Radio,
  TrendingUp,
  TrendingDown,
  Minus,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

const C = {
  bg: "var(--eb-bg)",
  card: "var(--eb-card)",
  border: "var(--eb-border)",
  green: "var(--eb-bull)",
  red: "var(--eb-bear)",
  gold: "var(--eb-accent)",
  blue: "var(--eb-blue)",
  electric: "var(--eb-electric)",
  text: "var(--eb-text)",
  muted: "var(--eb-muted)",
  yellow: "#eab308",
};

// Astro data (positions/levels) refresh; also carries live prices. One request
// covers both — positions barely move between ticks, no calculation is changed.
const REFRESH_MS = 10_000;

const dataQuery = () =>
  queryOptions({
    queryKey: ["live-market-terminal"],
    queryFn: () => getLiveLevels(),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/live-market-terminal")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dataQuery()),
  component: LiveMarketTerminal,
  head: () => ({
    meta: [
      { title: "Live Astro Market Terminal | EagleBABA" },
      {
        name: "description",
        content:
          "Enterprise-grade live Astro market terminal — market session clocks, R1/R2/R3 & S1/S2/S3 Astro levels, predictive BUY/SELL/WAIT signals, Moon & planetary event countdowns and a live Astro clock for NIFTY 50, BANK NIFTY, GOLD, SILVER and BTC.",
      },
      { property: "og:title", content: "Live Astro Market Terminal | EagleBABA" },
      {
        property: "og:description",
        content:
          "Bloomberg-style Astro trading terminal: live sessions, levels, predictive signals and countdown clocks.",
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

/* ------------------------------ helpers ------------------------------ */

const PLANET_STYLE: Record<string, string> = {
  Sun: "radial-gradient(circle at 35% 30%, #ffe9a8, #f5a623 55%, #b8620b)",
  Moon: "radial-gradient(circle at 35% 30%, #ffffff, #cfd8e3 55%, #8b98a8)",
  Mercury: "radial-gradient(circle at 35% 30%, #c7f7d4, #34d399 55%, #0f7a4f)",
  Venus: "radial-gradient(circle at 35% 30%, #ffe3ec, #f4a6c0 55%, #c76b8e)",
  Mars: "radial-gradient(circle at 35% 30%, #ffb4a0, #ef4444 55%, #7f1d1d)",
  Jupiter: "radial-gradient(circle at 35% 30%, #fff2b0, #eab308 55%, #a16207)",
  Saturn: "radial-gradient(circle at 35% 30%, #cfe0ee, #64748b 55%, #334155)",
  Rahu: "radial-gradient(circle at 35% 30%, #e9d5ff, #a855f7 55%, #6b21a8)",
  Ketu: "radial-gradient(circle at 35% 30%, #ffd9b0, #f97316 55%, #9a3412)",
};

const SESSION_COLOR: Record<string, string> = {
  green: C.green,
  red: C.red,
  yellow: C.yellow,
  blue: C.blue,
  muted: C.muted,
};

const MARKET_ORDER: { key: MarketKey; label: string }[] = [
  { key: "NIFTY", label: "NIFTY 50" },
  { key: "BANKNIFTY", label: "BANK NIFTY" },
  { key: "GOLD", label: "GOLD" },
  { key: "SILVER", label: "SILVER" },
  { key: "BTC", label: "BTC" },
];

function fmtMoney(m: MarketBlock, n: number): string {
  const inr = m.currency === "₹";
  return (
    m.currency +
    (inr
      ? Math.round(n).toLocaleString("en-IN")
      : n.toLocaleString("en-US", { maximumFractionDigits: 2 }))
  );
}

function useNow(intervalMs = 1000): number {
  // Start from a deterministic value so SSR and first client render match;
  // the real clock starts ticking only after mount (avoids hydration drift).
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// True only after the client has mounted. Lets a real-time terminal render a
// deterministic skeleton during SSR/first paint, avoiding hydration mismatch.
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

// Responsive breakpoint helper for inline-styled layouts. Returns false during
// SSR/first paint (deterministic) and updates after mount.
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const update = () => setMatches(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function TerminalSkeleton() {
  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--eb-body)" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "16px 20px 60px", maxWidth: 1560, margin: "0 auto" }}>
        <AppSidebar />
        <main style={{ flex: 1, minWidth: 0 }}>
          <div className="eb-card eb-glass" style={{ padding: 20, borderRadius: 16, borderColor: C.gold }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Radio size={22} style={{ color: C.gold }} />
              <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, fontFamily: "var(--eb-head)", background: "var(--eb-gold-grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                LIVE ASTRO MARKET TERMINAL
              </h1>
            </div>
            <p className="eb-shimmer" style={{ marginTop: 14, padding: "6px 12px", borderRadius: 6, display: "inline-block", color: C.muted, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
              Syncing live sessions, planetary positions & Astro levels…
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

function signalColor(s: SignalKind): string {
  return s === "BUY" ? C.green : s === "SELL" ? C.red : C.yellow;
}

/* -------------------- prediction (presentation only) -------------------- */

type Prediction = {
  key: MarketKey;
  label: string;
  price: number;
  current: SignalKind;
  currentConf: number;
  next: SignalKind;
  nextConf: number;
  expectedAt: number; // epoch ms
  bias: "Bullish" | "Bearish" | "Neutral";
  reason: string;
  nearestLabel: string;
  nearestValue: number;
  nearestDist: number;
  isResistance: boolean;
};

function predict(
  m: MarketBlock,
  data: LiveLevelsData,
  moon: { abs: number; speed: number; pada: number },
  nowMs: number,
): Prediction {
  const label = MARKET_ORDER.find((x) => x.key === m.key)?.label ?? m.name;
  const board = buildLevelBoard(m.planets, m.livePrice);
  const cur = computeSignal({
    price: m.livePrice,
    board,
    moonNakshatra: data.moonNakshatra,
    retroCount: data.retroCount,
    totalPlanets: m.planets.length,
    bullRetroCount: data.bullRetroCount,
    bearRetroCount: data.bearRetroCount,
  });
  const nearest = board[0];
  const me = moonEvents(moon.abs, moon.speed, moon.pada);

  let next: SignalKind;
  let expectedAt: number;
  let reason: string;
  let nextConf: number;

  if (me.nextNakshatra.bias === "Bull") {
    next = "BUY";
    expectedAt = nowMs + me.nextNakshatra.msRemaining;
    nextConf = Math.min(96, cur.confidence + 14);
    reason = `Moon enters ${me.nextNakshatra.name} (bullish) in ${fmtDur(me.nextNakshatra.msRemaining)}`;
  } else if (me.nextNakshatra.bias === "Bear") {
    next = "SELL";
    expectedAt = nowMs + me.nextNakshatra.msRemaining;
    nextConf = Math.min(96, 100 - cur.confidence + 10);
    reason = `Moon enters ${me.nextNakshatra.name} (bearish) in ${fmtDur(me.nextNakshatra.msRemaining)}`;
  } else {
    // Neutral nakshatra ahead — anchor on nearest level & pada change.
    expectedAt = nowMs + me.nextPada.msRemaining;
    if (nearest && nearest.isResistance && nearest.distance <= 20) {
      next = m.livePrice > nearest.value ? "BUY" : "SELL";
      reason =
        m.livePrice > nearest.value
          ? `Price cleared ${nearest.label} — breakout continuation likely`
          : `Price testing ${nearest.label} — rejection risk`;
    } else if (nearest && !nearest.isResistance && nearest.distance <= 20) {
      next = m.livePrice < nearest.value ? "SELL" : "BUY";
      reason =
        m.livePrice < nearest.value
          ? `Price broke ${nearest.label} — downside continuation`
          : `Price holding ${nearest.label} — bounce likely`;
    } else {
      next = "WAIT";
      reason = `Price ranging between levels; Moon changes pada in ${fmtDur(me.nextPada.msRemaining)}`;
    }
    nextConf = cur.confidence;
  }

  const bias: Prediction["bias"] =
    cur.confidence >= 60 ? "Bullish" : cur.confidence <= 40 ? "Bearish" : "Neutral";

  return {
    key: m.key,
    label,
    price: m.livePrice,
    current: cur.signal,
    currentConf: cur.confidence,
    next,
    nextConf,
    expectedAt,
    bias,
    reason,
    nearestLabel: nearest?.label ?? "—",
    nearestValue: nearest?.value ?? 0,
    nearestDist: nearest?.distance ?? 0,
    isResistance: nearest?.isResistance ?? false,
  };
}

/* ------------------------- signal history store ------------------------- */

type HistRow = {
  id: string;
  instrument: string;
  predictedSignal: SignalKind;
  predictedAt: number;
  actualAt: number;
  reason: string;
};

const HIST_KEY = "eb-lmt-signal-history";

function loadHist(): HistRow[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/* ------------------------------ UI atoms ------------------------------ */

function StatChip({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "6px 12px",
        borderRadius: 10,
        background: "color-mix(in srgb, var(--eb-card) 60%, transparent)",
        border: `1px solid ${C.border}`,
        minWidth: 92,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 9.5, letterSpacing: 0.6, color: C.muted, textTransform: "uppercase", fontFamily: "var(--eb-mono)" }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: color ?? C.text, fontFamily: "var(--eb-mono)" }}>{value}</span>
    </div>
  );
}

function Ring({ pct, color, size = 44, label }: { pct: number; color: string; size?: number; label?: string }) {
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={off}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      {label ? (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" transform={`rotate(90 ${size / 2} ${size / 2})`} fontSize={10} fontFamily="var(--eb-mono)" fill={color} fontWeight={700}>
          {label}
        </text>
      ) : null}
    </svg>
  );
}

function Panel({ title, icon, children, accent }: { title: string; icon?: React.ReactNode; children: React.ReactNode; accent?: string }) {
  return (
    <section className="eb-card eb-glass" style={{ padding: 16, borderRadius: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: accent ?? C.gold, display: "flex" }}>{icon}</span>
        <h2 style={{ fontSize: 12.5, letterSpacing: 1, textTransform: "uppercase", color: C.text, fontFamily: "var(--eb-head)", fontWeight: 700, margin: 0 }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function SignalBadge({ s, conf }: { s: SignalKind; conf?: number }) {
  const c = signalColor(s);
  const Icon = s === "BUY" ? TrendingUp : s === "SELL" ? TrendingDown : Minus;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.5,
        color: c,
        background: `color-mix(in srgb, ${c} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 45%, transparent)`,
        fontFamily: "var(--eb-mono)",
      }}
    >
      <Icon size={13} /> {s}
      {conf != null ? <span style={{ opacity: 0.75 }}>· {conf}%</span> : null}
    </span>
  );
}

/* ------------------------------ sessions ------------------------------ */

function SessionCard({ s, extra }: { s: SessionState; extra?: React.ReactNode }) {
  const c = SESSION_COLOR[s.color];
  return (
    <div className="eb-card" style={{ padding: 14, borderRadius: 14, borderColor: `color-mix(in srgb, ${c} 40%, ${C.border})` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "var(--eb-head)" }}>{s.market}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.5,
            color: c,
            padding: "2px 8px",
            borderRadius: 999,
            background: `color-mix(in srgb, ${c} 15%, transparent)`,
            fontFamily: "var(--eb-mono)",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {s.isOpen ? <span className="eb-live-dot" style={{ background: c }} /> : null}
          {s.status}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.muted, fontFamily: "var(--eb-mono)", marginBottom: 8 }}>
        <span>Open {s.open}</span>
        <span>Close {s.close}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: C.border, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ width: `${s.progressPct}%`, height: "100%", background: c, transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: "var(--eb-mono)" }}>{s.next}</span>
        {s.countdownMs > 0 ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: "var(--eb-mono)" }}>{fmtDur(s.countdownMs)}</span>
        ) : null}
      </div>
      {s.note ? <div style={{ fontSize: 9.5, color: C.muted, marginTop: 6, fontFamily: "var(--eb-mono)" }}>{s.note}</div> : null}
      {extra}
    </div>
  );
}

/* ------------------------------ main view ------------------------------ */

function LiveMarketTerminal() {
  const { data } = useSuspenseQuery(dataQuery());
  const now = useNow(1000);
  const hydrated = useHydrated();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isTablet = useMediaQuery("(max-width: 900px)");

  const [tab, setTab] = useState<MarketKey>("NIFTY");
  const [sound, setSound] = useState(false);
  const [notes, setNotes] = useState<{ id: string; text: string; kind: SignalKind }[]>([]);
  const [history, setHistory] = useState<HistRow[]>(() => loadHist());
  const lastSignalRef = useRef<Record<string, SignalKind>>({});
  const firedRef = useRef<Set<string>>(new Set());

  const moon = data.planets.find((p) => p.planet === "Moon")!;
  const moonInfo = { abs: moon.absDegree, speed: moon.speed, pada: moon.pada };
  const me = useMemo(() => moonEvents(moon.absDegree, moon.speed, moon.pada), [moon.absDegree, moon.speed, moon.pada]);
  const pe = useMemo(
    () =>
      planetEvents(
        data.planets.map((p) => ({
          planet: p.planet,
          absDegree: p.absDegree,
          speed: p.speed,
          sign: p.sign,
          nakshatra: p.nakshatra,
          retro: p.retro,
        })),
      ),
    [data.planets],
  );

  const nse = nseSession(now);
  const gold = mcxSession("MCX GOLD", now);
  const silver = mcxSession("MCX SILVER", now);
  const crypto = cryptoSession(now);

  const predictions = useMemo(
    () => data.markets.map((m) => predict(m, data, moonInfo, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, Math.floor(now / 5000)],
  );

  const activeMarket = data.markets.find((m) => m.key === tab) ?? data.markets[0];
  const activePred = predictions.find((p) => p.key === (activeMarket?.key ?? tab));

  const bias = data.bullCount > data.bearCount ? "Bullish" : data.bearCount > data.bullCount ? "Bearish" : "Neutral";
  const retroPlanets = data.planets.filter((p) => p.retro);

  // Signal history: record when a market's current signal changes.
  useEffect(() => {
    let changed = false;
    const next = [...history];
    for (const p of predictions) {
      const prev = lastSignalRef.current[p.key];
      if (prev && prev !== p.current) {
        next.unshift({
          id: `${p.key}-${Date.now()}`,
          instrument: p.label,
          predictedSignal: p.current,
          predictedAt: p.expectedAt,
          actualAt: Date.now(),
          reason: p.reason,
        });
        changed = true;
      }
      lastSignalRef.current[p.key] = p.current;
    }
    if (changed) {
      const trimmed = next.slice(0, 100);
      setHistory(trimmed);
      try {
        localStorage.setItem(HIST_KEY, JSON.stringify(trimmed));
      } catch {
        /* ignore quota */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictions]);

  // Notifications: 15/10/5/1 min before + activation of the active prediction.
  useEffect(() => {
    if (!activePred) return;
    const remaining = activePred.expectedAt - now;
    const thresholds: { mins: number; label: string }[] = [
      { mins: 15, label: "15 min" },
      { mins: 10, label: "10 min" },
      { mins: 5, label: "5 min" },
      { mins: 1, label: "1 min" },
      { mins: 0, label: "now" },
    ];
    for (const t of thresholds) {
      const key = `${activePred.key}-${activePred.next}-${Math.floor(activePred.expectedAt / 60000)}-${t.mins}`;
      const winMs = t.mins === 0 ? 1500 : 3000;
      if (remaining <= t.mins * 60000 && remaining > t.mins * 60000 - winMs && !firedRef.current.has(key)) {
        firedRef.current.add(key);
        const text =
          t.mins === 0
            ? `${activePred.next} activating on ${activePred.label}`
            : `${activePred.next} on ${activePred.label} in ${t.label}`;
        setNotes((n) => [{ id: key, text, kind: activePred.next }, ...n].slice(0, 6));
        if (sound && typeof window !== "undefined") {
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.frequency.value = activePred.next === "BUY" ? 880 : activePred.next === "SELL" ? 330 : 550;
            g.gain.value = 0.08;
            o.start();
            o.stop(ctx.currentTime + 0.18);
          } catch {
            /* audio blocked */
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, activePred?.expectedAt, activePred?.next]);

  const unread = notes.length;

  if (!hydrated) return <TerminalSkeleton />;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--eb-body)" }}>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          padding: isMobile ? "12px 12px 96px" : "16px 20px 60px",
          maxWidth: 1560,
          margin: "0 auto",
        }}
      >
        <AppSidebar />
        <main style={{ flex: 1, minWidth: 0 }}>
        {/* ============================ HEADER ============================ */}
        <TerminalHeader
          data={data}
          now={now}
          moonPada={moon.pada}
          bias={bias}
          nse={nse}
          unread={unread}
          sound={sound}
          onToggleSound={() => setSound((v) => !v)}
          isMobile={isMobile}
        />

        {/* ========================= MARKET SESSIONS ===================== */}
        <Panel title="Live Market Sessions" icon={<Radio size={16} />}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            <SessionCard s={nse} extra={nse.note ? undefined : undefined} />
            <SessionCard s={gold} />
            <SessionCard s={silver} />
            <SessionCard
              s={crypto}
              extra={
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: C.muted, marginTop: 6, fontFamily: "var(--eb-mono)" }}>
                  <span>IST {fmtClock(now)}</span>
                  <span>UTC {fmtClock(now, "UTC")}</span>
                </div>
              }
            />
          </div>
        </Panel>

        <div style={{ height: 16 }} />

        {/* =================== PREDICTION + MOON/PLANET/CLOCK ============ */}
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 16 }}>
          {/* Next signal prediction */}
          <Panel title="Next Signal Prediction Engine" icon={<Zap size={16} />} accent={C.electric}>
            {activePred ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: "var(--eb-mono)" }}>CURRENT</span>
                    <SignalBadge s={activePred.current} conf={activePred.currentConf} />
                  </div>
                  <span style={{ color: C.muted, fontSize: 20 }}>→</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: "var(--eb-mono)" }}>NEXT</span>
                    <SignalBadge s={activePred.next} conf={activePred.nextConf} />
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: "var(--eb-mono)" }}>EXPECTED IN</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: signalColor(activePred.next), fontFamily: "var(--eb-mono)" }}>
                      {fmtDur(activePred.expectedAt - now)}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "color-mix(in srgb, var(--eb-card) 55%, transparent)",
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div style={{ fontSize: 10, color: C.electric, fontFamily: "var(--eb-mono)", marginBottom: 4, letterSpacing: 0.5 }}>
                    ⚡ AI REASONING · {activePred.label}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{activePred.reason}</div>
                  <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", fontSize: 10.5, color: C.muted, fontFamily: "var(--eb-mono)" }}>
                    <span>Bias: <b style={{ color: activePred.bias === "Bullish" ? C.green : activePred.bias === "Bearish" ? C.red : C.yellow }}>{activePred.bias}</b></span>
                    <span>Nearest: <b style={{ color: C.text }}>{activePred.nearestLabel}</b> ({Math.round(activePred.nearestDist)} pts)</span>
                    <span>Confidence: <b style={{ color: C.text }}>{activePred.nextConf}%</b></span>
                  </div>
                </div>
              </div>
            ) : null}
          </Panel>

          {/* Live Astro Clock */}
          <Panel title="Live Astro Clock" icon={<Clock size={16} />} accent={C.gold}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <ClockRow label="NSE Opens/Closes" ms={nse.countdownMs} accent={nse.isOpen ? C.red : C.green} />
              <ClockRow label="MCX Opens/Closes" ms={gold.countdownMs} accent={gold.isOpen ? C.red : C.green} />
              <ClockRow label="Moon Nakshatra" ms={me.nextNakshatra.msRemaining} accent={C.blue} />
              <ClockRow label="Moon Pada" ms={me.nextPada.msRemaining} accent={C.blue} />
              <ClockRow label="Moon Sign" ms={me.nextSign.msRemaining} accent={C.gold} />
              <ClockRow label="Planet Sign Δ" ms={pe.signChanges[0]?.msRemaining ?? 0} accent={C.electric} />
              <ClockRow label="Next BUY" ms={soonest(predictions, "BUY", now)} accent={C.green} />
              <ClockRow label="Next SELL" ms={soonest(predictions, "SELL", now)} accent={C.red} />
              <ClockRow label="Next WAIT" ms={soonest(predictions, "WAIT", now)} accent={C.yellow} />
              <ClockRow label="Astro Update" ms={REFRESH_MS - (now % REFRESH_MS)} accent={C.muted} />
            </div>
          </Panel>
        </div>

        <div style={{ height: 16 }} />

        {/* ============ MOON EVENT + PLANET EVENT TERMINALS ============= */}
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr", gap: 16 }}>
          <Panel title="Moon Event Terminal" icon={<Moon size={16} />} accent={C.blue}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <StatChip label="Nakshatra" value={me.nakshatra} />
              <StatChip label="Pada" value={`P${moon.pada}`} />
              <StatChip label="Degree" value={`${me.degree.toFixed(2)}°`} />
              <StatChip label="Sign" value={moon.sign} />
              <StatChip label="Next Pada" value={fmtDur(me.nextPada.msRemaining)} color={C.blue} />
              <StatChip label="Next Nakshatra" value={me.nextNakshatra.name} color={C.blue} />
              <StatChip label="→ In" value={fmtDur(me.nextNakshatra.msRemaining)} color={C.blue} />
              <StatChip
                label="Next Bias"
                value={me.nextNakshatra.bias}
                color={me.nextNakshatra.bias === "Bull" ? C.green : me.nextNakshatra.bias === "Bear" ? C.red : C.yellow}
              />
            </div>
            <div style={{ marginTop: 10, fontSize: 10.5, color: C.muted, fontFamily: "var(--eb-mono)" }}>
              Next Sign: <b style={{ color: C.text }}>{me.nextSign.name}</b> in {fmtDur(me.nextSign.msRemaining)}
            </div>
          </Panel>

          <Panel title="Planet Event Terminal" icon={<Orbit size={16} />} accent={C.electric}>
            <div style={{ display: "grid", gap: 8 }}>
              <EventRow title="Next Sign Change" ev={pe.signChanges[0]} />
              <EventRow title="Next Nakshatra Change" ev={pe.nakChanges[0]} />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--eb-card) 55%, transparent)", border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: "var(--eb-mono)" }}>Retrograde Now</span>
                <span style={{ fontSize: 11.5, color: retroPlanets.length ? C.red : C.green, fontFamily: "var(--eb-mono)", fontWeight: 700 }}>
                  {retroPlanets.length ? retroPlanets.map((p) => p.planet).join(", ") : "None — all direct"}
                </span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: "var(--eb-mono)", lineHeight: 1.5 }}>
                Expected impact: bull retro (Mars/Jupiter) supports upside; bear retro (Mercury/Saturn) pressures downside.
              </div>
            </div>
          </Panel>
        </div>

        <div style={{ height: 16 }} />

        {/* ==================== LIVE ASTRO LEVEL TABS =================== */}
        <Panel title="Live Astro Level Terminal" icon={<TrendingUp size={16} />}>
          <div
            className="eb-scroll-x"
            style={{
              display: "flex",
              gap: 6,
              flexWrap: isMobile ? "nowrap" : "wrap",
              marginBottom: 12,
              overflowX: isMobile ? "auto" : "visible",
              WebkitOverflowScrolling: "touch",
              paddingBottom: isMobile ? 4 : 0,
            }}
          >
            {MARKET_ORDER.filter((mo) => data.markets.some((m) => m.key === mo.key)).map((mo) => {
              const active = tab === mo.key;
              return (
                <button
                  key={mo.key}
                  type="button"
                  ref={active ? (el) => el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }) : undefined}
                  onClick={() => setTab(mo.key)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 700,
                    fontFamily: "var(--eb-mono)",
                    cursor: "pointer",
                    flex: "0 0 auto",
                    whiteSpace: "nowrap",
                    color: active ? C.bg : C.text,
                    background: active ? C.gold : "color-mix(in srgb, var(--eb-card) 60%, transparent)",
                    border: `1px solid ${active ? C.gold : C.border}`,
                    transition: "all 0.2s ease",
                  }}
                >
                  {mo.label}
                </button>
              );
            })}
          </div>
          {activeMarket && activePred ? <LevelTable m={activeMarket} pred={activePred} isMobile={isMobile} /> : null}
          {activeMarket ? <LevelChart m={activeMarket} isMobile={isMobile} isTablet={isTablet} /> : null}
        </Panel>

        <div style={{ height: 16 }} />

        {/* ========================= SIGNAL MATRIX ===================== */}
        <Panel title="Signal Matrix" icon={<Activity size={16} />} accent={C.electric}>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 11.5, fontFamily: "var(--eb-mono)" }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  {["Instrument", "Current", "Next", "Expected", "Countdown", "Confidence", "Status"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", fontWeight: 600, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {predictions.map((p) => (
                  <tr key={p.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "9px 10px", fontWeight: 700, color: C.text }}>{p.label}</td>
                    <td style={{ padding: "9px 10px" }}><SignalBadge s={p.current} /></td>
                    <td style={{ padding: "9px 10px" }}><SignalBadge s={p.next} /></td>
                    <td style={{ padding: "9px 10px", color: C.muted }}>
                      {new Date(p.expectedAt).toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kolkata" })}
                    </td>
                    <td style={{ padding: "9px 10px", color: signalColor(p.next), fontWeight: 700 }}>{fmtDur(p.expectedAt - now)}</td>
                    <td style={{ padding: "9px 10px", color: C.text }}>{p.nextConf}%</td>
                    <td style={{ padding: "9px 10px", color: p.bias === "Bullish" ? C.green : p.bias === "Bearish" ? C.red : C.yellow }}>{p.bias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div style={{ height: 16 }} />

        {/* ========================= SIGNAL HISTORY ==================== */}
        <Panel title="Signal History (last 100)" icon={<Clock size={16} />} accent={C.gold}>
          {history.length === 0 ? (
            <p style={{ fontSize: 11.5, color: C.muted, fontFamily: "var(--eb-mono)" }}>
              No signal changes recorded yet — history builds as signals flip during the session.
            </p>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: 280, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--eb-mono)" }}>
                <thead>
                  <tr style={{ color: C.muted, textAlign: "left", position: "sticky", top: 0, background: C.card }}>
                    {["Instrument", "Signal", "Actual Time", "Predicted", "Delay", "Reason"].map((h) => (
                      <th key={h} style={{ padding: "7px 10px", fontWeight: 600, fontSize: 9.5, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const delay = h.actualAt - h.predictedAt;
                    return (
                      <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "7px 10px", color: C.text }}>{h.instrument}</td>
                        <td style={{ padding: "7px 10px" }}><SignalBadge s={h.predictedSignal} /></td>
                        <td style={{ padding: "7px 10px", color: C.muted }}>{new Date(h.actualAt).toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kolkata" })}</td>
                        <td style={{ padding: "7px 10px", color: C.muted }}>{new Date(h.predictedAt).toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Kolkata" })}</td>
                        <td style={{ padding: "7px 10px", color: Math.abs(delay) < 300000 ? C.green : C.yellow }}>{fmtDur(Math.abs(delay))}</td>
                        <td style={{ padding: "7px 10px", color: C.muted, maxWidth: 320, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div style={{ marginTop: 24 }}>
          <Disclaimer />
        </div>
        </main>
      </div>

      {/* ======================= NOTIFICATIONS ====================== */}
      <div
        style={{
          position: "fixed",
          right: isMobile ? 10 : 18,
          left: isMobile ? 10 : "auto",
          bottom: isMobile ? 88 : 18,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 60,
          maxWidth: isMobile ? "none" : 320,
          pointerEvents: "none",
        }}
      >
        <AnimatePresence>
          {notes.slice(0, 4).map((n) => {
            const c = signalColor(n.kind);
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                className="eb-glass"
                style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid color-mix(in srgb, ${c} 45%, ${C.border})`, display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}
                onClick={() => setNotes((arr) => arr.filter((x) => x.id !== n.id))}
              >
                <Bell size={15} style={{ color: c }} />
                <span style={{ fontSize: 12, color: C.text, fontFamily: "var(--eb-mono)" }}>{n.text}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <MobileBottomNav />
      <NewsCenter />
    </div>
  );
}

/* ------------------------------ header ------------------------------ */

function TerminalHeader({
  data,
  now,
  moonPada,
  bias,
  nse,
  unread,
  sound,
  onToggleSound,
  isMobile,
}: {
  data: LiveLevelsData;
  now: number;
  moonPada: number;
  bias: string;
  nse: SessionState;
  unread: number;
  sound: boolean;
  onToggleSound: () => void;
  isMobile: boolean;
}) {
  const moon = data.planets.find((p) => p.planet === "Moon")!;
  return (
    <header
      className="eb-card eb-glass"
      style={{
        padding: isMobile ? 12 : 16,
        borderRadius: 16,
        marginBottom: 16,
        borderColor: C.gold,
        position: "sticky",
        top: 8,
        zIndex: 45,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Radio size={22} style={{ color: C.gold }} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: isMobile ? 14 : 18, fontWeight: 800, margin: 0, fontFamily: "var(--eb-head)", letterSpacing: 0.5, background: "var(--eb-gold-grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              LIVE ASTRO MARKET TERMINAL
            </h1>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, fontFamily: "var(--eb-mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Enterprise Astro trading workspace · auto-sync {REFRESH_MS / 1000}s
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
          <span style={{ position: "relative", display: "inline-flex" }}>
            <Bell size={18} style={{ color: unread ? C.gold : C.muted }} />
            {unread > 0 ? (
              <span style={{ position: "absolute", top: -6, right: -6, background: C.red, color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 999, padding: "1px 5px", fontFamily: "var(--eb-mono)" }}>{unread}</span>
            ) : null}
          </span>
          <button type="button" onClick={onToggleSound} className="eb-card-btn" aria-label="Toggle sound" style={{ padding: 8, borderRadius: 10, cursor: "pointer", background: "transparent", border: `1px solid ${C.border}`, color: sound ? C.gold : C.muted }}>
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <ThemeToggle />
        </div>
      </div>
      <div
        className="eb-scroll-x"
        style={{
          display: "flex",
          gap: 8,
          flexWrap: isMobile ? "nowrap" : "wrap",
          overflowX: isMobile ? "auto" : "visible",
          WebkitOverflowScrolling: "touch",
          paddingBottom: isMobile ? 2 : 0,
        }}
      >
        <StatChip label="IST" value={fmtClock(now)} color={C.gold} />
        <StatChip label="UTC" value={fmtClock(now, "UTC")} />
        <StatChip label="Market" value={nse.status} color={SESSION_COLOR[nse.color]} />
        <StatChip label="Moon" value={moon.sign} color={C.blue} />
        <StatChip label="Nakshatra" value={data.moonNakshatra} color={C.blue} />
        <StatChip label="Pada" value={`P${moonPada}`} />
        <StatChip label="Bias" value={bias} color={bias === "Bullish" ? C.green : bias === "Bearish" ? C.red : C.yellow} />
        <StatChip label="Retro" value={data.retroCount} color={data.retroCount >= 3 ? C.red : C.text} />
        <StatChip label="Updated" value={fmtClock(new Date(data.asOf).getTime())} />
      </div>
    </header>
  );
}

/* ------------------------------ sub views ------------------------------ */

function ClockRow({ label, ms, accent }: { label: string; ms: number; accent: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 9, background: "color-mix(in srgb, var(--eb-card) 55%, transparent)", border: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 10, color: C.muted, fontFamily: "var(--eb-mono)" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: accent, fontFamily: "var(--eb-mono)" }}>{ms > 0 ? fmtDur(ms) : "--:--:--"}</span>
    </div>
  );
}

function EventRow({ title, ev }: { title: string; ev?: { planet: string; from: string; to: string; msRemaining: number; retro: boolean } }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--eb-card) 55%, transparent)", border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {ev ? <span style={{ width: 16, height: 16, borderRadius: "50%", background: PLANET_STYLE[ev.planet] ?? "#888" }} /> : null}
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "var(--eb-mono)" }}>{title}</div>
          <div style={{ fontSize: 11.5, color: C.text, fontWeight: 600 }}>
            {ev ? `${ev.planet}: ${ev.from} → ${ev.to}` : "—"}
          </div>
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.electric, fontFamily: "var(--eb-mono)" }}>{ev ? fmtDur(ev.msRemaining) : "—"}</span>
    </div>
  );
}

function LevelTable({ m, pred, isMobile }: { m: MarketBlock; pred: Prediction; isMobile: boolean }) {
  const price = m.livePrice;
  const posLabel =
    price > pred.nearestValue === pred.isResistance ? "Below Nearest" : "Above Nearest";
  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        <StatChip label="Live Price" value={fmtMoney(m, price)} color={m.change >= 0 ? C.green : C.red} />
        <StatChip label="Change" value={`${m.change >= 0 ? "+" : ""}${m.change} (${m.changePct}%)`} color={m.change >= 0 ? C.green : C.red} />
        <StatChip label="Nearest" value={pred.nearestLabel} color={C.gold} />
        <StatChip label="Distance" value={`${Math.round(pred.nearestDist)} pts`} />
        <StatChip label="Position" value={posLabel} color={C.blue} />
        <StatChip label="Status" value={m.marketState} color={m.marketState === "OPEN" ? C.green : C.muted} />
      </div>
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {m.planets.map((p) => (
            <PlanetLevelCard key={p.planet} p={p} price={price} pred={pred} m={m} />
          ))}
        </div>
      ) : (
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--eb-mono)" }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: "right" }}>
            {["Planet", "Deg", "R3", "R2", "R1", "Price", "S1", "S2", "S3"].map((h, i) => (
              <th key={h} style={{ padding: "7px 8px", fontWeight: 600, fontSize: 9.5, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.planets.map((p) => {
            const nearestKind = pred.nearestLabel.startsWith(p.planet);
            return (
              <tr key={p.planet} style={{ borderBottom: `1px solid ${C.border}`, background: nearestKind ? `color-mix(in srgb, ${C.gold} 8%, transparent)` : undefined }}>
                <td style={{ padding: "7px 8px", textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 13, height: 13, borderRadius: "50%", background: PLANET_STYLE[p.planet] ?? "#888" }} />
                  <span style={{ color: C.text }}>{p.planet}</span>
                  {p.retro ? <span style={{ fontSize: 9, color: C.red }}>℞</span> : null}
                </td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: C.muted }}>{p.degree.toFixed(1)}°</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: C.red }}>{p.r3}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: C.red }}>{p.r2}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: C.red, fontWeight: 700 }}>{p.r1}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: C.text, fontWeight: 700 }}>{Math.round(price)}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: C.green, fontWeight: 700 }}>{p.s1}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: C.green }}>{p.s2}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", color: C.green }}>{p.s3}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      )}
    </div>
  );
}

function PlanetLevelCard({
  p,
  price,
  pred,
  m,
}: {
  p: MarketBlock["planets"][number];
  price: number;
  pred: Prediction;
  m: MarketBlock;
}) {
  const [open, setOpen] = useState(false);
  const nearest = pred.nearestLabel.startsWith(p.planet);
  const rows: { label: string; value: React.ReactNode; color?: string }[] = [
    { label: "Degree", value: `${p.degree.toFixed(2)}°` },
    { label: "Current Price", value: fmtMoney(m, price), color: C.text },
    { label: "R1", value: p.r1, color: C.red },
    { label: "R2", value: p.r2, color: C.red },
    { label: "R3", value: p.r3, color: C.red },
    { label: "S1", value: p.s1, color: C.green },
    { label: "S2", value: p.s2, color: C.green },
    { label: "S3", value: p.s3, color: C.green },
    { label: "Nearest Level", value: pred.nearestLabel, color: C.gold },
  ];
  return (
    <div
      className="eb-card"
      style={{
        borderRadius: 14,
        padding: 0,
        overflow: "hidden",
        borderColor: nearest ? `color-mix(in srgb, ${C.gold} 50%, ${C.border})` : C.border,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          background: nearest ? `color-mix(in srgb, ${C.gold} 8%, transparent)` : "transparent",
          border: "none",
          cursor: "pointer",
          color: C.text,
          textAlign: "left",
        }}
      >
        <span style={{ width: 20, height: 20, borderRadius: "50%", background: PLANET_STYLE[p.planet] ?? "#888", flex: "0 0 auto" }} />
        <span style={{ fontWeight: 700, fontFamily: "var(--eb-head)", fontSize: 13.5, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.planet}
          {p.retro ? <span style={{ fontSize: 10, color: C.red, marginLeft: 6 }}>℞</span> : null}
        </span>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: "var(--eb-mono)", flex: "0 0 auto" }}>{p.degree.toFixed(1)}°</span>
        <span style={{ fontSize: 18, color: C.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s ease", flex: "0 0 auto" }}>⌄</span>
      </button>
      {open ? (
        <div style={{ padding: "4px 14px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {rows.map((r) => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 10px", borderRadius: 8, background: "color-mix(in srgb, var(--eb-card) 55%, transparent)", border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: "var(--eb-mono)" }}>{r.label}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: r.color ?? C.text, fontFamily: "var(--eb-mono)" }}>{r.value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
            <SignalBadge s={pred.current} conf={pred.currentConf} />
            <span style={{ fontSize: 10.5, color: C.muted, fontFamily: "var(--eb-mono)" }}>
              Confidence <b style={{ color: C.text }}>{pred.currentConf}%</b>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LevelChart({ m, isMobile, isTablet }: { m: MarketBlock; isMobile: boolean; isTablet: boolean }) {
  const price = m.livePrice;
  const cats = m.planets.map((p) => p.planet);
  const series = [
    { name: "R1", data: m.planets.map((p) => p.r1) },
    { name: "Price", data: m.planets.map(() => Math.round(price)) },
    { name: "S1", data: m.planets.map((p) => p.s1) },
  ];
  const chartHeight = isMobile ? 280 : isTablet ? 350 : 360;
  return (
    <div style={{ marginTop: 12 }}>
      <ApexChart
        type="line"
        height={chartHeight}
        series={series}
        options={{
          chart: { toolbar: { show: false }, animations: { enabled: true } },
          colors: [C.red, C.gold, C.green],
          stroke: { width: [2, 3, 2], dashArray: [4, 0, 4], curve: "straight" },
          xaxis: { categories: cats, labels: { style: { colors: C.muted, fontFamily: "var(--eb-mono)" } } },
          yaxis: { labels: { style: { colors: C.muted, fontFamily: "var(--eb-mono)" } } },
          grid: { borderColor: C.border },
          legend: { labels: { colors: C.muted } },
          tooltip: { theme: "dark" },
        }}
      />
    </div>
  );
}

/* ------------------------------ utilities ------------------------------ */

function soonest(preds: Prediction[], kind: SignalKind, now: number): number {
  const times = preds.filter((p) => p.next === kind).map((p) => p.expectedAt - now).filter((t) => t > 0);
  return times.length ? Math.min(...times) : 0;
}
