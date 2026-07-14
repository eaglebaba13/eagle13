import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  loadReplaySession,
  REPLAY_SYMBOLS,
  type ReplaySession,
  type ReplaySymbol,
} from "@/lib/replay.functions";
import {
  TIMEFRAMES,
  YAHOO_TIMEFRAME_LIMITS,
  computeReplayRunId,
  resolveTrade,
  summarizeSession,
  visibleCandles,
  type AmbiguousPolicy,
  type Candle,
  type ClosedTrade,
  type EntryMode,
  type ReplayConfig,
  type Timeframe,
  type TradeResolve,
} from "@/lib/replay-engine";
import { buildLevelBoard, computeSignal } from "@/lib/astro-levels";
import { pickTargetStop } from "@/lib/backtest-engine";
import { schedule } from "@/lib/scheduler";
import { downloadBlob } from "@/lib/download";
import { ApexChart } from "@/components/ApexChart";
import { useHydrated } from "@/hooks/use-hydrated";

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

const SPEEDS = [1, 2, 5, 10, 30, 60] as const;
const PRESET_KEY = "eb-replay-preset-v1";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export const Route = createFileRoute("/market-replay")({
  component: MarketReplayPage,
  head: () => ({
    meta: [
      { title: "Market Replay | EagleBABA Intraday Astro Levels" },
      {
        name: "description",
        content:
          "Institutional intraday Market Replay Engine — step candle-by-candle through NIFTY, BANK NIFTY, GOLD, SILVER and BTC and observe how price reacted to EagleBABA Astro Levels and signals.",
      },
      { property: "og:title", content: "Market Replay | EagleBABA" },
      {
        property: "og:description",
        content: "Replay any past intraday session with the EagleBABA astro signal engine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

/* ------------------------------ helpers ------------------------------ */

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtClock(ts: number, tz: string): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: tz === "UTC" ? "UTC" : "Asia/Kolkata",
  });
}

type SignalKind = "BUY" | "SELL" | "WAIT";
type OpenTrade = {
  id: number;
  signal: "BUY" | "SELL";
  signalIndex: number;
  signalTs: number;
  target: number | null;
  stop: number | null;
  nearestLabel: string | null;
  confidence: number;
  moonSign: string;
  moonNakshatra: string;
  planet: string | null;
  status: TradeResolve;
};

type ReplayEvent = {
  ts: number;
  index: number;
  type: "SIGNAL" | "TARGET_HIT" | "STOP_HIT" | "AMBIGUOUS";
  label: string;
};

/* ------------------------------ page ------------------------------ */

function MarketReplayPage() {
  const hydrated = useHydrated();
  const call = useServerFn(loadReplaySession);

  const [symbol, setSymbol] = useState<ReplaySymbol>("NIFTY50");
  const [date, setDate] = useState<string>(daysAgoIso(2));
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [entryMode, setEntryMode] = useState<EntryMode>("next_open");
  const [policy, setPolicy] = useState<AmbiguousPolicy>("conservative");
  const [slippagePct, setSlippagePct] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [idx, setIdx] = useState<number>(0);
  const [playing, setPlaying] = useState(false);

  const [trades, setTrades] = useState<OpenTrade[]>([]);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const activeIdRef = useRef<number | null>(null);
  const tradeIdRef = useRef(0);
  const lastSignalRef = useRef<SignalKind>("WAIT");
  const signalCountsRef = useRef({ buy: 0, sell: 0, wait: 0 });

  const [showLevels, setShowLevels] = useState(true);
  const [showSignals, setShowSignals] = useState(true);

  // Load preset once hydrated
  useEffect(() => {
    if (!hydrated) return;
    try {
      const raw = localStorage.getItem(PRESET_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<{
        symbol: ReplaySymbol;
        date: string;
        timeframe: Timeframe;
        speed: number;
        entryMode: EntryMode;
        policy: AmbiguousPolicy;
        slippagePct: number;
        showLevels: boolean;
        showSignals: boolean;
      }>;
      if (p.symbol && REPLAY_SYMBOLS[p.symbol]) setSymbol(p.symbol);
      if (p.date) setDate(p.date);
      if (p.timeframe && TIMEFRAMES.includes(p.timeframe)) setTimeframe(p.timeframe);
      if (p.speed && SPEEDS.includes(p.speed as (typeof SPEEDS)[number])) setSpeed(p.speed);
      if (p.entryMode) setEntryMode(p.entryMode);
      if (p.policy) setPolicy(p.policy);
      if (typeof p.slippagePct === "number") setSlippagePct(p.slippagePct);
      if (typeof p.showLevels === "boolean") setShowLevels(p.showLevels);
      if (typeof p.showSignals === "boolean") setShowSignals(p.showSignals);
    } catch {
      /* ignore corrupt preset */
    }
  }, [hydrated]);

  // Save preset on change
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        PRESET_KEY,
        JSON.stringify({
          symbol,
          date,
          timeframe,
          speed,
          entryMode,
          policy,
          slippagePct,
          showLevels,
          showSignals,
        }),
      );
    } catch {
      /* ignore quota */
    }
  }, [
    hydrated,
    symbol,
    date,
    timeframe,
    speed,
    entryMode,
    policy,
    slippagePct,
    showLevels,
    showSignals,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSession(null);
    setIdx(0);
    setTrades([]);
    setEvents([]);
    activeIdRef.current = null;
    lastSignalRef.current = "WAIT";
    signalCountsRef.current = { buy: 0, sell: 0, wait: 0 };
    tradeIdRef.current = 0;
    try {
      const s = await call({ data: { symbol, date, timeframe } });
      setSession(s);
      if (s.candles.length === 0) {
        setError(
          "No candles returned for this session. Try a more recent date or different timeframe.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [call, symbol, date, timeframe]);

  // Playback loop via the shared scheduler.
  useEffect(() => {
    if (!hydrated || !playing || !session) return;
    const periodMs = Math.max(50, Math.round(1000 / speed));
    const unsub = schedule(
      () => {
        // Pause on hidden tab.
        if (typeof document !== "undefined" && document.hidden) return;
        setIdx((cur) => {
          if (!session) return cur;
          if (cur >= session.candles.length - 1) {
            setPlaying(false);
            return cur;
          }
          return cur + 1;
        });
      },
      periodMs,
      { immediate: false, name: `replay-${speed}x` },
    );
    return unsub;
  }, [hydrated, playing, session, speed]);

  // --- Signal engine tick (pure — reuses production computeSignal). ---
  const tick = useMemo(() => {
    if (!session || session.candles.length === 0) return null;
    const currentIndex = Math.min(idx, session.candles.length - 1);
    const view = visibleCandles(session.candles, currentIndex);
    const candle = view[view.length - 1];
    if (!candle) return null;
    const price = candle.close;
    const board = buildLevelBoard(session.planets, price);
    const sig = computeSignal({
      price,
      board,
      moonNakshatra: session.moonNakshatra,
      retroCount: session.retroCount,
      totalPlanets: session.planets.length,
      bullRetroCount: session.bullRetroCount,
      bearRetroCount: session.bearRetroCount,
    });
    return { currentIndex, price, board, sig, candle };
  }, [session, idx]);

  // --- Detect signal transitions and open trades. ---
  useEffect(() => {
    if (!session || !tick) return;
    const { currentIndex, sig, price } = tick;
    const prev = lastSignalRef.current;
    if (sig.signal !== prev) {
      // Update signal counts (only count each transition).
      if (sig.signal === "BUY") signalCountsRef.current.buy++;
      else if (sig.signal === "SELL") signalCountsRef.current.sell++;
      else signalCountsRef.current.wait++;
      lastSignalRef.current = sig.signal;

      setEvents((e) => [
        ...e,
        {
          ts: session.candles[currentIndex].ts,
          index: currentIndex,
          type: "SIGNAL",
          label: `${sig.signal} @ ${fmtNum(price)} (${sig.strength}, ${sig.confidence})`,
        },
      ]);

      if ((sig.signal === "BUY" || sig.signal === "SELL") && activeIdRef.current == null) {
        const picked = pickTargetStop(
          tick.board.map((b) => ({ value: b.value, isResistance: b.isResistance })),
          price,
          sig.signal,
        );
        const id = ++tradeIdRef.current;
        activeIdRef.current = id;
        setTrades((ts) => [
          ...ts,
          {
            id,
            signal: sig.signal as "BUY" | "SELL",
            signalIndex: currentIndex,
            signalTs: session.candles[currentIndex].ts,
            target: picked.target,
            stop: picked.stop,
            nearestLabel: sig.nearest ? `${sig.nearest.planet} ${sig.nearest.kind}` : null,
            confidence: sig.confidence,
            moonSign: session.moonSign,
            moonNakshatra: session.moonNakshatra,
            planet: sig.nearest?.planet ?? null,
            status: {
              status: "PENDING",
              entry: null,
              entryIndex: null,
              exit: null,
              exitIndex: null,
              mfe: 0,
              mae: 0,
              ambiguous: false,
              grossPnl: 0,
              netPnl: 0,
              pnlPct: 0,
              costs: 0,
            },
          },
        ]);
      }
    }
  }, [session, tick]);

  // --- Update active trade progression on every candle. ---
  useEffect(() => {
    if (!session || !tick) return;
    const activeId = activeIdRef.current;
    if (activeId == null) return;
    setTrades((ts) => {
      const i = ts.findIndex((t) => t.id === activeId);
      if (i < 0) return ts;
      const t = ts[i];
      const status = resolveTrade({
        signal: t.signal,
        signalIndex: t.signalIndex,
        entryMode,
        target: t.target,
        stop: t.stop,
        candles: session.candles,
        currentIndex: tick.currentIndex,
        policy,
        costs: { slippagePct, brokerageFlat: 0, brokeragePct: 0 },
      });
      const closed =
        status.status === "TARGET_HIT" ||
        status.status === "STOP_HIT" ||
        status.status === "EXITED";
      if (closed && activeIdRef.current === activeId) {
        activeIdRef.current = null;
        setEvents((e) => [
          ...e,
          {
            ts: session.candles[
              Math.min(status.exitIndex ?? tick.currentIndex, session.candles.length - 1)
            ].ts,
            index: status.exitIndex ?? tick.currentIndex,
            type: status.ambiguous
              ? "AMBIGUOUS"
              : status.status === "TARGET_HIT"
                ? "TARGET_HIT"
                : "STOP_HIT",
            label: `Trade #${t.id} ${status.status} @ ${fmtNum(status.exit)} · PnL ${fmtNum(status.netPnl)}`,
          },
        ]);
      }
      const next = [...ts];
      next[i] = { ...t, status };
      return next;
    });
  }, [session, tick, entryMode, policy, slippagePct]);

  // ------------------- controls -------------------
  const canStep = !!session && session.candles.length > 0;
  const total = session?.candles.length ?? 0;

  const onStepFwd = () => {
    setIdx((i) => Math.min(total - 1, i + 1));
  };
  const onStepBack = () => {
    setIdx((i) => Math.max(0, i - 1));
  };
  const onRestart = () => {
    setIdx(0);
    setPlaying(false);
    resetTradingState();
  };
  const resetTradingState = () => {
    setTrades([]);
    setEvents([]);
    activeIdRef.current = null;
    tradeIdRef.current = 0;
    lastSignalRef.current = "WAIT";
    signalCountsRef.current = { buy: 0, sell: 0, wait: 0 };
  };
  const onPrevSession = () => setDate((d) => daysAgoIso(daysBetween(d, todayIso()) + 1));
  const onNextSession = () =>
    setDate((d) => {
      const n = daysBetween(d, todayIso()) - 1;
      return n <= 0 ? todayIso() : daysAgoIso(n);
    });

  const jumpToTime = (targetTs: number) => {
    if (!session) return;
    const nearest = session.candles.findIndex((c) => c.ts >= targetTs);
    setIdx(nearest >= 0 ? nearest : session.candles.length - 1);
  };

  // ------------------- exports -------------------
  const cfg: ReplayConfig | null = session
    ? {
        symbol: session.symbol,
        date: session.date,
        timeframe: session.timeframe,
        provider: session.provider,
        entryMode,
        policy,
        costs: { slippagePct, brokerageFlat: 0, brokeragePct: 0 },
      }
    : null;
  const runId = cfg ? computeReplayRunId(cfg) : "—";

  const closedTrades: ClosedTrade[] = trades
    .filter(
      (t) =>
        t.status.status === "TARGET_HIT" ||
        t.status.status === "STOP_HIT" ||
        t.status.status === "EXITED",
    )
    .map((t) => ({
      signal: t.signal,
      entry: t.status.entry ?? 0,
      exit: t.status.exit ?? 0,
      pnl: t.status.netPnl,
      status: t.status.status,
      ambiguous: t.status.ambiguous,
    }));
  const stats = summarizeSession(closedTrades, signalCountsRef.current);

  const exportCsv = () => {
    if (!session) return;
    const head = [
      "id",
      "signal",
      "signalTs",
      "entry",
      "target",
      "stop",
      "exit",
      "status",
      "ambiguous",
      "mfe",
      "mae",
      "pnl",
      "pnlPct",
      "confidence",
      "moonSign",
      "moonNakshatra",
      "planet",
    ];
    const rows = trades.map((t) => [
      t.id,
      t.signal,
      new Date(t.signalTs).toISOString(),
      t.status.entry ?? "",
      t.target ?? "",
      t.stop ?? "",
      t.status.exit ?? "",
      t.status.status,
      t.status.ambiguous,
      t.status.mfe,
      t.status.mae,
      t.status.netPnl,
      t.status.pnlPct,
      t.confidence,
      t.moonSign,
      t.moonNakshatra,
      t.planet ?? "",
    ]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    downloadBlob(
      csv,
      `replay-${session.symbol}-${session.date}-${session.timeframe}.csv`,
      "text/csv",
    );
  };
  const exportJson = () => {
    if (!session || !cfg) return;
    const payload = {
      runId,
      config: cfg,
      session: { ...session, candles: session.candles.length },
      trades,
      events,
      stats,
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `replay-${session.symbol}-${session.date}-${session.timeframe}.json`,
      "application/json",
    );
  };

  // ------------------- chart -------------------
  const chart = useMemo(() => {
    if (!session || !tick) return null;
    const view = visibleCandles(session.candles, tick.currentIndex);
    const series = [
      {
        name: session.label,
        data: view.map((c) => ({ x: c.ts, y: [c.open, c.high, c.low, c.close] })),
      },
    ];
    // Level annotations: pull top 6 levels (r1..r3, s1..s3) from planets — show
    // only the aggregate max/min per side to avoid clutter.
    const yPoints: {
      y: number;
      borderColor: string;
      label: { text: string; style: { color: string; background: string } };
    }[] = [];
    if (showLevels) {
      // Use nearest planet's R1/R2/R3/S1/S2/S3 for context.
      const planets = session.planets;
      // pick planet closest to entry price
      const price = tick.price;
      const nearest = [...planets].sort(
        (a, b) => Math.abs(a.r1 - price) - Math.abs(b.r1 - price),
      )[0];
      if (nearest) {
        const defs: [string, number, string][] = [
          ["R1", nearest.r1, C.red],
          ["R2", nearest.r2, C.red],
          ["R3", nearest.r3, C.red],
          ["S1", nearest.s1, C.green],
          ["S2", nearest.s2, C.green],
          ["S3", nearest.s3, C.green],
        ];
        for (const [k, v, col] of defs) {
          yPoints.push({
            y: v,
            borderColor: col,
            label: { text: `${nearest.planet} ${k}`, style: { color: "#fff", background: col } },
          });
        }
      }
    }
    if (showSignals) {
      const active = trades.find((t) => t.id === activeIdRef.current);
      if (active) {
        if (active.target != null)
          yPoints.push({
            y: active.target,
            borderColor: C.orange,
            label: {
              text: `Target ${fmtNum(active.target)}`,
              style: { color: "#04140b", background: C.orange },
            },
          });
        if (active.stop != null)
          yPoints.push({
            y: active.stop,
            borderColor: C.blue,
            label: {
              text: `Stop ${fmtNum(active.stop)}`,
              style: { color: "#04140b", background: C.blue },
            },
          });
      }
    }
    return { series, yPoints };
  }, [session, tick, showLevels, showSignals, trades]);

  const sessionProgress =
    session && session.candles.length > 0
      ? Math.round(((idx + 1) / session.candles.length) * 1000) / 10
      : 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "18px 16px 96px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--eb-head)",
              fontSize: 20,
              letterSpacing: 2,
              color: C.orange,
            }}
          >
            ▶ MARKET REPLAY · INTRADAY ASTRO LEVELS
          </div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 4 }}>
            Reuses the live signal engine · candle-by-candle causal replay · no formula duplication
          </div>
        </div>
        <Link to="/" style={{ color: C.blue, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
          ← Dashboard
        </Link>
      </header>

      {/* Controls */}
      <section style={panel}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          <Field label="Instrument">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value as ReplaySymbol)}
              style={selectStyle}
            >
              {(Object.keys(REPLAY_SYMBOLS) as ReplaySymbol[]).map((k) => (
                <option key={k} value={k}>
                  {REPLAY_SYMBOLS[k].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Session Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={selectStyle}
            />
          </Field>
          <Field label="Timeframe">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              style={selectStyle}
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf} · max {YAHOO_TIMEFRAME_LIMITS[tf].maxAgeDays}d
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entry Mode">
            <select
              value={entryMode}
              onChange={(e) => setEntryMode(e.target.value as EntryMode)}
              style={selectStyle}
            >
              <option value="next_open">Next Candle Open</option>
              <option value="signal_close">Signal Candle Close</option>
            </select>
          </Field>
          <Field label="Ambiguous Policy">
            <select
              value={policy}
              onChange={(e) => setPolicy(e.target.value as AmbiguousPolicy)}
              style={selectStyle}
            >
              <option value="conservative">Conservative</option>
              <option value="optimistic">Optimistic</option>
              <option value="mark_ambiguous">Mark Ambiguous</option>
            </select>
          </Field>
          <Field label="Slippage %">
            <input
              type="number"
              step="0.01"
              value={slippagePct}
              onChange={(e) => setSlippagePct(Number(e.target.value) || 0)}
              style={selectStyle}
            />
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={load}
              disabled={loading}
              style={{
                ...btnPrimary,
                width: "100%",
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Loading…" : "▶ Load Session"}
            </button>
          </div>
        </div>
        {error ? (
          <div style={{ marginTop: 10, color: C.red, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
            {error}
          </div>
        ) : null}
      </section>

      {/* Playback + timeline */}
      {session ? (
        <section style={{ ...panel, marginTop: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <button style={btnGhost} onClick={onPrevSession}>
              « Prev Session
            </button>
            <button style={btnGhost} onClick={onStepBack} disabled={!canStep || idx === 0}>
              ◀ Step
            </button>
            {playing ? (
              <button style={btnPrimary} onClick={() => setPlaying(false)}>
                ❚❚ Pause
              </button>
            ) : (
              <button style={btnPrimary} onClick={() => setPlaying(true)} disabled={!canStep}>
                ▶ Play
              </button>
            )}
            <button style={btnGhost} onClick={onStepFwd} disabled={!canStep || idx >= total - 1}>
              Step ▶
            </button>
            <button style={btnGhost} onClick={onRestart}>
              ⟲ Restart
            </button>
            <button style={btnGhost} onClick={onNextSession}>
              Next Session »
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              <span style={fieldLbl}>Speed</span>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  style={{
                    ...chip,
                    background: speed === s ? C.orange : "transparent",
                    color: speed === s ? "#04140b" : C.text,
                  }}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 10,
              alignItems: "center",
              fontFamily: "var(--eb-mono)",
              fontSize: 12,
            }}
          >
            <span style={{ color: C.muted }}>Session:</span>
            <span>
              {session.label} · {session.date}
            </span>
            <span style={{ color: C.muted }}>Clock:</span>
            <span style={{ color: C.orange }}>
              {session.candles[idx] ? fmtClock(session.candles[idx].ts, session.timezone) : "—"}{" "}
              {session.timezone === "UTC" ? "UTC" : "IST"}
            </span>
            <span style={{ color: C.muted }}>Candle:</span>
            <span>
              {Math.min(idx + 1, total)} / {total}
            </span>
            <span style={{ color: C.muted }}>Progress:</span>
            <span>{sessionProgress}%</span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={Math.min(idx, Math.max(0, total - 1))}
            onChange={(e) => setIdx(Number(e.target.value))}
            style={{ width: "100%", marginTop: 10 }}
            disabled={!canStep}
            aria-label="Jump to candle"
          />

          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <label style={toggleLbl}>
              <input
                type="checkbox"
                checked={showLevels}
                onChange={(e) => setShowLevels(e.target.checked)}
              />{" "}
              Show Levels
            </label>
            <label style={toggleLbl}>
              <input
                type="checkbox"
                checked={showSignals}
                onChange={(e) => setShowSignals(e.target.checked)}
              />{" "}
              Show Target/Stop
            </label>
            <button style={btnGhost} onClick={exportCsv}>
              Export CSV
            </button>
            <button style={btnGhost} onClick={exportJson}>
              Export JSON
            </button>
          </div>
        </section>
      ) : null}

      {/* Chart + side panel */}
      {session && chart && tick ? (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: 12,
            marginTop: 14,
          }}
        >
          <div style={{ ...panel, minWidth: 0 }}>
            <ApexChart
              type="candlestick"
              height={380}
              series={chart.series}
              options={{
                chart: {
                  toolbar: { show: true },
                  zoom: { enabled: true },
                  animations: { enabled: false },
                },
                xaxis: { type: "datetime", labels: { style: { colors: "var(--eb-muted)" } } },
                yaxis: {
                  tooltip: { enabled: true },
                  labels: { style: { colors: "var(--eb-muted)" } },
                },
                annotations: { yaxis: chart.yPoints },
                grid: { borderColor: "var(--eb-border)" },
                tooltip: { theme: "dark" },
                plotOptions: {
                  candlestick: { colors: { upward: "var(--eb-bull)", downward: "var(--eb-bear)" } },
                },
              }}
            />
          </div>
          <SidePanel
            session={session}
            tick={tick}
            activeTrade={trades.find((t) => t.id === activeIdRef.current) ?? null}
          />
        </section>
      ) : null}

      {/* Trade log */}
      {session ? (
        <section style={{ ...panel, marginTop: 14 }}>
          <SectionHead>
            Trade Log · {trades.length} signal{trades.length === 1 ? "" : "s"}
          </SectionHead>
          {trades.length === 0 ? (
            <div style={{ color: C.muted, fontFamily: "var(--eb-mono)", fontSize: 12 }}>
              No trades yet — press Play or step through candles.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {[
                      "#",
                      "Time",
                      "Signal",
                      "Entry",
                      "Target",
                      "Stop",
                      "Exit",
                      "Result",
                      "Ambig",
                      "MFE",
                      "MAE",
                      "PnL",
                      "Conf",
                      "Nakshatra",
                      "Planet",
                    ].map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.id}>
                      <td style={td}>{t.id}</td>
                      <td style={td}>{fmtClock(t.signalTs, session.timezone)}</td>
                      <td style={{ ...td, color: t.signal === "BUY" ? C.green : C.red }}>
                        {t.signal}
                      </td>
                      <td style={td}>{fmtNum(t.status.entry)}</td>
                      <td style={td}>{fmtNum(t.target)}</td>
                      <td style={td}>{fmtNum(t.stop)}</td>
                      <td style={td}>{fmtNum(t.status.exit)}</td>
                      <td
                        style={{
                          ...td,
                          color:
                            t.status.status === "TARGET_HIT"
                              ? C.green
                              : t.status.status === "STOP_HIT"
                                ? C.red
                                : C.muted,
                        }}
                      >
                        {t.status.status}
                      </td>
                      <td style={td}>{t.status.ambiguous ? "yes" : "—"}</td>
                      <td style={td}>{fmtNum(t.status.mfe)}</td>
                      <td style={td}>{fmtNum(t.status.mae)}</td>
                      <td
                        style={{
                          ...td,
                          color:
                            t.status.netPnl > 0 ? C.green : t.status.netPnl < 0 ? C.red : C.muted,
                        }}
                      >
                        {fmtNum(t.status.netPnl)}
                      </td>
                      <td style={td}>{t.confidence}</td>
                      <td style={td}>{t.moonNakshatra}</td>
                      <td style={td}>{t.planet ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* Session summary */}
      {session ? (
        <section style={{ ...panel, marginTop: 14 }}>
          <SectionHead>Session Summary</SectionHead>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8,
              fontFamily: "var(--eb-mono)",
              fontSize: 12,
            }}
          >
            <Kv k="Total Signals" v={stats.totalSignals} />
            <Kv k="BUY" v={stats.buy} />
            <Kv k="SELL" v={stats.sell} />
            <Kv k="WAIT" v={stats.wait} />
            <Kv k="Wins" v={stats.wins} c={C.green} />
            <Kv k="Losses" v={stats.losses} c={C.red} />
            <Kv k="Ambiguous" v={stats.ambiguous} />
            <Kv k="Win Rate" v={`${stats.winRate}%`} />
            <Kv k="Net PnL" v={fmtNum(stats.netPnl)} c={stats.netPnl >= 0 ? C.green : C.red} />
            <Kv k="Profit Factor" v={stats.profitFactor} />
            <Kv k="Best Trade" v={fmtNum(stats.best)} />
            <Kv k="Worst Trade" v={fmtNum(stats.worst)} />
            <Kv k="Max Drawdown" v={fmtNum(stats.maxDrawdown)} c={C.red} />
          </div>
        </section>
      ) : null}

      {/* Event timeline */}
      {session && events.length > 0 ? (
        <section style={{ ...panel, marginTop: 14 }}>
          <SectionHead>Event Timeline</SectionHead>
          <div
            style={{
              maxHeight: 220,
              overflowY: "auto",
              fontFamily: "var(--eb-mono)",
              fontSize: 12,
            }}
          >
            {events.map((ev, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "4px 0",
                  borderBottom: `1px solid ${C.border}`,
                  cursor: "pointer",
                }}
                onClick={() => jumpToTime(ev.ts)}
              >
                <span style={{ color: C.muted, minWidth: 80 }}>
                  {fmtClock(ev.ts, session.timezone)}
                </span>
                <span
                  style={{
                    color:
                      ev.type === "SIGNAL"
                        ? C.blue
                        : ev.type === "TARGET_HIT"
                          ? C.green
                          : ev.type === "STOP_HIT"
                            ? C.red
                            : C.orange,
                    minWidth: 110,
                  }}
                >
                  {ev.type}
                </span>
                <span>{ev.label}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Methodology */}
      {session ? (
        <section style={{ ...panel, marginTop: 14 }}>
          <SectionHead>Methodology & Data Quality</SectionHead>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 8,
              fontFamily: "var(--eb-mono)",
              fontSize: 11,
            }}
          >
            <Kv k="Provider" v={`${session.provider} (${session.interval})`} />
            <Kv k="Timezone" v={session.timezone} />
            <Kv
              k="Entry Rule"
              v={entryMode === "next_open" ? "Next Candle Open" : "Signal Candle Close"}
            />
            <Kv k="Exit Rule" v="Target / Stop / Session End" />
            <Kv k="Both-Touched" v={policy} />
            <Kv k="Slippage" v={`${slippagePct}%`} />
            <Kv k="Expected candles" v={session.dataQuality.expected} />
            <Kv k="Loaded" v={session.dataQuality.loaded} />
            <Kv k="Coverage" v={`${session.dataQuality.coveragePct}%`} />
            <Kv k="Prev Daily Close" v={fmtNum(session.prevClose)} />
            <Kv k="Prev Session Date" v={session.prevDate} />
            <Kv k="Run ID" v={runId} />
          </div>
          <div
            style={{
              marginTop: 10,
              color: C.muted,
              fontFamily: "var(--eb-mono)",
              fontSize: 11,
              lineHeight: 1.6,
            }}
          >
            <div>{session.dataQuality.limitationNote}</div>
            {session.disclaimers.map((d, i) => (
              <div key={i}>• {d}</div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------ subcomponents ------------------------------ */

function SidePanel({
  session,
  tick,
  activeTrade,
}: {
  session: ReplaySession;
  tick: {
    currentIndex: number;
    price: number;
    board: ReturnType<typeof buildLevelBoard>;
    sig: ReturnType<typeof computeSignal>;
    candle: Candle;
  };
  activeTrade: OpenTrade | null;
}) {
  const nearestSup = tick.board
    .filter((b) => !b.isResistance && b.value <= tick.price)
    .sort((a, b) => tick.price - a.value - (tick.price - b.value))[0];
  const nearestRes = tick.board
    .filter((b) => b.isResistance && b.value >= tick.price)
    .sort((a, b) => a.value - tick.price - (b.value - tick.price))[0];
  const near = tick.sig.nearest;
  const bias =
    session.bullRetroCount > session.bearRetroCount
      ? "Bullish tilt"
      : session.bearRetroCount > session.bullRetroCount
        ? "Bearish tilt"
        : "Neutral";
  return (
    <aside style={panel}>
      <SectionHead>Live Snapshot</SectionHead>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, display: "grid", gap: 6 }}>
        <Kv k="Price" v={fmtNum(tick.price)} c={C.orange} />
        <Kv
          k="Signal"
          v={`${tick.sig.emoji} ${tick.sig.signal}`}
          c={tick.sig.signal === "BUY" ? C.green : tick.sig.signal === "SELL" ? C.red : C.muted}
        />
        <Kv k="Strength" v={tick.sig.strength} />
        <Kv k="Confidence" v={`${tick.sig.confidence}%`} />
        <Kv k="Nearest" v={near ? `${near.planet} ${near.kind} @ ${fmtNum(near.value)}` : "—"} />
        <Kv k="Distance" v={near ? fmtNum(near.distance) : "—"} />
        <Kv k="Nearest Support" v={nearestSup ? fmtNum(nearestSup.value) : "—"} c={C.green} />
        <Kv k="Nearest Resistance" v={nearestRes ? fmtNum(nearestRes.value) : "—"} c={C.red} />
        <Kv k="Moon Sign" v={session.moonSign} />
        <Kv k="Nakshatra" v={session.moonNakshatra} />
        <Kv k="Moon Degree" v={fmtNum(session.moonDegree)} />
        <Kv k="Retro Count" v={session.retroCount} />
        <Kv k="Bias" v={bias} />
      </div>
      {activeTrade ? (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <SectionHead>Active Trade</SectionHead>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, display: "grid", gap: 6 }}>
            <Kv
              k="Signal"
              v={activeTrade.signal}
              c={activeTrade.signal === "BUY" ? C.green : C.red}
            />
            <Kv k="Entry" v={fmtNum(activeTrade.status.entry)} />
            <Kv k="Target" v={fmtNum(activeTrade.target)} />
            <Kv k="Stop" v={fmtNum(activeTrade.stop)} />
            <Kv k="Status" v={activeTrade.status.status} />
            <Kv k="MFE" v={fmtNum(activeTrade.status.mfe)} c={C.green} />
            <Kv k="MAE" v={fmtNum(activeTrade.status.mae)} c={C.red} />
            <Kv
              k="PnL"
              v={fmtNum(activeTrade.status.netPnl)}
              c={activeTrade.status.netPnl >= 0 ? C.green : C.red}
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={fieldLbl}>{label}</div>
      {children}
    </div>
  );
}

function Kv({ k, v, c }: { k: string; v: React.ReactNode; c?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ color: c ?? C.text }}>{v}</span>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--eb-head)",
        fontSize: 13,
        letterSpacing: 1.5,
        color: C.orange,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function daysBetween(a: string, b: string): number {
  const t1 = new Date(a + "T00:00:00Z").getTime();
  const t2 = new Date(b + "T00:00:00Z").getTime();
  return Math.round((t2 - t1) / 86_400_000);
}

/* ------------------------------ styles ------------------------------ */

const panel: React.CSSProperties = {
  background: "var(--eb-card)",
  border: "1px solid var(--eb-border)",
  borderRadius: 8,
  padding: 14,
};
const fieldLbl: React.CSSProperties = {
  fontFamily: "var(--eb-mono)",
  fontSize: 10,
  letterSpacing: 0.6,
  color: "var(--eb-muted)",
  textTransform: "uppercase",
  marginBottom: 4,
};
const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--eb-bg)",
  color: "var(--eb-text)",
  border: "1px solid var(--eb-border)",
  borderRadius: 6,
  padding: "6px 8px",
  fontFamily: "var(--eb-mono)",
  fontSize: 12,
  minHeight: 36,
};
const chip: React.CSSProperties = {
  border: "1px solid var(--eb-border)",
  borderRadius: 16,
  padding: "4px 10px",
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
  cursor: "pointer",
  color: "var(--eb-text)",
};
const btnPrimary: React.CSSProperties = {
  background: "var(--eb-accent)",
  color: "#04140b",
  border: "none",
  borderRadius: 6,
  padding: "8px 14px",
  fontFamily: "var(--eb-mono)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  minHeight: 40,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--eb-text)",
  border: "1px solid var(--eb-border)",
  borderRadius: 6,
  padding: "6px 10px",
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
  cursor: "pointer",
  minHeight: 36,
};
const toggleLbl: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
  color: "var(--eb-muted)",
  padding: "4px 8px",
  border: `1px solid var(--eb-border)`,
  borderRadius: 6,
};
const tableStyle: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
};
const th: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  color: "var(--eb-accent)",
  fontSize: 10,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  borderBottom: "1px solid var(--eb-border)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "5px 8px",
  color: "var(--eb-text)",
  whiteSpace: "nowrap",
};
