import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { runBacktest, BACKTEST_SYMBOLS, type BacktestResult, type BacktestSymbol, type BacktestTrade } from "@/lib/backtest.functions";
import { downloadBlob } from "@/lib/download";
import { FormulaBadge } from "@/components/FormulaBadge";
import { astroFormulaSlug } from "@/lib/engine-version";
import { StrategySelector } from "@/components/backtest/StrategySelector";
import { FormulaSelector } from "@/components/backtest/FormulaSelector";
import { getStrategyAdapter, type StrategyId } from "@/lib/backtest/strategy";
import type { UnifiedFormulaId } from "@/lib/backtest/result";

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

const PERIODS = [
  { key: "1M", label: "1 Month",  days: 30   },
  { key: "3M", label: "3 Months", days: 90   },
  { key: "6M", label: "6 Months", days: 182  },
  { key: "1Y", label: "1 Year",   days: 365  },
  { key: "2Y", label: "2 Years",  days: 730  },
  { key: "5Y", label: "5 Years",  days: 1825 },
] as const;
type PeriodKey = typeof PERIODS[number]["key"] | "CUSTOM";

const SIGNALS = ["ALL", "BUY", "SELL", "WAIT"] as const;
type SignalFilter = typeof SIGNALS[number];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}
function todayIso(): string { return new Date().toISOString().slice(0, 10); }

export const Route = createFileRoute("/backtest")({
  component: BacktestPage,
  head: () => ({
    meta: [
      { title: "Historical Backtest | EagleBABA Astro Levels" },
      {
        name: "description",
        content:
          "Institutional backtesting engine measuring the historical accuracy of EagleBABA astro BUY / SELL / WAIT signals across NIFTY 50, BANK NIFTY, GOLD, SILVER and BTC.",
      },
      { property: "og:title", content: "Historical Backtest | EagleBABA" },
      { property: "og:description", content: "Replay every trading day. Measure win rate, profit factor, drawdown and monthly PnL for EagleBABA astro signals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function BacktestPage() {
  // Phase 21.3d · Strategy + Formula selectors are wired at the UI layer.
  // Only Astro strategy + Sign-Degree formula executes through the existing
  // production backtest path. Legacy / Absolute formulas surface a notice
  // pointing at their current dedicated surfaces so no output changes.
  const [strategy, setStrategy] = useState<StrategyId>("ASTRO");
  const astroDefault =
    getStrategyAdapter("ASTRO").defaultFormulaVersion ??
    ("GANN_SIGN_DEGREE_TABLE_V1_1" as UnifiedFormulaId);
  const [formula, setFormula] = useState<UnifiedFormulaId>(astroDefault);

  const [symbol, setSymbol] = useState<BacktestSymbol>("NIFTY50");
  const [period, setPeriod] = useState<PeriodKey>("6M");
  const [from, setFrom] = useState<string>(isoDaysAgo(182));
  const [to, setTo] = useState<string>(todayIso());
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("ALL");
  const [nakshatraFilter, setNakshatraFilter] = useState<string>("ALL");
  const [moonSignFilter, setMoonSignFilter] = useState<string>("ALL");
  const [dayFilter, setDayFilter] = useState<string>("ALL");
  const [monthFilter, setMonthFilter] = useState<string>("ALL");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const call = useServerFn(runBacktest);

  const onPeriod = (k: PeriodKey) => {
    setPeriod(k);
    if (k !== "CUSTOM") {
      const p = PERIODS.find((x) => x.key === k)!;
      setFrom(isoDaysAgo(p.days));
      setTo(todayIso());
    }
  };

  const runNow = async () => {
    // Sign-Degree is the only formula wired to the shared runBacktest path.
    if (formula !== "GANN_SIGN_DEGREE_TABLE_V1_1") {
      setError(
        formula === "GANN_ASTRO_INTRADAY_ABSOLUTE_V1"
          ? "Absolute-Degree Intraday runs on the dedicated validation surface. Open /absolute-intraday-validation to execute this formula."
          : "Legacy Cascade v1 currently runs from its own preview export. Unified /backtest wiring is COMING NEXT.",
      );
      return;
    }
    setLoading(true); setError(null);
    try {
      const res = await call({ data: { symbol, from, to } });
      setResult(res);
    } catch (e) {
      setError(mapTypedError(e));
    } finally { setLoading(false); }
  };

  const filtered = useMemo<BacktestTrade[]>(() => {
    if (!result) return [];
    return result.trades.filter((t) =>
      (signalFilter === "ALL" || t.signal === signalFilter) &&
      (nakshatraFilter === "ALL" || t.moonNakshatra === nakshatraFilter) &&
      (moonSignFilter === "ALL" || t.moonSign === moonSignFilter) &&
      (dayFilter === "ALL" || t.dayOfWeek === dayFilter) &&
      (monthFilter === "ALL" || t.month === monthFilter),
    );
  }, [result, signalFilter, nakshatraFilter, moonSignFilter, dayFilter, monthFilter]);

  const nakOptions = useMemo(() => uniq(result?.trades.map((t) => t.moonNakshatra) ?? []), [result]);
  const signOptions = useMemo(() => uniq(result?.trades.map((t) => t.moonSign) ?? []), [result]);
  const dowOptions = useMemo(() => uniq(result?.trades.map((t) => t.dayOfWeek) ?? []), [result]);
  const monthOptions = useMemo(() => uniq(result?.trades.map((t) => t.month) ?? []), [result]);

  const exportCsv = () => {
    if (!result) return;
    const slug = astroFormulaSlug(result.astroFormulaVersion);
    const rows = [
      [`# EagleBABA Backtest · ${result.astroFormulaVersion}`, `engine=${result.engineVersion}`, `formula=${result.formulaVersion}`, `generatedAt=${result.generatedAt}`, `runId=${result.runId}`],
      ["date","time","symbol","signal","strength","confidence","entry","exit","high","low","target","stop","targetHit","stopHit","result","pnl","pnlPct","moonSign","moonNakshatra","retroCount","nearest","dayOfWeek","month"],
      ...filtered.map((t) => [
        t.date,t.time,t.symbol,t.signal,t.strength,t.confidence,t.entry,t.exit,t.high,t.low,t.target,t.stop,
        t.targetHit,t.stopHit,t.result,t.pnl,t.pnlPct,t.moonSign,t.moonNakshatra,t.retroCount,t.nearest ?? "",t.dayOfWeek,t.month,
      ]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    downloadBlob(csv, `eaglebaba-backtest-${symbol}-${slug}-${from}-${to}.csv`, "text/csv");
  };
  const exportJson = () => {
    if (!result) return;
    const slug = astroFormulaSlug(result.astroFormulaVersion);
    downloadBlob(JSON.stringify(result, null, 2), `eaglebaba-backtest-${symbol}-${slug}-${from}-${to}.json`, "application/json");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "18px 16px 96px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "var(--eb-head)", fontSize: 20, letterSpacing: 2, color: C.orange }}>
            🧪 HISTORICAL BACKTEST · EAGLEBABA ASTRO LEVELS
          </div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 4 }}>
            Replay every trading day · reuses the live signal engine · no formula duplication
          </div>
          {result ? (
            <div style={{ marginTop: 6 }}>
              <FormulaBadge version={result.astroFormulaVersion} />
            </div>
          ) : null}
        </div>
        <Link to="/" style={{ color: C.blue, fontFamily: "var(--eb-mono)", fontSize: 12 }}>← Dashboard</Link>
      </header>

      {/* Controls */}
      <section style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={fieldLbl}>Strategy</div>
            <StrategySelector value={strategy} onChange={setStrategy} />
          </div>
          {strategy === "ASTRO" ? (
            <div>
              <div style={fieldLbl}>Formula</div>
              <FormulaSelector strategy={strategy} value={formula} onChange={setFormula} />
              {formula !== "GANN_SIGN_DEGREE_TABLE_V1_1" ? (
                <div style={{ marginTop: 6, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
                  {formula === "GANN_ASTRO_INTRADAY_ABSOLUTE_V1" ? (
                    <>
                      Absolute-Degree Intraday runs on{" "}
                      <Link to="/absolute-intraday-validation" style={{ color: C.blue }}>
                        /absolute-intraday-validation
                      </Link>{" "}
                      — unified execution is COMING NEXT.
                    </>
                  ) : (
                    <>Legacy Cascade v1 unified execution is COMING NEXT.</>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.orange }}>
              COMING NEXT — {strategy} strategy adapter is not yet wired.
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div>
            <div style={fieldLbl}>Instrument</div>
            <select value={symbol} onChange={(e) => setSymbol(e.target.value as BacktestSymbol)} style={selectStyle}>
              {(Object.keys(BACKTEST_SYMBOLS) as BacktestSymbol[]).map((k) => (
                <option key={k} value={k}>{BACKTEST_SYMBOLS[k].label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={fieldLbl}>Period</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => onPeriod(p.key)}
                  style={{ ...chip, background: period === p.key ? C.orange : "transparent", color: period === p.key ? "#04140b" : C.text }}>
                  {p.key}
                </button>
              ))}
              <button onClick={() => onPeriod("CUSTOM")}
                style={{ ...chip, background: period === "CUSTOM" ? C.orange : "transparent", color: period === "CUSTOM" ? "#04140b" : C.text }}>
                Custom
              </button>
            </div>
          </div>
          <div>
            <div style={fieldLbl}>From</div>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPeriod("CUSTOM"); }} style={selectStyle} />
          </div>
          <div>
            <div style={fieldLbl}>To</div>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPeriod("CUSTOM"); }} style={selectStyle} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={runNow} disabled={loading || strategy !== "ASTRO"}
              style={{ ...btnPrimary, opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer" }}>
              {loading ? "Running…" : "▶ Run Backtest"}
            </button>
          </div>
        </div>
        {loading ? (
          <div style={{ marginTop: 10, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
            Running · Strategy={strategy} · Formula={formula} · Instrument={symbol} · {from} → {to}
          </div>
        ) : null}
        {error ? (
          <div style={{ marginTop: 10, color: C.red, fontFamily: "var(--eb-mono)", fontSize: 12 }}>{error}</div>
        ) : null}
      </section>

      {!result && !loading ? (
        <section style={{ ...panel, marginTop: 14, textAlign: "center", color: C.muted, fontFamily: "var(--eb-mono)", fontSize: 13 }}>
          Choose an instrument &amp; period, then run the backtest to replay historical astro signals.
        </section>
      ) : null}

      {result ? (
        <>
          <SummaryCards r={result} />
          <IntegrityPanel r={result} />
          <FiltersBar
            signals={SIGNALS} signalFilter={signalFilter} setSignalFilter={setSignalFilter}
            nakOptions={nakOptions} nakshatraFilter={nakshatraFilter} setNakshatraFilter={setNakshatraFilter}
            signOptions={signOptions} moonSignFilter={moonSignFilter} setMoonSignFilter={setMoonSignFilter}
            dowOptions={dowOptions} dayFilter={dayFilter} setDayFilter={setDayFilter}
            monthOptions={monthOptions} monthFilter={monthFilter} setMonthFilter={setMonthFilter}
            onCsv={exportCsv} onJson={exportJson}
          />
          <AiInsights r={result} />
          <MonthlyTable r={result} />
          <EquityCurve r={result} />
          <TradesTable trades={filtered} totalCount={result.trades.length} />
          <MethodologyDrawer r={result} />
        </>
      ) : null}
    </div>
  );
}

/* ------------------------ subcomponents ------------------------ */

function SummaryCards({ r }: { r: BacktestResult }) {
  const s = r.summary;
  const cards: [string, string, string?][] = [
    ["Total Signals", String(s.totalSignals)],
    ["Trades Taken",  String(s.taken)],
    ["Win Rate",      `${s.winRate}%`, s.winRate >= 55 ? "bull" : s.winRate <= 45 ? "bear" : ""],
    ["Accuracy",      `${s.accuracy}%`],
    ["Profit Factor", s.profitFactor >= 999 ? "∞" : String(s.profitFactor), s.profitFactor >= 1.5 ? "bull" : s.profitFactor < 1 ? "bear" : ""],
    ["Net PnL",       formatNum(s.netProfit), s.netProfit >= 0 ? "bull" : "bear"],
    ["Max Drawdown",  formatNum(-s.maxDrawdown), "bear"],
    ["Max Wins Row",  String(s.maxConsecWins)],
    ["Max Loss Row",  String(s.maxConsecLosses)],
    ["Avg Profit",    formatNum(s.avgProfit), "bull"],
    ["Avg Loss",      formatNum(-s.avgLoss), "bear"],
    ["Best Month",    s.bestMonth ? `${s.bestMonth.month} · ${formatNum(s.bestMonth.pnl)}` : "—"],
    ["Worst Month",   s.worstMonth ? `${s.worstMonth.month} · ${formatNum(s.worstMonth.pnl)}` : "—"],
    ["Buy · Sell · Wait", `${s.buy} · ${s.sell} · ${s.wait}`],
  ];
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>📊 Performance Dashboard</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        {cards.map(([label, value, tone]) => (
          <div key={label} style={{ background: "var(--eb-bg)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, letterSpacing: 0.6, color: C.muted, textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 16, fontWeight: 700, marginTop: 4, color: tone === "bull" ? C.green : tone === "bear" ? C.red : C.text }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FiltersBar(props: {
  signals: readonly SignalFilter[]; signalFilter: SignalFilter; setSignalFilter: (v: SignalFilter) => void;
  nakOptions: string[]; nakshatraFilter: string; setNakshatraFilter: (v: string) => void;
  signOptions: string[]; moonSignFilter: string; setMoonSignFilter: (v: string) => void;
  dowOptions: string[]; dayFilter: string; setDayFilter: (v: string) => void;
  monthOptions: string[]; monthFilter: string; setMonthFilter: (v: string) => void;
  onCsv: () => void; onJson: () => void;
}) {
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <SectionHead>🎯 Filters</SectionHead>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={props.onCsv} style={btnGhost}>⬇ CSV</button>
          <button onClick={props.onJson} style={btnGhost}>⬇ JSON</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 }}>
        <LabeledSelect label="Signal" value={props.signalFilter} onChange={(v) => props.setSignalFilter(v as SignalFilter)} options={[...props.signals]} />
        <LabeledSelect label="Nakshatra" value={props.nakshatraFilter} onChange={props.setNakshatraFilter} options={["ALL", ...props.nakOptions]} />
        <LabeledSelect label="Moon Sign" value={props.moonSignFilter} onChange={props.setMoonSignFilter} options={["ALL", ...props.signOptions]} />
        <LabeledSelect label="Day of Week" value={props.dayFilter} onChange={props.setDayFilter} options={["ALL", ...props.dowOptions]} />
        <LabeledSelect label="Month" value={props.monthFilter} onChange={props.setMonthFilter} options={["ALL", ...props.monthOptions]} />
      </div>
    </section>
  );
}

function AiInsights({ r }: { r: BacktestResult }) {
  const i = r.insights;
  const rows: [string, ReturnType<() => typeof i.bestNakshatra>][] = [
    ["🌟 Best Nakshatra", i.bestNakshatra],
    ["💀 Worst Nakshatra", i.worstNakshatra],
    ["🌕 Best Moon Sign", i.bestMoonSign],
    ["🌑 Worst Moon Sign", i.worstMoonSign],
    ["♻️ Best Retro Combo", i.bestRetroCombo],
    ["⚠️ Worst Retro Combo", i.worstRetroCombo],
    ["🟢 Most Successful Signal", i.mostSuccessfulSignal],
    ["🔴 Most Failed Signal", i.mostFailedSignal],
  ];
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>🧠 AI Insights</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
        {rows.map(([label, ins]) => (
          <div key={label} style={{ background: "var(--eb-bg)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
            {ins ? (
              <>
                <div style={{ fontFamily: "var(--eb-mono)", fontSize: 14, fontWeight: 700, marginTop: 4 }}>{ins.key}</div>
                <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {ins.trades} trades · {ins.winRate}% WR · {formatNum(ins.pnl)}
                </div>
              </>
            ) : (
              <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, color: C.muted, marginTop: 6 }}>Not enough data</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function MonthlyTable({ r }: { r: BacktestResult }) {
  if (r.monthly.length === 0) return null;
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>📅 Monthly Analysis</SectionHead>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {["Month","Trades","Wins","Losses","Accuracy","PnL"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.monthly.map((m) => (
              <tr key={m.month} style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                <td style={td}>{m.month}</td>
                <td style={td}>{m.trades}</td>
                <td style={{ ...td, color: C.green }}>{m.wins}</td>
                <td style={{ ...td, color: C.red }}>{m.losses}</td>
                <td style={td}>{m.accuracy}%</td>
                <td style={{ ...td, color: m.pnl >= 0 ? C.green : C.red, fontWeight: 700 }}>{formatNum(m.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EquityCurve({ r }: { r: BacktestResult }) {
  if (r.equityCurve.length < 2) return null;
  const vals = r.equityCurve.map((p) => p.cumulative);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const range = max - min || 1;
  const W = 800, H = 160, PAD = 8;
  const points = r.equityCurve.map((p, i) => {
    const x = PAD + (i / (r.equityCurve.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - ((p.cumulative - min) / range) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const zeroY = H - PAD - ((0 - min) / range) * (H - 2 * PAD);
  const finalCum = r.equityCurve[r.equityCurve.length - 1].cumulative;
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>📈 Equity Curve · Cumulative PnL</SectionHead>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
        <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="var(--eb-border)" strokeDasharray="3 3" />
        <polyline points={points} fill="none" stroke={finalCum >= 0 ? "var(--eb-bull)" : "var(--eb-bear)"} strokeWidth={1.8} />
      </svg>
      <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 4 }}>
        Final: <span style={{ color: finalCum >= 0 ? C.green : C.red, fontWeight: 700 }}>{formatNum(finalCum)}</span> across {r.equityCurve.length} sessions
      </div>
    </section>
  );
}

function TradesTable({ trades, totalCount }: { trades: BacktestTrade[]; totalCount: number }) {
  const [limit, setLimit] = useState(200);
  const view = trades.slice(0, limit);
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <SectionHead>📜 Signal Validation ({trades.length} of {totalCount})</SectionHead>
        {trades.length > limit ? (
          <button style={btnGhost} onClick={() => setLimit((l) => l + 500)}>Show more</button>
        ) : null}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {["Date","Time","Signal","Conf","Entry","Exit","High","Low","Target","Stop","Result","PnL","Moon Sign","Nakshatra","Nearest","Day"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((t, idx) => (
              <tr key={`${t.date}-${idx}`} style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                <td style={td}>{t.date}</td>
                <td style={td}>{t.time}</td>
                <td style={{ ...td, color: t.signal === "BUY" ? C.green : t.signal === "SELL" ? C.red : C.orange, fontWeight: 700 }}>{t.signal}</td>
                <td style={td}>{t.confidence}</td>
                <td style={td}>{t.entry}</td>
                <td style={td}>{t.exit}</td>
                <td style={td}>{t.high}</td>
                <td style={td}>{t.low}</td>
                <td style={td}>{t.target ?? "—"}</td>
                <td style={td}>{t.stop ?? "—"}</td>
                <td style={{ ...td, color: t.result === "WIN" ? C.green : t.result === "LOSS" ? C.red : C.muted, fontWeight: 700 }}>{t.result}</td>
                <td style={{ ...td, color: t.pnl >= 0 ? C.green : C.red }}>{formatNum(t.pnl)}</td>
                <td style={td}>{t.moonSign}</td>
                <td style={td}>{t.moonNakshatra}</td>
                <td style={td}>{t.nearest ?? "—"}</td>
                <td style={td}>{t.dayOfWeek}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Integrity + Methodology ---------------- */

function IntegrityPanel({ r }: { r: BacktestResult }) {
  const dq = r.dataQuality;
  const s = r.stats;
  const b = r.benchmark;
  const em = r.executionMeta;
  const items: [string, string, string?][] = [
    ["Run ID", r.runId],
    ["Engine", r.engineVersion],
    ["Formula", r.formulaVersion],
    ["Config Hash", r.configHash],
    ["Policy", em.policy],
    ["Invalid Setup", em.invalidSetupPolicy],
    ["Timezone", em.timezone],
    ["Anchor / Entry", `${em.astroAnchor} → ${em.entryTime}`],
    ["Coverage", `${dq.coveragePct}% (${dq.loadedSessions}/${dq.expectedSessions})`,
      dq.coveragePct >= 90 ? "bull" : dq.coveragePct >= 60 ? "" : "bear"],
    ["Missing / Invalid", `${dq.missingSessions} · ${dq.invalidSessions}`],
    ["Ambiguous Trades", `${r.ambiguousCount} (${r.summary.taken > 0 ? Math.round((r.ambiguousCount / r.summary.taken) * 1000) / 10 : 0}%)`],
    ["Invalid Setups", String(r.invalidSetupCount)],
    ["Sample Size", `${s.sampleSize} · ${s.sampleWarning}`,
      s.sampleWarning === "MEANINGFUL" ? "bull" : s.sampleWarning === "LIMITED" ? "" : "bear"],
    ["Expectancy", formatNum(s.expectancy), s.expectancy >= 0 ? "bull" : "bear"],
    ["Sharpe-like", String(s.sharpeLike)],
    ["Sortino-like", String(s.sortinoLike)],
    ["Payoff Ratio", String(s.payoffRatio)],
    ["Recovery Factor", String(s.recoveryFactor)],
    ["Exposure %", `${s.exposurePct}%`],
    ["Median Trade", formatNum(s.median)],
    ["Std Dev", String(s.stddev)],
  ];
  if (b) {
    items.push(
      ["Buy & Hold PnL", `${formatNum(b.buyAndHoldPnl)} (${b.buyAndHoldPct}%)`, b.buyAndHoldPnl >= 0 ? "bull" : "bear"],
      ["Strategy Return", `${b.strategyPct}%`, b.strategyPct >= 0 ? "bull" : "bear"],
      ["Excess vs B&H", `${b.excessPct}%`, b.excessPct >= 0 ? "bull" : "bear"],
      ["Active Days", String(b.activeDays)],
    );
  }
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>🔎 Integrity · Reproducibility · Statistics</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
        {items.map(([label, value, tone]) => (
          <div key={label} style={{ background: "var(--eb-bg)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px" }}>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 10, letterSpacing: 0.6, color: C.muted, textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontFamily: "var(--eb-mono)", fontSize: 12, fontWeight: 700, marginTop: 3, color: tone === "bull" ? C.green : tone === "bear" ? C.red : C.text, wordBreak: "break-all" }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      {s.sampleWarning !== "MEANINGFUL" ? (
        <div style={{ marginTop: 8, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.orange }}>
          ⚠️ {s.sampleSize} decided trades — {s.sampleWarning === "INSUFFICIENT" ? "INSUFFICIENT SAMPLE" : "LIMITED SAMPLE"}. Treat statistics as directional, not conclusive.
        </div>
      ) : null}
    </section>
  );
}

function MethodologyDrawer({ r }: { r: BacktestResult }) {
  const [open, setOpen] = useState(false);
  const em = r.executionMeta;
  const costs = em.costs;
  const zeroCosts = costs.slippagePct === 0 && costs.brokerageFlat === 0 && costs.brokeragePct === 0 && costs.taxesPct === 0;
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent", color: C.orange, border: "none",
          fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 1.5, cursor: "pointer",
          padding: 0, textAlign: "left", width: "100%",
        }}
        aria-expanded={open}
      >
        {open ? "▼" : "▶"} 📘 METHODOLOGY, ASSUMPTIONS & LIMITATIONS
      </button>
      {open ? (
        <div style={{ marginTop: 10, fontFamily: "var(--eb-mono)", fontSize: 12, color: C.text, lineHeight: 1.6 }}>
          <MethodRow k="Data source" v={em.dataSource} />
          <MethodRow k="Candle timeframe" v={em.candleTimeframe} />
          <MethodRow k="Astro anchor time" v={em.astroAnchor} />
          <MethodRow k="Entry assumption" v={`Session open at ${em.entryTime}`} />
          <MethodRow k="Exit assumption" v={em.exitAssumption} />
          <MethodRow k="Both-touched policy" v={em.policy} />
          <MethodRow k="Invalid setup policy" v={em.invalidSetupPolicy === "fabricate" ? "fabricate ±0.5% band when no level exists" : "strict — mark INVALID_SETUP"} />
          <MethodRow k="Slippage" v={zeroCosts ? "none" : `${costs.slippagePct}%`} />
          <MethodRow k="Brokerage" v={zeroCosts ? "none" : `${costs.brokerageFlat} flat + ${costs.brokeragePct}%`} />
          <MethodRow k="Taxes" v={zeroCosts ? "none" : `${costs.taxesPct}%`} />
          <MethodRow k="Timezone" v={em.timezone} />
          <MethodRow k="Data source adjusted" v={r.dataQuality.adjusted} />
          <div style={{ marginTop: 10, padding: 10, background: "var(--eb-bg)", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted }}>
            <div style={{ color: C.orange, fontWeight: 700, marginBottom: 6 }}>Known limitations</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {r.disclaimers.map((d) => <li key={d} style={{ marginBottom: 4 }}>{d}</li>)}
              <li>Daily OHLC cannot determine whether target or stop was touched first; the both-touched policy above controls the outcome deterministically.</li>
              <li>Weekend / holiday gaps in the underlying data feed are counted in coverage % — a missing session is not silently treated as a zero-return day.</li>
              <li>Options-based simulations do not infer premium from index points; the strategy PnL is index-point PnL, not option-premium PnL.</li>
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MethodRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", borderBottom: `1px dashed rgba(255,255,255,0.05)` }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ color: C.text }}>{v}</span>
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <div style={fieldLbl}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 1.5, color: C.orange, marginBottom: 10 }}>
      {children}
    </div>
  );
}

/* ------------------------ helpers ------------------------ */

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort();
}
function mapTypedError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "Backtest failed");
  const codes = [
    "DATA_RANGE_UNAVAILABLE",
    "PROVIDER_UNAVAILABLE",
    "UNSUPPORTED_TIMEFRAME",
    "UNSUPPORTED_INSTRUMENT",
    "INSUFFICIENT_INTRADAY_HISTORY",
    "STRATEGY_ADAPTER_NOT_AVAILABLE",
    "DATA_QUALITY_FAILURE",
  ];
  const hit = codes.find((c) => raw.includes(c));
  return hit ? `${hit} · ${raw}` : raw;
}
function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ------------------------ styles ------------------------ */

const panel: React.CSSProperties = {
  background: "var(--eb-card)",
  border: "1px solid var(--eb-border)",
  borderRadius: 8,
  padding: 14,
};
const fieldLbl: React.CSSProperties = {
  fontFamily: "var(--eb-mono)", fontSize: 10, letterSpacing: 0.6, color: "var(--eb-muted)",
  textTransform: "uppercase", marginBottom: 4,
};
const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--eb-bg)", color: "var(--eb-text)",
  border: "1px solid var(--eb-border)", borderRadius: 6,
  padding: "6px 8px", fontFamily: "var(--eb-mono)", fontSize: 12,
};
const chip: React.CSSProperties = {
  border: "1px solid var(--eb-border)", borderRadius: 16,
  padding: "4px 10px", fontFamily: "var(--eb-mono)", fontSize: 11,
  cursor: "pointer", color: "var(--eb-text)",
};
const btnPrimary: React.CSSProperties = {
  background: "var(--eb-accent)", color: "#04140b",
  border: "none", borderRadius: 6, padding: "8px 16px",
  fontFamily: "var(--eb-mono)", fontSize: 12, fontWeight: 700, letterSpacing: 1,
};
const btnGhost: React.CSSProperties = {
  background: "transparent", color: "var(--eb-text)",
  border: "1px solid var(--eb-border)", borderRadius: 6,
  padding: "5px 10px", fontFamily: "var(--eb-mono)", fontSize: 11, cursor: "pointer",
};
const tableStyle: React.CSSProperties = {
  borderCollapse: "collapse", width: "100%", fontFamily: "var(--eb-mono)", fontSize: 11,
};
const th: React.CSSProperties = {
  padding: "6px 8px", textAlign: "left", color: "var(--eb-accent)",
  fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase",
  borderBottom: "1px solid var(--eb-border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "5px 8px", color: "var(--eb-text)", whiteSpace: "nowrap",
};