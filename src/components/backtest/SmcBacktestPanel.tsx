// Phase 21.4 · Stage 4A — SMC backtest panel.
//
// Client-only. Lazy-loaded from /backtest so SMC modules never enter the
// Astro-mode bundle. Owns CSV upload, settings, single-shot dispatch and
// results rendering. All heavy math (structure, signals, execution) is
// executed via the shared unified runner — no engine duplication here.

import { useCallback, useMemo, useRef, useState } from "react";
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
  type SmcSignalConfig,
} from "@/lib/smc-signal-engine";
import {
  DEFAULT_SMC_EXECUTION,
  type SmcExecutionConfig,
} from "@/lib/backtest/adapters/smc-historical.adapter";
import { INTRADAY_FORMULA_VERSIONS } from "@/lib/engine-version";
import { downloadBlob } from "@/lib/download";
import type { HistoricalBacktestResult } from "@/lib/backtest/result";
import type { CostModel } from "@/lib/backtest/cost-model";

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

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type Mode = "csv" | "provider";

export default function SmcBacktestPanel() {
  const [instrument, setInstrument] = useState<SmcInstrument>("NIFTY50");
  const [timeframe, setTimeframe] = useState<SmcTimeframe>("5m");
  const [from, setFrom] = useState<string>(isoDaysAgo(30));
  const [to, setTo] = useState<string>(today());
  const [mode, setMode] = useState<Mode>("csv");
  const [providerName, setProviderName] = useState<string>("Zerodha");
  const [csvText, setCsvText] = useState<string>("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);

  const [signalCfg, setSignalCfg] = useState<SmcSignalConfig>({
    ...DEFAULT_SMC_SIGNAL_CONFIG,
  });
  const [exec, setExec] = useState<SmcExecutionConfig>({
    ...DEFAULT_SMC_EXECUTION,
  });
  const [costs, setCosts] = useState<CostModel>({
    slippagePct: 0,
    brokerageFlat: 0,
    brokeragePct: 0,
    taxesPct: 0,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LoadSmcCandlesResult | null>(null);
  const [result, setResult] = useState<HistoricalBacktestResult | null>(null);
  const runningRef = useRef(false);

  const onCsvFile = useCallback((f: File | null) => {
    if (!f) return;
    setCsvFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(f);
  }, []);

  const canRun =
    !loading &&
    !runningRef.current &&
    (mode === "provider" || csvText.trim().length > 0);

  const runNow = useCallback(async () => {
    if (runningRef.current) return; // overlapping-run guard
    runningRef.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const loaded = await loadSmcCandles({
        instrument,
        timeframe,
        from,
        to,
        timezone: "Asia/Kolkata",
        source:
          mode === "csv"
            ? { kind: "csv", csv: csvText, provider: "Zerodha" }
            : { kind: "provider", provider: providerName },
      });
      setData(loaded);

      // Stage 1 + Stage 2 — pure engines, called exactly once per run.
      const engine = analyzeSmc([...loaded.candles]);
      const signals = analyzeSmcSignals([...loaded.candles], engine, signalCfg);

      const res = await runUnifiedBacktest({
        strategy: "SMC",
        formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
        instrument,
        from,
        to,
        costs,
        source: `${loaded.provider}#${loaded.dataHash}#${timeframe}`,
        policy: "conservative",
        ambiguousPolicy: "conservative",
        extras: {
          candles: loaded.candles,
          signals: signals.signals,
          engine,
          execution: exec,
        },
      });
      setResult(res);
    } catch (e) {
      if (e instanceof SmcDataRangeUnavailableError) {
        setError(e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Unknown error");
      }
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [
    instrument,
    timeframe,
    from,
    to,
    mode,
    providerName,
    csvText,
    signalCfg,
    exec,
    costs,
  ]);

  const stats = useMemo(() => summarize(result), [result]);

  return (
    <div style={{ display: "grid", gap: 12, fontFamily: "var(--eb-mono)" }}>
      <div style={{ fontSize: 13, color: C.orange, letterSpacing: 1 }}>
        🧭 SMC HISTORICAL BACKTEST · SMC_V1
      </div>

      {/* Data input */}
      <div style={panel}>
        <div style={sectionHead}>1 · Data</div>
        <div style={grid}>
          <Field label="Instrument">
            <select
              value={instrument}
              onChange={(e) => setInstrument(e.target.value as SmcInstrument)}
              style={inputStyle}
            >
              {SMC_INSTRUMENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timeframe">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as SmcTimeframe)}
              style={inputStyle}
            >
              {SMC_TIMEFRAMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Source">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              style={inputStyle}
            >
              <option value="csv">CSV Upload</option>
              <option value="provider">Provider Fetch</option>
            </select>
          </Field>
          {mode === "provider" ? (
            <Field label="Provider">
              <input
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                style={inputStyle}
              />
            </Field>
          ) : (
            <Field label="CSV">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onCsvFile(e.target.files?.[0] ?? null)}
                style={{ ...inputStyle, padding: 4 }}
              />
              {csvFileName ? (
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                  {csvFileName} · {csvText.length.toLocaleString()} bytes
                </div>
              ) : null}
            </Field>
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            onClick={runNow}
            disabled={!canRun}
            style={{
              ...btnPrimary,
              opacity: !canRun ? 0.5 : 1,
              cursor: !canRun ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Running…" : "▶ Run SMC Backtest"}
          </button>
          {mode === "provider" ? (
            <span
              style={{
                marginLeft: 10,
                fontSize: 11,
                color: C.muted,
              }}
            >
              Provider fetch returns DATA_RANGE_UNAVAILABLE — no client-safe
              intraday feed is wired in this stage. Import a CSV instead.
            </span>
          ) : null}
        </div>
        {error ? (
          <div style={{ marginTop: 10, color: C.red, fontSize: 12 }}>{error}</div>
        ) : null}
      </div>

      {/* Signal settings */}
      <div style={panel}>
        <div style={sectionHead}>2 · Signal Settings</div>
        <div style={grid}>
          <NumField
            label="Min Score"
            value={signalCfg.minScore}
            onChange={(v) => setSignalCfg({ ...signalCfg, minScore: v })}
          />
          <NumField
            label="Structure Window"
            value={signalCfg.structureWindow}
            onChange={(v) => setSignalCfg({ ...signalCfg, structureWindow: v })}
          />
          <NumField
            label="FVG Validity"
            value={signalCfg.fvgValidityBars}
            onChange={(v) => setSignalCfg({ ...signalCfg, fvgValidityBars: v })}
          />
          <NumField
            label="OB Validity"
            value={signalCfg.obValidityBars}
            onChange={(v) => setSignalCfg({ ...signalCfg, obValidityBars: v })}
          />
          <NumField
            label="Cooldown Bars"
            value={signalCfg.cooldownBars}
            onChange={(v) => setSignalCfg({ ...signalCfg, cooldownBars: v })}
          />
          <BoolField
            label="EMA Filter"
            value={signalCfg.emaEnabled}
            onChange={(v) => setSignalCfg({ ...signalCfg, emaEnabled: v })}
          />
          <BoolField
            label="VWAP Filter"
            value={signalCfg.vwapEnabled}
            onChange={(v) => setSignalCfg({ ...signalCfg, vwapEnabled: v })}
          />
          <BoolField
            label="Premium/Discount"
            value={signalCfg.premiumDiscountEnabled}
            onChange={(v) =>
              setSignalCfg({ ...signalCfg, premiumDiscountEnabled: v })
            }
          />
          <BoolField
            label="Volume Filter"
            value={signalCfg.volumeEnabled}
            onChange={(v) => setSignalCfg({ ...signalCfg, volumeEnabled: v })}
          />
          <BoolField
            label="Session Filter"
            value={signalCfg.sessionEnabled}
            onChange={(v) => setSignalCfg({ ...signalCfg, sessionEnabled: v })}
          />
        </div>
      </div>

      {/* Execution settings */}
      <div style={panel}>
        <div style={sectionHead}>3 · Execution</div>
        <div style={grid}>
          <Field label="Entry">
            <select
              value={exec.entryMode}
              onChange={(e) =>
                setExec({
                  ...exec,
                  entryMode: e.target.value as SmcExecutionConfig["entryMode"],
                })
              }
              style={inputStyle}
            >
              <option value="next_open">Next Candle Open</option>
              <option value="signal_close">Signal Close</option>
            </select>
          </Field>
          <Field label="Stop">
            <select
              value={exec.stopMode}
              onChange={(e) =>
                setExec({
                  ...exec,
                  stopMode: e.target.value as SmcExecutionConfig["stopMode"],
                })
              }
              style={inputStyle}
            >
              <option value="swing">Swing</option>
              <option value="atr">ATR</option>
              <option value="order_block">Order Block</option>
              <option value="liquidity">Liquidity</option>
            </select>
          </Field>
          <Field label="Target">
            <select
              value={exec.targetMode}
              onChange={(e) =>
                setExec({
                  ...exec,
                  targetMode: e.target
                    .value as SmcExecutionConfig["targetMode"],
                })
              }
              style={inputStyle}
            >
              <option value="fixed_rr">Fixed RR</option>
              <option value="opposing_liquidity">Opposing Liquidity</option>
              <option value="nearest_structure">Nearest Structure</option>
            </select>
          </Field>
          <Field label="RR">
            <select
              value={exec.rr}
              onChange={(e) => setExec({ ...exec, rr: Number(e.target.value) })}
              style={inputStyle}
            >
              {[1, 1.5, 2, 3].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Position Mode">
            <select
              value={exec.positionMode}
              onChange={(e) =>
                setExec({
                  ...exec,
                  positionMode: e.target
                    .value as SmcExecutionConfig["positionMode"],
                })
              }
              style={inputStyle}
            >
              <option value="both">Long + Short</option>
              <option value="long">Long Only</option>
              <option value="short">Short Only</option>
            </select>
          </Field>
          <NumField
            label="Max Hold Bars"
            value={exec.maxHoldBars ?? 0}
            onChange={(v) =>
              setExec({ ...exec, maxHoldBars: v > 0 ? v : null })
            }
          />
          <NumField
            label="Quantity"
            value={exec.quantity}
            onChange={(v) => setExec({ ...exec, quantity: v })}
          />
          <NumField
            label="Point Value"
            value={exec.pointValue}
            onChange={(v) => setExec({ ...exec, pointValue: v })}
          />
        </div>
      </div>

      {/* Costs */}
      <div style={panel}>
        <div style={sectionHead}>4 · Costs</div>
        <div style={grid}>
          <NumField
            label="Slippage %"
            value={costs.slippagePct}
            onChange={(v) => setCosts({ ...costs, slippagePct: v })}
          />
          <NumField
            label="Brokerage Flat"
            value={costs.brokerageFlat}
            onChange={(v) => setCosts({ ...costs, brokerageFlat: v })}
          />
          <NumField
            label="Brokerage %"
            value={costs.brokeragePct}
            onChange={(v) => setCosts({ ...costs, brokeragePct: v })}
          />
          <NumField
            label="Taxes %"
            value={costs.taxesPct}
            onChange={(v) => setCosts({ ...costs, taxesPct: v })}
          />
        </div>
      </div>

      {/* Data quality */}
      {data ? (
        <div style={panel}>
          <div style={sectionHead}>5 · Data Quality</div>
          <div style={grid}>
            <KV label="Provider" value={data.provider} />
            <KV
              label="Range"
              value={`${data.actualFrom ?? "—"} → ${data.actualTo ?? "—"}`}
            />
            <KV label="Candles" value={String(data.candles.length)} />
            <KV label="Coverage" value={`${data.dataQuality.coveragePct}%`} />
            <KV
              label="Missing"
              value={String(data.dataQuality.missingSessions)}
            />
            <KV
              label="Invalid"
              value={String(data.dataQuality.invalidCandles)}
            />
            <KV label="Data Hash" value={data.dataHash} />
            <KV label="Timezone" value="Asia/Kolkata" />
          </div>
        </div>
      ) : null}

      {/* Results */}
      {result ? (
        <div style={panel}>
          <div style={sectionHead}>6 · Results</div>
          <div style={grid}>
            <KV label="Trades" value={String(result.trades.length)} />
            <KV label="Wins" value={String(stats.wins)} />
            <KV label="Losses" value={String(stats.losses)} />
            <KV label="Win Rate" value={`${stats.winRate}%`} />
            <KV label="Profit Factor" value={stats.pfLabel} />
            <KV label="Net PnL" value={stats.netPnl.toFixed(2)} />
            <KV label="Expectancy" value={stats.expectancy.toFixed(2)} />
            <KV
              label="Max Drawdown"
              value={
                result.drawdown
                  ? `${result.drawdown.max.toFixed(2)} (${result.drawdown.maxPct}%)`
                  : "—"
              }
            />
            <KV label="Avg MFE" value={stats.avgMfe.toFixed(2)} />
            <KV label="Avg MAE" value={stats.avgMae.toFixed(2)} />
            <KV
              label="Long Win %"
              value={`${stats.longWinRate}% (${stats.longs})`}
            />
            <KV
              label="Short Win %"
              value={`${stats.shortWinRate}% (${stats.shorts})`}
            />
            <KV label="Avg Hold Bars" value={stats.avgHoldBars.toFixed(1)} />
            <KV label="Run ID" value={result.runId} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              style={btnGhost}
              onClick={() =>
                downloadBlob(
                  toCsv(result),
                  `smc-backtest-${instrument}-${timeframe}-${from}-${to}.csv`,
                  "text/csv",
                )
              }
            >
              ⬇ CSV
            </button>
            <button
              style={btnGhost}
              onClick={() =>
                downloadBlob(
                  JSON.stringify(result, null, 2),
                  `smc-backtest-${instrument}-${timeframe}-${from}-${to}.json`,
                  "application/json",
                )
              }
            >
              ⬇ JSON
            </button>
          </div>
          <TradeLog result={result} />
          <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>
            {result.methodology}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function summarize(r: HistoricalBacktestResult | null) {
  if (!r || r.trades.length === 0) {
    return {
      wins: 0,
      losses: 0,
      winRate: 0,
      pfLabel: "—",
      netPnl: 0,
      expectancy: 0,
      avgMfe: 0,
      avgMae: 0,
      longs: 0,
      shorts: 0,
      longWinRate: 0,
      shortWinRate: 0,
      avgHoldBars: 0,
    };
  }
  let wins = 0, losses = 0, gross = 0, lossAbs = 0, netPnl = 0;
  let mfeSum = 0, mfeN = 0, maeSum = 0, maeN = 0;
  let longs = 0, longWins = 0, shorts = 0, shortWins = 0;
  let bars = 0, barsN = 0;
  for (const t of r.trades) {
    netPnl += t.pnl;
    if (t.outcome === "WIN") { wins++; gross += t.pnl; }
    else if (t.outcome === "LOSS") { losses++; lossAbs += Math.abs(t.pnl); }
    if (t.mfe != null) { mfeSum += t.mfe; mfeN++; }
    if (t.mae != null) { maeSum += t.mae; maeN++; }
    if (t.side === "BUY") { longs++; if (t.outcome === "WIN") longWins++; }
    if (t.side === "SELL") { shorts++; if (t.outcome === "WIN") shortWins++; }
    const b = (t.metadata as { holdingBars?: number }).holdingBars;
    if (typeof b === "number") { bars += b; barsN++; }
  }
  const decided = wins + losses;
  return {
    wins,
    losses,
    winRate: decided > 0 ? Math.round((wins / decided) * 1000) / 10 : 0,
    pfLabel: lossAbs > 0 ? (gross / lossAbs).toFixed(2) : gross > 0 ? "∞" : "—",
    netPnl,
    expectancy: r.trades.length > 0 ? netPnl / r.trades.length : 0,
    avgMfe: mfeN > 0 ? mfeSum / mfeN : 0,
    avgMae: maeN > 0 ? maeSum / maeN : 0,
    longs,
    shorts,
    longWinRate: longs > 0 ? Math.round((longWins / longs) * 1000) / 10 : 0,
    shortWinRate:
      shorts > 0 ? Math.round((shortWins / shorts) * 1000) / 10 : 0,
    avgHoldBars: barsN > 0 ? bars / barsN : 0,
  };
}

function toCsv(r: HistoricalBacktestResult): string {
  const head = [
    "# SMC Historical Backtest",
    `formula=${r.formulaVersion}`,
    `runId=${r.runId}`,
    `range=${r.from}..${r.to}`,
    `instrument=${r.instrument}`,
    `source=${r.source}`,
  ].join("\n");
  const cols = [
    "date","side","entry","stop","target","exit","outcome","pnl","mfe","mae","holdingTime","reasons",
  ];
  const rows = r.trades.map((t) =>
    [
      t.date, t.side, t.entry, t.stop, t.target, t.exit, t.outcome,
      t.pnl, t.mfe, t.mae, t.holdingTime, JSON.stringify(t.reasons),
    ].map(csvCell).join(","),
  );
  return `${head}\n${cols.join(",")}\n${rows.join("\n")}`;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function TradeLog({ result }: { result: HistoricalBacktestResult }) {
  const [page, setPage] = useState(0);
  const PAGE = 25;
  const total = result.trades.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const start = page * PAGE;
  const rows = useMemo(
    () => result.trades.slice(start, start + PAGE),
    [result, start],
  );
  if (total === 0) return null;
  return (
    <div style={{ marginTop: 12, overflowX: "auto" }}>
      <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: "left" }}>
            {["Date","Side","Entry","Stop","Target","Exit","Outcome","PnL","Score"].map((h) => (
              <th key={h} style={{ borderBottom: `1px solid ${C.border}`, padding: "4px 6px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const score = (t.metadata as { signalScore?: number }).signalScore;
            return (
              <tr key={`${t.id}-${i}`}>
                <td style={td}>{t.date}</td>
                <td style={{ ...td, color: t.side === "BUY" ? C.green : C.red }}>{t.side}</td>
                <td style={td}>{t.entry ?? "—"}</td>
                <td style={td}>{t.stop ?? "—"}</td>
                <td style={td}>{t.target ?? "—"}</td>
                <td style={td}>{t.exit ?? "—"}</td>
                <td style={td}>{t.outcome}</td>
                <td style={{ ...td, color: t.pnl >= 0 ? C.green : C.red }}>{t.pnl.toFixed(2)}</td>
                <td style={td}>{score ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: C.muted }}>
        <span>{total} trades · showing {start + 1}–{Math.min(start + PAGE, total)}</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button style={btnGhost} onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>‹</button>
          <span>{page + 1}/{pages}</span>
          <button style={btnGhost} onClick={() => setPage(Math.min(pages - 1, page + 1))} disabled={page + 1 >= pages}>›</button>
        </span>
      </div>
    </div>
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
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={inputStyle}
      />
    </Field>
  );
}
function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (b: boolean) => void }) {
  return (
    <Field label={label}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        {value ? "On" : "Off"}
      </label>
    </Field>
  );
}
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 3, wordBreak: "break-all" }}>{value}</div>
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
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 8,
};
const fieldLbl: React.CSSProperties = {
  fontSize: 10,
  color: C.muted,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: C.bg,
  border: `1px solid ${C.border}`,
  color: C.text,
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
const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  padding: "5px 10px",
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
  cursor: "pointer",
};
const td: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: `1px solid ${C.border}`,
};