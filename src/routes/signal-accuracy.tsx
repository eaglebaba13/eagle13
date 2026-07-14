import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { runBacktest, BACKTEST_SYMBOLS, type BacktestResult, type BacktestSymbol, type BacktestTrade } from "@/lib/backtest.functions";
import { computeAnalytics, buildInsights, type Analytics, type Bucket } from "@/lib/signal-analytics";
import { downloadBlob } from "@/lib/download";
import { ApexChart } from "@/components/ApexChart";
import { FormulaBadge } from "@/components/FormulaBadge";
import { astroFormulaSlug } from "@/lib/engine-version";

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
  { key: "3M", days: 90 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
  { key: "2Y", days: 730 },
  { key: "5Y", days: 1825 },
] as const;
type PeriodKey = typeof PERIODS[number]["key"] | "CUSTOM";

function isoDaysAgo(days: number): string { return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10); }
function todayIso(): string { return new Date().toISOString().slice(0, 10); }

export const Route = createFileRoute("/signal-accuracy")({
  component: SignalAccuracyPage,
  head: () => ({
    meta: [
      { title: "Signal Accuracy Analytics | EagleBABA Astro Levels" },
      { name: "description", content: "Institutional-grade analytics on the accuracy of EagleBABA astro BUY / SELL / WAIT signals across Nakshatras, Moon Signs, retrograde combinations, weekdays and months." },
      { property: "og:title", content: "Signal Accuracy Analytics | EagleBABA" },
      { property: "og:description", content: "Which astro signals historically produce the highest-probability trades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function SignalAccuracyPage() {
  const [symbol, setSymbol] = useState<BacktestSymbol>("NIFTY50");
  const [period, setPeriod] = useState<PeriodKey>("1Y");
  const [from, setFrom] = useState<string>(isoDaysAgo(365));
  const [to, setTo] = useState<string>(todayIso());

  const [nakFilter, setNakFilter] = useState<string>("ALL");
  const [signFilter, setSignFilter] = useState<string>("ALL");
  const [sigFilter, setSigFilter] = useState<"ALL" | "BUY" | "SELL" | "WAIT">("ALL");
  const [retroFilter, setRetroFilter] = useState<string>("ALL");
  const [dowFilter, setDowFilter] = useState<string>("ALL");
  const [monthFilter, setMonthFilter] = useState<string>("ALL");
  const [yearFilter, setYearFilter] = useState<string>("ALL");

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

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const res = await call({ data: { symbol, from, to } });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally { setLoading(false); }
  };

  // Filter trades ONLY for analytics rebuild — never re-runs the backtest.
  const filteredResult = useMemo<BacktestResult | null>(() => {
    if (!result) return null;
    const rk = (n: number) => (n <= 0 ? "0 Retro" : n === 1 ? "1 Retro" : n === 2 ? "2 Retro" : "3+ Retro");
    const mNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const trades = result.trades.filter((t) =>
      (sigFilter === "ALL" || t.signal === sigFilter) &&
      (nakFilter === "ALL" || t.moonNakshatra === nakFilter) &&
      (signFilter === "ALL" || t.moonSign === signFilter) &&
      (retroFilter === "ALL" || rk(t.retroCount) === retroFilter) &&
      (dowFilter === "ALL" || t.dayOfWeek === dowFilter) &&
      (monthFilter === "ALL" || mNames[parseInt(t.date.slice(5,7),10)-1] === monthFilter) &&
      (yearFilter === "ALL" || t.date.slice(0,4) === yearFilter),
    );
    return { ...result, trades };
  }, [result, sigFilter, nakFilter, signFilter, retroFilter, dowFilter, monthFilter, yearFilter]);

  const analytics = useMemo<Analytics | null>(
    () => (filteredResult ? computeAnalytics(filteredResult) : null),
    [filteredResult],
  );
  const insights = useMemo(() => (analytics ? buildInsights(analytics) : []), [analytics]);

  // Filter option lists (from raw, unfiltered result so users can widen a search).
  const nakOptions = useMemo(() => uniq(result?.trades.map((t) => t.moonNakshatra) ?? []), [result]);
  const signOptions = useMemo(() => uniq(result?.trades.map((t) => t.moonSign) ?? []), [result]);
  const dowOptions = useMemo(() => uniq(result?.trades.map((t) => t.dayOfWeek) ?? []), [result]);
  const yearOptions = useMemo(() => uniq(result?.trades.map((t) => t.date.slice(0, 4)) ?? []), [result]);

  const exportCsv = () => {
    if (!analytics) return;
    const bucketRows = (name: string, rows: Bucket[]) => [
      [`# ${name}`],
      ["key","trades","wins","losses","flats","accuracy","winRate","avgReturn","avgWin","avgLoss","profitFactor","expectancy","netPnl","rank"],
      ...rows.map((b) => [b.key,b.trades,b.wins,b.losses,b.flats,b.accuracy,b.winRate,b.avgReturn,b.avgWin,b.avgLoss,b.profitFactor,b.expectancy,b.netPnl,b.rank]),
      [],
    ];
    const rows = [
      ["# Signal Accuracy Analytics", symbol, from, to],
      [],
      ...bucketRows("Signal Breakdown", analytics.signalBreakdown),
      ...bucketRows("Nakshatra", analytics.nakshatra),
      ...bucketRows("Moon Sign", analytics.moonSign),
      ...bucketRows("Retrograde", analytics.retrograde),
      ...bucketRows("Planet", analytics.planet),
      ...bucketRows("Day of Week", analytics.dayOfWeek),
      ...bucketRows("Month", analytics.month),
      ...bucketRows("Year", analytics.year),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const slug = analytics ? astroFormulaSlug(analytics.astroFormulaVersion) : "GANN_ASTRO_V1_1";
    downloadBlob(csv, `eaglebaba-signal-accuracy-${symbol}-${slug}-${from}-${to}.csv`, "text/csv");
  };
  const exportJson = () => {
    if (!analytics) return;
    const slug = astroFormulaSlug(analytics.astroFormulaVersion);
    downloadBlob(JSON.stringify(analytics, null, 2), `eaglebaba-signal-accuracy-${symbol}-${slug}-${from}-${to}.json`, "application/json");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "18px 16px 96px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "var(--eb-head)", fontSize: 20, letterSpacing: 2, color: C.orange }}>
            🎯 SIGNAL ACCURACY ANALYTICS
          </div>
          <div style={{ fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted, marginTop: 4 }}>
            Institutional analytics on top of the validated Historical Backtest Engine · no calculation duplication
          </div>
          {analytics ? (
            <div style={{ marginTop: 6 }}>
              <FormulaBadge version={analytics.astroFormulaVersion} />
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link to="/backtest" style={{ color: C.blue, fontFamily: "var(--eb-mono)", fontSize: 12 }}>← Backtest</Link>
          <Link to="/" style={{ color: C.blue, fontFamily: "var(--eb-mono)", fontSize: 12 }}>← Dashboard</Link>
        </div>
      </header>

      {/* Controls */}
      <section style={panel}>
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
            <button onClick={run} disabled={loading}
              style={{ ...btnPrimary, opacity: loading ? 0.6 : 1, cursor: loading ? "wait" : "pointer" }}>
              {loading ? "Analyzing…" : "▶ Analyze"}
            </button>
          </div>
        </div>
        {error ? (
          <div style={{ marginTop: 10, color: C.red, fontFamily: "var(--eb-mono)", fontSize: 12 }}>{error}</div>
        ) : null}
      </section>

      {!result && !loading ? (
        <section style={{ ...panel, marginTop: 14, textAlign: "center", color: C.muted, fontFamily: "var(--eb-mono)", fontSize: 13 }}>
          Pick an instrument and period, then run the analytics engine to explore historical signal accuracy.
        </section>
      ) : null}

      {result && analytics ? (
        <>
          <TopSummary a={analytics} />
          <FilterBar
            sigFilter={sigFilter} setSigFilter={setSigFilter}
            nakFilter={nakFilter} setNakFilter={setNakFilter} nakOptions={nakOptions}
            signFilter={signFilter} setSignFilter={setSignFilter} signOptions={signOptions}
            retroFilter={retroFilter} setRetroFilter={setRetroFilter}
            dowFilter={dowFilter} setDowFilter={setDowFilter} dowOptions={dowOptions}
            monthFilter={monthFilter} setMonthFilter={setMonthFilter}
            yearFilter={yearFilter} setYearFilter={setYearFilter} yearOptions={yearOptions}
            onCsv={exportCsv} onJson={exportJson}
          />
          <SignalBreakdown a={analytics} />
          <ConfusionMatrix a={analytics} />
          <NakshatraSection a={analytics} />
          <MoonSignSection a={analytics} />
          <RetroSection a={analytics} />
          <PlanetSection a={analytics} />
          <DowMonthSection a={analytics} />
          <YearSection a={analytics} />
          <EquityDrawdownSection r={result} a={analytics} />
          <BenchmarkSection r={result} />
          <AiInsightsSection insights={insights} />
          <Disclaimer />
        </>
      ) : null}
    </div>
  );
}

/* ------------------------- sections ------------------------- */

function TopSummary({ a }: { a: Analytics }) {
  const s = a.top;
  type Tone = "bull" | "bear" | "";
  const cards: [string, string, Tone][] = [
    ["Total Trades",    String(s.totalTrades)],
    ["Wins",            String(s.wins), "bull"],
    ["Losses",          String(s.losses), "bear"],
    ["Flats",           String(s.flats)],
    ["Accuracy",        pct(s.accuracy), s.accuracy >= 55 ? "bull" : s.accuracy <= 45 ? "bear" : ""],
    ["Win Rate",        pct(s.winRate), s.winRate >= 55 ? "bull" : s.winRate <= 45 ? "bear" : ""],
    ["Loss Rate",       pct(s.lossRate), "bear"],
    ["Profit Factor",   s.profitFactor >= 999 ? "∞" : String(s.profitFactor), s.profitFactor >= 1.5 ? "bull" : s.profitFactor < 1 ? "bear" : ""],
    ["Expectancy",      num(s.expectancy), s.expectancy >= 0 ? "bull" : "bear"],
    ["Net Profit",      num(s.netProfit), s.netProfit >= 0 ? "bull" : "bear"],
    ["Max Drawdown",    num(-s.maxDrawdown), "bear"],
    ["Recovery Factor", String(s.recoveryFactor)],
    ["Sharpe",          String(s.sharpe)],
    ["Avg Trade",       num(s.avgTrade)],
    ["Avg Winner",      num(s.avgWinner), "bull"],
    ["Avg Loser",       num(-s.avgLoser), "bear"],
  ].map((row) => (row.length === 2 ? [row[0], row[1], ""] : row)) as [string, string, Tone][];
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>📊 Overall Performance</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        {cards.map(([label, value, tone]) => (
          <div key={label} style={miniCard}>
            <div style={miniLbl}>{label}</div>
            <div style={{ ...miniVal, color: tone === "bull" ? C.green : tone === "bear" ? C.red : C.text }}>{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SignalBreakdown({ a }: { a: Analytics }) {
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>🎯 Signal Analytics · BUY / SELL / WAIT</SectionHead>
      <BucketTable rows={a.signalBreakdown} keyLabel="Signal" />
    </section>
  );
}

function ConfusionMatrix({ a }: { a: Analytics }) {
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>🧩 Confusion Matrix</SectionHead>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {["Signal","Correct","Failed","Flat","Total","Accuracy"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {a.confusion.map((c) => (
              <tr key={c.signal} style={rowStyle}>
                <td style={{ ...td, color: c.signal === "BUY" ? C.green : c.signal === "SELL" ? C.red : C.orange, fontWeight: 700 }}>{c.signal}</td>
                <td style={{ ...td, color: C.green }}>{c.correct}</td>
                <td style={{ ...td, color: C.red }}>{c.failed}</td>
                <td style={td}>{c.flat}</td>
                <td style={td}>{c.total}</td>
                <td style={{ ...td, color: c.accuracy >= 55 ? C.green : c.accuracy <= 45 ? C.red : C.text, fontWeight: 700 }}>{pct(c.accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NakshatraSection({ a }: { a: Analytics }) {
  const heatmap = a.nakshatra.slice(0, 27).map((b) => ({ x: b.key, y: b.accuracy }));
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>✨ Nakshatra Analysis</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={smallHead}>Top 5 Best</div>
          <BucketTable rows={a.bestNakshatras} keyLabel="Nakshatra" />
        </div>
        <div>
          <div style={smallHead}>Top 5 Worst</div>
          <BucketTable rows={a.worstNakshatras} keyLabel="Nakshatra" />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={smallHead}>All Nakshatras</div>
        <BucketTable rows={a.nakshatra} keyLabel="Nakshatra" />
      </div>
      {heatmap.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div style={smallHead}>Accuracy Heatmap</div>
          <ApexChart
            type="heatmap"
            series={[{ name: "Accuracy", data: heatmap }]}
            options={{
              chart: { toolbar: { show: false } },
              dataLabels: { enabled: false },
              plotOptions: { heatmap: { colorScale: {
                ranges: [
                  { from: 0, to: 40, color: "#7f1d1d", name: "Weak" },
                  { from: 40, to: 55, color: "#a16207", name: "Average" },
                  { from: 55, to: 70, color: "#166534", name: "Strong" },
                  { from: 70, to: 100, color: "#14532d", name: "Elite" },
                ],
              } } },
              xaxis: { labels: { style: { colors: "#94a3b8", fontSize: "9px" }, rotate: -45 } },
              yaxis: { labels: { show: false } },
              grid: { borderColor: "rgba(255,255,255,0.05)" },
              tooltip: { theme: "dark" },
            }}
            height={130}
          />
        </div>
      ) : null}
    </section>
  );
}

function MoonSignSection({ a }: { a: Analytics }) {
  const heatmap = a.moonSign.map((b) => ({ x: b.key, y: b.accuracy }));
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>🌕 Moon Sign Analysis</SectionHead>
      <BucketTable rows={a.moonSign} keyLabel="Moon Sign" />
      {heatmap.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <ApexChart
            type="bar"
            series={[{ name: "Accuracy", data: heatmap.map((h) => h.y) }]}
            options={{
              chart: { toolbar: { show: false } },
              plotOptions: { bar: { borderRadius: 3, columnWidth: "60%", distributed: true } },
              legend: { show: false },
              dataLabels: { enabled: false },
              xaxis: { categories: heatmap.map((h) => h.x), labels: { style: { colors: "#94a3b8", fontSize: "9px" } } },
              yaxis: { labels: { style: { colors: "#94a3b8", fontSize: "9px" } }, max: 100 },
              grid: { borderColor: "rgba(255,255,255,0.05)" },
              tooltip: { theme: "dark" },
            }}
            height={200}
          />
        </div>
      ) : null}
    </section>
  );
}

function RetroSection({ a }: { a: Analytics }) {
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>♻️ Retrograde Analysis</SectionHead>
      <BucketTable rows={a.retrograde} keyLabel="Retrograde" />
    </section>
  );
}

function PlanetSection({ a }: { a: Analytics }) {
  if (a.planet.length === 0) return null;
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>🪐 Planet Influence · nearest planet at entry</SectionHead>
      <BucketTable rows={a.planet} keyLabel="Planet" />
    </section>
  );
}

function DowMonthSection({ a }: { a: Analytics }) {
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>📅 Day of Week · Month</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={smallHead}>Day of Week</div>
          <BucketTable rows={a.dayOfWeek} keyLabel="Day" />
        </div>
        <div>
          <div style={smallHead}>Month</div>
          <BucketTable rows={a.month} keyLabel="Month" />
        </div>
      </div>
    </section>
  );
}

function YearSection({ a }: { a: Analytics }) {
  if (a.year.length === 0) return null;
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>🗓️ Year Analysis</SectionHead>
      <BucketTable rows={a.year} keyLabel="Year" />
    </section>
  );
}

function EquityDrawdownSection({ r, a }: { r: BacktestResult; a: Analytics }) {
  if (r.equityCurve.length < 2) return null;
  const dates = r.equityCurve.map((p) => p.date);
  const equity = r.equityCurve.map((p) => p.cumulative);
  // Underwater / drawdown series.
  let peak = equity[0];
  const ddSeries = equity.map((v) => { if (v > peak) peak = v; return Math.round((v - peak) * 100) / 100; });
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>📈 Equity · Drawdown</SectionHead>
      <ApexChart
        type="area"
        series={[
          { name: "Equity", data: equity },
          { name: "Drawdown", data: ddSeries },
        ]}
        options={{
          chart: { toolbar: { show: false }, stacked: false },
          stroke: { curve: "smooth", width: 2 },
          fill: { type: "gradient", gradient: { opacityFrom: 0.35, opacityTo: 0 } },
          colors: ["#22c55e", "#ef4444"],
          xaxis: { categories: dates, labels: { style: { colors: "#94a3b8", fontSize: "9px" }, rotate: 0, hideOverlappingLabels: true } },
          yaxis: [
            { labels: { style: { colors: "#94a3b8", fontSize: "9px" } } },
            { opposite: true, labels: { style: { colors: "#94a3b8", fontSize: "9px" } } },
          ],
          grid: { borderColor: "rgba(255,255,255,0.05)" },
          legend: { labels: { colors: "#94a3b8" } },
          tooltip: { theme: "dark", shared: true },
        }}
        height={240}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 10 }}>
        <div style={miniCard}><div style={miniLbl}>Max Drawdown</div><div style={{ ...miniVal, color: C.red }}>{num(-a.drawdown.maxDrawdown)}</div></div>
        <div style={miniCard}><div style={miniLbl}>Avg Drawdown</div><div style={miniVal}>{num(-a.drawdown.avgDrawdown)}</div></div>
        <div style={miniCard}><div style={miniLbl}>Recovery Days</div><div style={miniVal}>{a.drawdown.recoveryDays == null ? "—" : String(a.drawdown.recoveryDays)}</div></div>
        <div style={miniCard}><div style={miniLbl}>New Peaks</div><div style={miniVal}>{a.drawdown.peaks}</div></div>
      </div>
    </section>
  );
}

function BenchmarkSection({ r }: { r: BacktestResult }) {
  const b = r.benchmark;
  if (!b) return null;
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>⚖️ Benchmark · Strategy vs Buy &amp; Hold</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <div style={miniCard}><div style={miniLbl}>Buy &amp; Hold</div><div style={{ ...miniVal, color: b.buyAndHoldPct >= 0 ? C.green : C.red }}>{pct(b.buyAndHoldPct)}</div></div>
        <div style={miniCard}><div style={miniLbl}>Strategy</div><div style={{ ...miniVal, color: b.strategyPct >= 0 ? C.green : C.red }}>{pct(b.strategyPct)}</div></div>
        <div style={miniCard}><div style={miniLbl}>Excess</div><div style={{ ...miniVal, color: b.excessPct >= 0 ? C.green : C.red }}>{pct(b.excessPct)}</div></div>
        <div style={miniCard}><div style={miniLbl}>Active Days</div><div style={miniVal}>{b.activeDays}</div></div>
        <div style={miniCard}><div style={miniLbl}>Sharpe</div><div style={miniVal}>{r.stats.sharpeLike}</div></div>
        <div style={miniCard}><div style={miniLbl}>Std Dev</div><div style={miniVal}>{r.stats.stddev}</div></div>
      </div>
    </section>
  );
}

function AiInsightsSection({ insights }: { insights: ReturnType<typeof buildInsights> }) {
  if (insights.length === 0) return null;
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <SectionHead>🧠 AI Insights</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        {insights.map((i) => (
          <div key={i.label} style={{ ...miniCard, borderColor: i.tone === "bull" ? "rgba(34,197,94,0.35)" : i.tone === "bear" ? "rgba(239,68,68,0.35)" : C.border }}>
            <div style={miniLbl}>{i.icon} {i.label}</div>
            <div style={{ ...miniVal, color: i.tone === "bull" ? C.green : i.tone === "bear" ? C.red : C.text, fontSize: 13 }}>{i.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Disclaimer() {
  return (
    <section style={{ ...panel, marginTop: 14, fontFamily: "var(--eb-mono)", fontSize: 11, color: C.muted }}>
      Analytics are computed from historical backtest results generated by the validated Historical Backtest Engine. Past performance does not guarantee future returns. Signal accuracy depends on candle resolution, execution assumptions, data quality, slippage and costs.
    </section>
  );
}

/* ------------------------- shared table + filters ------------------------- */

function BucketTable({ rows, keyLabel }: { rows: Bucket[]; keyLabel: string }) {
  if (rows.length === 0) {
    return <div style={{ color: C.muted, fontFamily: "var(--eb-mono)", fontSize: 12 }}>No data.</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {[keyLabel, "Trades", "Wins", "Losses", "Accuracy", "Win Rate", "Avg Return", "Profit Factor", "Expectancy", "Net PnL", "Rank"].map((h) => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.key} style={rowStyle}>
              <td style={{ ...td, fontWeight: 700 }}>{b.key}</td>
              <td style={td}>{b.trades}</td>
              <td style={{ ...td, color: C.green }}>{b.wins}</td>
              <td style={{ ...td, color: C.red }}>{b.losses}</td>
              <td style={{ ...td, color: b.accuracy >= 55 ? C.green : b.accuracy <= 45 ? C.red : C.text, fontWeight: 700 }}>{pct(b.accuracy)}</td>
              <td style={td}>{pct(b.winRate)}</td>
              <td style={{ ...td, color: b.avgReturn >= 0 ? C.green : C.red }}>{num(b.avgReturn)}</td>
              <td style={td}>{b.profitFactor >= 999 ? "∞" : b.profitFactor}</td>
              <td style={{ ...td, color: b.expectancy >= 0 ? C.green : C.red }}>{num(b.expectancy)}</td>
              <td style={{ ...td, color: b.netPnl >= 0 ? C.green : C.red, fontWeight: 700 }}>{num(b.netPnl)}</td>
              <td style={td}>{b.rank}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterBar(props: {
  sigFilter: "ALL" | "BUY" | "SELL" | "WAIT"; setSigFilter: (v: "ALL" | "BUY" | "SELL" | "WAIT") => void;
  nakFilter: string; setNakFilter: (v: string) => void; nakOptions: string[];
  signFilter: string; setSignFilter: (v: string) => void; signOptions: string[];
  retroFilter: string; setRetroFilter: (v: string) => void;
  dowFilter: string; setDowFilter: (v: string) => void; dowOptions: string[];
  monthFilter: string; setMonthFilter: (v: string) => void;
  yearFilter: string; setYearFilter: (v: string) => void; yearOptions: string[];
  onCsv: () => void; onJson: () => void;
}) {
  return (
    <section style={{ ...panel, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <SectionHead>🎛 Filters (client-only · analytics rebuild)</SectionHead>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={props.onCsv} style={btnGhost}>⬇ CSV</button>
          <button onClick={props.onJson} style={btnGhost}>⬇ JSON</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 }}>
        <LabeledSelect label="Signal" value={props.sigFilter} onChange={(v) => props.setSigFilter(v as "ALL" | "BUY" | "SELL" | "WAIT")} options={["ALL","BUY","SELL","WAIT"]} />
        <LabeledSelect label="Nakshatra" value={props.nakFilter} onChange={props.setNakFilter} options={["ALL", ...props.nakOptions]} />
        <LabeledSelect label="Moon Sign" value={props.signFilter} onChange={props.setSignFilter} options={["ALL", ...props.signOptions]} />
        <LabeledSelect label="Retrograde" value={props.retroFilter} onChange={props.setRetroFilter} options={["ALL","0 Retro","1 Retro","2 Retro","3+ Retro"]} />
        <LabeledSelect label="Day" value={props.dowFilter} onChange={props.setDowFilter} options={["ALL", ...props.dowOptions]} />
        <LabeledSelect label="Month" value={props.monthFilter} onChange={props.setMonthFilter}
          options={["ALL","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]} />
        <LabeledSelect label="Year" value={props.yearFilter} onChange={props.setYearFilter} options={["ALL", ...props.yearOptions]} />
      </div>
    </section>
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
  return <div style={{ fontFamily: "var(--eb-head)", fontSize: 13, letterSpacing: 1.5, color: C.orange, marginBottom: 10 }}>{children}</div>;
}

/* ------------------------- helpers ------------------------- */

function uniq(arr: string[]): string[] { return Array.from(new Set(arr.filter(Boolean))).sort(); }
function pct(n: number): string { return `${n}%`; }
function num(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Underscore-suppress: keep the type import so the tsc `verbatimModuleSyntax`
// checker doesn't complain when only used in prop typing.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _T = BacktestTrade;

/* ------------------------- styles ------------------------- */

const panel: React.CSSProperties = { background: "var(--eb-card)", border: "1px solid var(--eb-border)", borderRadius: 8, padding: 14 };
const fieldLbl: React.CSSProperties = { fontFamily: "var(--eb-mono)", fontSize: 10, letterSpacing: 0.6, color: "var(--eb-muted)", textTransform: "uppercase", marginBottom: 4 };
const selectStyle: React.CSSProperties = { width: "100%", background: "var(--eb-bg)", color: "var(--eb-text)", border: "1px solid var(--eb-border)", borderRadius: 6, padding: "6px 8px", fontFamily: "var(--eb-mono)", fontSize: 12 };
const chip: React.CSSProperties = { border: "1px solid var(--eb-border)", borderRadius: 16, padding: "4px 10px", fontFamily: "var(--eb-mono)", fontSize: 11, cursor: "pointer", color: "var(--eb-text)" };
const btnPrimary: React.CSSProperties = { background: "var(--eb-accent)", color: "#04140b", border: "none", borderRadius: 6, padding: "8px 16px", fontFamily: "var(--eb-mono)", fontSize: 12, fontWeight: 700, letterSpacing: 1 };
const btnGhost: React.CSSProperties = { background: "transparent", color: "var(--eb-text)", border: "1px solid var(--eb-border)", borderRadius: 6, padding: "5px 10px", fontFamily: "var(--eb-mono)", fontSize: 11, cursor: "pointer" };
const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%", fontFamily: "var(--eb-mono)", fontSize: 11 };
const th: React.CSSProperties = { padding: "6px 8px", textAlign: "left", color: "var(--eb-accent)", fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", borderBottom: "1px solid var(--eb-border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "5px 8px", color: "var(--eb-text)", whiteSpace: "nowrap" };
const rowStyle: React.CSSProperties = { borderBottom: `1px solid rgba(255,255,255,0.05)` };
const miniCard: React.CSSProperties = { background: "var(--eb-bg)", border: "1px solid var(--eb-border)", borderRadius: 6, padding: "10px 12px" };
const miniLbl: React.CSSProperties = { fontFamily: "var(--eb-mono)", fontSize: 10, letterSpacing: 0.6, color: "var(--eb-muted)", textTransform: "uppercase" };
const miniVal: React.CSSProperties = { fontFamily: "var(--eb-mono)", fontSize: 16, fontWeight: 700, marginTop: 4, color: "var(--eb-text)" };
const smallHead: React.CSSProperties = { fontFamily: "var(--eb-mono)", fontSize: 11, color: "var(--eb-muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 };