// Phase 21.4 · Stage 4A — Astro vs SMC descriptive comparison.
//
// Runs the two strategies separately and displays their metrics side-by-side.
// NEVER merges trades — each strategy keeps its own Run ID, formula version,
// and trade log. Conflict buckets align by date only (informational).

import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runBacktest, type BacktestResult } from "@/lib/backtest.functions";
import { runUnifiedBacktest } from "@/lib/backtest/unified";
import { analyzeSmc } from "@/lib/smc-engine";
import { analyzeSmcSignals, DEFAULT_SMC_SIGNAL_CONFIG } from "@/lib/smc-signal-engine";
import { loadSmcCandles, SmcDataRangeUnavailableError, type SmcInstrument, type SmcTimeframe } from "@/lib/backtest/smc-data-source";
import { DEFAULT_SMC_EXECUTION } from "@/lib/backtest/adapters/smc-historical.adapter";
import { INTRADAY_FORMULA_VERSIONS } from "@/lib/engine-version";
import type { HistoricalBacktestResult, HistoricalTrade } from "@/lib/backtest/result";

const C = {
  card: "var(--eb-card)",
  border: "var(--eb-border)",
  green: "var(--eb-bull)",
  red: "var(--eb-bear)",
  orange: "var(--eb-accent)",
  blue: "var(--eb-blue)",
  text: "var(--eb-text)",
  muted: "var(--eb-muted)",
  bg: "var(--eb-bg)",
};

type ConflictBucket = {
  astroBuySmcBuy: number;
  astroSellSmcSell: number;
  astroBuySmcSell: number;
  astroSellSmcBuy: number;
  astroOnly: number;
  smcOnly: number;
};

export function computeConflictBuckets(
  astroTradesByDate: Map<string, "BUY" | "SELL" | "WAIT">,
  smcTradesByDate: Map<string, "BUY" | "SELL">,
): ConflictBucket {
  const b: ConflictBucket = {
    astroBuySmcBuy: 0,
    astroSellSmcSell: 0,
    astroBuySmcSell: 0,
    astroSellSmcBuy: 0,
    astroOnly: 0,
    smcOnly: 0,
  };
  const allDates = new Set([...astroTradesByDate.keys(), ...smcTradesByDate.keys()]);
  for (const d of allDates) {
    const a = astroTradesByDate.get(d);
    const s = smcTradesByDate.get(d);
    if (a && a !== "WAIT" && s) {
      if (a === "BUY" && s === "BUY") b.astroBuySmcBuy++;
      else if (a === "SELL" && s === "SELL") b.astroSellSmcSell++;
      else if (a === "BUY" && s === "SELL") b.astroBuySmcSell++;
      else if (a === "SELL" && s === "BUY") b.astroSellSmcBuy++;
    } else if (a && a !== "WAIT" && !s) {
      b.astroOnly++;
    } else if (!a && s) {
      b.smcOnly++;
    }
  }
  return b;
}

function smcTradeMap(trades: readonly HistoricalTrade[]): Map<string, "BUY" | "SELL"> {
  const m = new Map<string, "BUY" | "SELL">();
  for (const t of trades) {
    if (t.side === "BUY" || t.side === "SELL") m.set(t.date, t.side);
  }
  return m;
}

export default function CompareAstroSmc(props: {
  instrument: SmcInstrument;
  timeframe: SmcTimeframe;
  from: string;
  to: string;
  csvText: string;
}) {
  const call = useServerFn(runBacktest);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [astro, setAstro] = useState<BacktestResult | null>(null);
  const [smc, setSmc] = useState<HistoricalBacktestResult | null>(null);
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setError(null);
    setAstro(null);
    setSmc(null);
    try {
      // Astro (server fn) and SMC (client-side) — SEPARATE runs, no merging.
      const astroP = call({
        data: { symbol: props.instrument === "XAUUSD" ? "GOLD" : props.instrument, from: props.from, to: props.to },
      });
      const loaded = await loadSmcCandles({
        instrument: props.instrument,
        timeframe: props.timeframe,
        from: props.from,
        to: props.to,
        timezone: "Asia/Kolkata",
        source: { kind: "csv", csv: props.csvText, provider: "Zerodha" },
      });
      const engine = analyzeSmc([...loaded.candles]);
      const signals = analyzeSmcSignals([...loaded.candles], engine, DEFAULT_SMC_SIGNAL_CONFIG);
      const smcRes = await runUnifiedBacktest({
        strategy: "SMC",
        formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
        instrument: props.instrument,
        from: props.from,
        to: props.to,
        source: `${loaded.provider}#${loaded.dataHash}#${props.timeframe}`,
        extras: {
          candles: loaded.candles,
          signals: signals.signals,
          engine,
          execution: DEFAULT_SMC_EXECUTION,
        },
      });
      const astroRes = await astroP;
      setAstro(astroRes);
      setSmc(smcRes);
    } catch (e) {
      setError(
        e instanceof SmcDataRangeUnavailableError || e instanceof Error
          ? e.message
          : "Unknown error",
      );
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [call, props.instrument, props.timeframe, props.from, props.to, props.csvText]);

  const buckets =
    astro && smc
      ? computeConflictBuckets(
          new Map(astro.trades.map((t) => [t.date, t.signal])),
          smcTradeMap(smc.trades),
        )
      : null;

  return (
    <div style={{ display: "grid", gap: 12, fontFamily: "var(--eb-mono)" }}>
      <div style={{ fontSize: 13, color: C.orange, letterSpacing: 1 }}>
        ⚖ ASTRO vs SMC · descriptive comparison (no trade merging)
      </div>
      <div style={panel}>
        <button
          onClick={run}
          disabled={loading || props.csvText.trim().length === 0}
          style={{
            ...btnPrimary,
            opacity: loading || props.csvText.trim().length === 0 ? 0.5 : 1,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Running…" : "▶ Run Compare"}
        </button>
        {props.csvText.trim().length === 0 ? (
          <span style={{ marginLeft: 10, fontSize: 11, color: C.muted }}>
            Upload a CSV above first — SMC needs intraday candles.
          </span>
        ) : null}
        {error ? <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{error}</div> : null}
      </div>

      {astro && smc ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
            <MetricsCard title="Astro Sign-Degree" runId={astro.runId} version={astro.astroFormulaVersion}>
              <Row k="Trades" v={String(astro.summary.taken)} />
              <Row k="Win Rate" v={`${astro.summary.winRate}%`} />
              <Row k="Profit Factor" v={astro.summary.profitFactor >= 999 ? "∞" : String(astro.summary.profitFactor)} />
              <Row k="Net PnL" v={astro.summary.netProfit.toFixed(2)} />
              <Row k="Max Drawdown" v={astro.summary.maxDrawdown.toFixed(2)} />
              <Row k="BUY / SELL / WAIT" v={`${astro.summary.buy} · ${astro.summary.sell} · ${astro.summary.wait}`} />
            </MetricsCard>
            <MetricsCard title="SMC_V1" runId={smc.runId} version={smc.formulaVersion}>
              <Row k="Trades" v={String(smc.trades.length)} />
              <Row k="Wins" v={String(smc.trades.filter((t) => t.outcome === "WIN").length)} />
              <Row k="Losses" v={String(smc.trades.filter((t) => t.outcome === "LOSS").length)} />
              <Row k="Net PnL" v={smc.trades.reduce((a, t) => a + t.pnl, 0).toFixed(2)} />
              <Row k="Max Drawdown" v={smc.drawdown ? smc.drawdown.max.toFixed(2) : "—"} />
              <Row k="Data Coverage" v={smc.dataQuality ? `${smc.dataQuality.coveragePct}%` : "—"} />
            </MetricsCard>
          </div>

          {buckets ? (
            <div style={panel}>
              <div style={sectionHead}>Conflict Buckets (aligned by date)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                <Row k="Astro BUY / SMC BUY" v={String(buckets.astroBuySmcBuy)} />
                <Row k="Astro SELL / SMC SELL" v={String(buckets.astroSellSmcSell)} />
                <Row k="Astro BUY / SMC SELL" v={String(buckets.astroBuySmcSell)} />
                <Row k="Astro SELL / SMC BUY" v={String(buckets.astroSellSmcBuy)} />
                <Row k="Astro Trade / SMC WAIT" v={String(buckets.astroOnly)} />
                <Row k="SMC Trade / Astro WAIT" v={String(buckets.smcOnly)} />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function MetricsCard({
  title,
  runId,
  version,
  children,
}: {
  title: string;
  runId: string;
  version: string;
  children: React.ReactNode;
}) {
  return (
    <div style={panel}>
      <div style={sectionHead}>{title}</div>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, wordBreak: "break-all" }}>
        {version} · {runId}
      </div>
      <div style={{ display: "grid", gap: 4 }}>{children}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

const panel: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: 12,
};
const sectionHead: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1,
  color: C.orange,
  marginBottom: 8,
};
const btnPrimary: React.CSSProperties = {
  background: C.orange,
  color: "#04140b",
  border: "none",
  borderRadius: 4,
  padding: "8px 14px",
  fontFamily: "var(--eb-mono)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.6,
};