// Phase 21.4 · Stage 4B — Astro + SMC Hybrid backtest panel.
//
// Client-only, lazy-loaded. Runs Astro (server fn) and SMC (client engines)
// exactly once each, then dispatches the shared unified backtest with the
// hybrid formula adapter. No production Astro/SMC engine is mutated.

import { useCallback, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  runBacktest,
  type BacktestResult,
} from "@/lib/backtest.functions";
import {
  loadSmcCandles,
  SMC_INSTRUMENTS,
  SMC_TIMEFRAMES,
  SmcDataRangeUnavailableError,
  type LoadSmcCandlesResult,
  type SmcInstrument,
  type SmcTimeframe,
} from "@/lib/backtest/smc-data-source";
import { runUnifiedBacktest } from "@/lib/backtest/unified";
import { analyzeSmc } from "@/lib/smc-engine";
import {
  analyzeSmcSignals,
  DEFAULT_SMC_SIGNAL_CONFIG,
} from "@/lib/smc-signal-engine";
import { DEFAULT_SMC_EXECUTION } from "@/lib/backtest/adapters/smc-historical.adapter";
import {
  DEFAULT_HYBRID_CONFIG,
  DEFAULT_HYBRID_WEIGHTS,
  type HybridWeights,
} from "@/lib/backtest/hybrid-decision";
import { INTRADAY_FORMULA_VERSIONS } from "@/lib/engine-version";
import { downloadBlob } from "@/lib/download";
import type { HistoricalBacktestResult } from "@/lib/backtest/result";

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

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const ASTRO_FORMULA_ID = INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1;
const SMC_FORMULA_ID = INTRADAY_FORMULA_VERSIONS.SMC_V1;

export default function HybridBacktestPanel() {
  const [instrument, setInstrument] = useState<SmcInstrument>("NIFTY50");
  const [timeframe, setTimeframe] = useState<SmcTimeframe>("5m");
  const [from, setFrom] = useState<string>(isoDaysAgo(30));
  const [to, setTo] = useState<string>(today());
  const [csvText, setCsvText] = useState<string>("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);

  const [weights, setWeights] = useState<HybridWeights>({
    ...DEFAULT_HYBRID_WEIGHTS,
  });
  const [threshold, setThreshold] = useState<number>(
    DEFAULT_HYBRID_CONFIG.scoreThreshold,
  );
  const [minDq, setMinDq] = useState<number>(
    DEFAULT_HYBRID_CONFIG.minDataQualityPct,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [astro, setAstro] = useState<BacktestResult | null>(null);
  const [smc, setSmc] = useState<HistoricalBacktestResult | null>(null);
  const [hybrid, setHybrid] = useState<HistoricalBacktestResult | null>(null);
  const [data, setData] = useState<LoadSmcCandlesResult | null>(null);
  const runningRef = useRef(false);

  const callAstro = useServerFn(runBacktest);

  const onCsvFile = useCallback((f: File | null) => {
    if (!f) return;
    setCsvFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(f);
  }, []);

  const canRun = !loading && csvText.trim().length > 0;

  const runNow = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setError(null);
    setAstro(null);
    setSmc(null);
    setHybrid(null);
    try {
      // 1. Astro (server fn) — one call.
      const astroP = callAstro({
        data: {
          symbol: instrument === "XAUUSD" ? "GOLD" : instrument,
          from,
          to,
        },
      });
      // 2. Load candles once.
      const loaded = await loadSmcCandles({
        instrument,
        timeframe,
        from,
        to,
        timezone: "Asia/Kolkata",
        source: { kind: "csv", csv: csvText, provider: "Zerodha" },
      });
      setData(loaded);
      // 3. SMC engines — one pass each.
      const engine = analyzeSmc([...loaded.candles]);
      const signals = analyzeSmcSignals(
        [...loaded.candles],
        engine,
        DEFAULT_SMC_SIGNAL_CONFIG,
      );
      const astroRes = await astroP;
      setAstro(astroRes);

      // 4. SMC standalone Run ID (separate result — no merging).
      const smcRes = await runUnifiedBacktest({
        strategy: "SMC",
        formula: SMC_FORMULA_ID,
        instrument,
        from,
        to,
        source: `${loaded.provider}#${loaded.dataHash}#${timeframe}`,
        extras: {
          candles: loaded.candles,
          signals: signals.signals,
          engine,
          execution: DEFAULT_SMC_EXECUTION,
        },
      });
      setSmc(smcRes);

      // 5. Hybrid — reuses the same Astro + SMC outputs.
      const astroByDate: Record<
        string,
        { direction: "BUY" | "SELL" | "WAIT"; confidence: number }
      > = {};
      for (const t of astroRes.trades) {
        astroByDate[t.date] = {
          direction: t.signal,
          confidence: t.confidence,
        };
      }
      const dq = loaded.dataQuality.coveragePct;
      const hybridRes = await runUnifiedBacktest({
        strategy: "ASTRO_SMC_HYBRID",
        formula: INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
        instrument,
        from,
        to,
        source: `${loaded.provider}#${loaded.dataHash}#${timeframe}#hybrid`,
        extras: {
          candles: loaded.candles,
          smcSignals: signals.signals,
          engine,
          astroByDate,
          astroFormulaVersion: ASTRO_FORMULA_ID,
          smcFormulaVersion: SMC_FORMULA_ID,
          hybridConfig: {
            weights,
            scoreThreshold: threshold,
            minDataQualityPct: minDq,
          },
          dataQualityPct: dq,
          execution: DEFAULT_SMC_EXECUTION,
        },
      });
      setHybrid(hybridRes);
    } catch (e) {
      if (e instanceof SmcDataRangeUnavailableError || e instanceof Error) {
        setError(e.message);
      } else {
        setError("Unknown error");
      }
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [callAstro, instrument, timeframe, from, to, csvText, weights, threshold, minDq]);

  const counters = useMemo(() => {
    const meta = hybrid?.formulaMeta as
      | {
          counters?: Record<string, number>;
          averages?: { hybridScore: number; astroContribution: number; smcContribution: number };
        }
      | undefined;
    return {
      counters: meta?.counters ?? {},
      averages: meta?.averages ?? { hybridScore: 0, astroContribution: 0, smcContribution: 0 },
    };
  }, [hybrid]);

  const exportCsv = () => {
    if (!hybrid) return;
    const rows = [
      [
        `# EagleBABA Hybrid Backtest · ASTRO_SMC_HYBRID_V1`,
        `runId=${hybrid.runId}`,
        `astroRunId=${astro?.runId ?? ""}`,
        `smcRunId=${smc?.runId ?? ""}`,
      ],
      [
        "date","side","entry","stop","target","exit","outcome","pnl","hybridScore","astroContribution","smcContribution","astroDirection",
      ],
      ...hybrid.trades.map((t) => {
        const m = t.metadata as {
          hybridScore?: number;
          astroContribution?: number;
          smcContribution?: number;
          astroDirection?: string | null;
        };
        return [
          t.date, t.side, t.entry, t.stop, t.target, t.exit, t.outcome, t.pnl,
          m.hybridScore ?? 0, m.astroContribution ?? 0, m.smcContribution ?? 0, m.astroDirection ?? "",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    downloadBlob(csv, `eaglebaba-hybrid-${instrument}-${from}-${to}.csv`, "text/csv");
  };
  const exportJson = () => {
    if (!hybrid) return;
    downloadBlob(
      JSON.stringify({ hybrid, astro, smc }, null, 2),
      `eaglebaba-hybrid-${instrument}-${from}-${to}.json`,
      "application/json",
    );
  };

  return (
    <div style={{ display: "grid", gap: 12, fontFamily: "var(--eb-mono)" }}>
      <div style={{ fontSize: 13, color: C.orange, letterSpacing: 1 }}>
        🔀 ASTRO + SMC HYBRID · ASTRO_SMC_HYBRID_V1
      </div>

      <div style={panel}>
        <div style={sectionHead}>1 · Data</div>
        <div style={grid}>
          <Field label="Instrument">
            <select value={instrument} onChange={(e) => setInstrument(e.target.value as SmcInstrument)} style={inputStyle}>
              {SMC_INSTRUMENTS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Timeframe">
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as SmcTimeframe)} style={inputStyle}>
              {SMC_TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Intraday CSV">
            <input type="file" accept=".csv,text/csv" onChange={(e) => onCsvFile(e.target.files?.[0] ?? null)} style={{ ...inputStyle, padding: 4 }} />
            {csvFileName ? <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{csvFileName} · {csvText.length.toLocaleString()} bytes</div> : null}
          </Field>
        </div>
      </div>

      <div style={panel}>
        <div style={sectionHead}>2 · Hybrid Weights &amp; Threshold</div>
        <div style={grid}>
          <NumField label="Astro Weight" value={weights.astro} step={0.05} onChange={(v) => setWeights({ ...weights, astro: v })} />
          <NumField label="SMC Weight" value={weights.smc} step={0.05} onChange={(v) => setWeights({ ...weights, smc: v })} />
          <NumField label="Agreement Bonus" value={weights.agreement} step={0.05} onChange={(v) => setWeights({ ...weights, agreement: v })} />
          <NumField label="Data-Quality Weight" value={weights.dataQuality} step={0.05} onChange={(v) => setWeights({ ...weights, dataQuality: v })} />
          <NumField label="SMC Score Threshold" value={threshold} onChange={setThreshold} />
          <NumField label="Min Data Quality %" value={minDq} onChange={setMinDq} />
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
          Direct BUY/SELL conflicts always resolve to WAIT — weights never override direction.
        </div>
      </div>

      <div style={panel}>
        <button onClick={runNow} disabled={!canRun} style={{ ...btnPrimary, opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }}>
          {loading ? "Running…" : "▶ Run Hybrid Backtest"}
        </button>
        {csvText.trim().length === 0 ? (
          <span style={{ marginLeft: 10, fontSize: 11, color: C.muted }}>Upload intraday CSV first — hybrid needs 5m candles.</span>
        ) : null}
        {error ? <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{error}</div> : null}
      </div>

      {hybrid && astro && smc ? (
        <>
          <div style={panel}>
            <div style={sectionHead}>3 · Three-Way Run IDs (separate runs, no trade merging)</div>
            <div style={{ display: "grid", gap: 4, fontSize: 11 }}>
              <RunIdRow label="Astro" version={astro.astroFormulaVersion} runId={astro.runId} />
              <RunIdRow label="SMC" version={smc.formulaVersion} runId={smc.runId} />
              <RunIdRow label="Hybrid" version={hybrid.formulaVersion} runId={hybrid.runId} />
            </div>
          </div>

          <div style={panel}>
            <div style={sectionHead}>4 · Hybrid Results</div>
            <div style={grid}>
              <KV label="Trades" value={String(hybrid.trades.length)} />
              <KV label="Wins" value={String(hybrid.trades.filter((t) => t.outcome === "WIN").length)} />
              <KV label="Losses" value={String(hybrid.trades.filter((t) => t.outcome === "LOSS").length)} />
              <KV label="Net PnL" value={hybrid.trades.reduce((a, t) => a + t.pnl, 0).toFixed(2)} />
              <KV label="Max Drawdown" value={hybrid.drawdown ? hybrid.drawdown.max.toFixed(2) : "—"} />
              <KV label="Avg Hybrid Score" value={String(counters.averages.hybridScore)} />
              <KV label="Avg Astro Contribution" value={String(counters.averages.astroContribution)} />
              <KV label="Avg SMC Contribution" value={String(counters.averages.smcContribution)} />
            </div>
          </div>

          <div style={panel}>
            <div style={sectionHead}>5 · Signal Alignment Counters</div>
            <div style={grid}>
              <KV label="Agreement (BUY)" value={String(counters.counters.BUY ?? 0)} />
              <KV label="Agreement (SELL)" value={String(counters.counters.SELL ?? 0)} />
              <KV label="WAIT" value={String(counters.counters.WAIT ?? 0)} />
              <KV label="Conflict" value={String(counters.counters.CONFLICT ?? 0)} />
              <KV label="Data Incomplete" value={String(counters.counters.DATA_INCOMPLETE ?? 0)} />
              <KV label="Formula Mismatch" value={String(counters.counters.FORMULA_MISMATCH ?? 0)} />
            </div>
          </div>

          <div style={panel}>
            <div style={sectionHead}>6 · Data Quality</div>
            {data ? (
              <div style={grid}>
                <KV label="Provider" value={data.provider} />
                <KV label="Candles" value={String(data.candles.length)} />
                <KV label="Coverage" value={`${data.dataQuality.coveragePct}%`} />
                <KV label="Data Hash" value={data.dataHash} />
              </div>
            ) : null}
          </div>

          <div style={panel}>
            <div style={sectionHead}>7 · Exports</div>
            <button onClick={exportCsv} style={btnSecondary}>Download CSV</button>
            <button onClick={exportJson} style={{ ...btnSecondary, marginLeft: 8 }}>Download JSON</button>
          </div>

          <div style={panel}>
            <div style={sectionHead}>8 · Methodology</div>
            <div style={{ fontSize: 11, color: C.muted, whiteSpace: "pre-wrap" }}>
              {hybrid.methodology}
              {"\n\n"}
              {hybrid.disclaimers.join("\n")}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 10, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}
function NumField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={inputStyle} />
    </Field>
  );
}
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderBottom: `1px solid ${C.border}`, padding: "3px 0" }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}
function RunIdRow({ label, version, runId }: { label: string; version: string; runId: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8 }}>
      <span style={{ color: C.orange }}>{label}</span>
      <span style={{ color: C.muted, wordBreak: "break-all" }}>{version} · {runId}</span>
    </div>
  );
}

const panel: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 };
const sectionHead: React.CSSProperties = { fontSize: 12, letterSpacing: 1, color: C.orange, marginBottom: 8 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };
const inputStyle: React.CSSProperties = {
  background: C.bg,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  padding: "6px 8px",
  fontFamily: "var(--eb-mono)",
  fontSize: 12,
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
const btnSecondary: React.CSSProperties = {
  background: "transparent",
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  padding: "6px 12px",
  fontFamily: "var(--eb-mono)",
  fontSize: 12,
  cursor: "pointer",
};