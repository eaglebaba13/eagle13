import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { liquidityHeatmapQuery } from "@/lib/market-data/liquidity-heatmap.functions";
import { type HeatmapAsset, type HeatmapPalette } from "@/lib/market-data/liquidity-heatmap";
import { LiquidityHeatmapCanvas } from "@/components/chart/LiquidityHeatmapCanvas";

export const Route = createFileRoute("/_authenticated/liquidity-heatmap")({ component: LiquidityDesk });
const assets: { key: HeatmapAsset; label: string }[] = [
  { key: "NIFTY50", label: "NIFTY 50" }, { key: "BANKNIFTY", label: "BANK NIFTY" },
  { key: "BTCUSDT", label: "BTCUSDT" }, { key: "ETHUSDT", label: "ETHUSDT" }, { key: "SOLUSDT", label: "SOLUSDT" },
];
function LiquidityDesk() {
  const [asset, setAsset] = useState<HeatmapAsset>("NIFTY50");
  const [minutes, setMinutes] = useState(60);
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState(0.25);
  const [palette, setPalette] = useState<HeatmapPalette>("institutional");
  const [chartState, setChartState] = useState<{ chart: IChartApi; series: ISeriesApi<"Candlestick"> } | null>(null);
  const [viewportTick, setViewportTick] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const { data, isPending, refetch } = useQuery(liquidityHeatmapQuery(asset));
  const snapshots = useMemo(() => {
    const rows = data?.snapshots ?? []; const latest = rows.at(-1)?.timestamp ?? 0;
    return rows.filter((row) => latest - row.timestamp <= minutes * 60_000);
  }, [data, minutes]);
  const latest = snapshots.at(-1);
  const ladder = useMemo(() => [...(latest?.levels ?? [])].sort((a, b) => b.intensity - a.intensity).slice(0, 24).sort((a, b) => b.price - a.price), [latest]);
  const max = Math.max(1, ...ladder.map((row) => row.intensity));
  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, { width: host.current.clientWidth, height: host.current.clientHeight, layout: { background: { color: "#090d17" }, textColor: "#9ca3af" }, grid: { vertLines: { color: "#18202d" }, horzLines: { color: "#18202d" } }, timeScale: { timeVisible: true }, rightPriceScale: { borderColor: "#283445" } });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#10b981", downColor: "#ef4444", borderVisible: false, wickUpColor: "#10b981", wickDownColor: "#ef4444" });
    setChartState({ chart, series });
    const resize = new ResizeObserver(() => { chart.applyOptions({ width: host.current?.clientWidth ?? 0, height: host.current?.clientHeight ?? 0 }); setViewportTick((v) => v + 1); });
    resize.observe(host.current); chart.timeScale().subscribeVisibleTimeRangeChange(() => setViewportTick((v) => v + 1));
    return () => { resize.disconnect(); chart.remove(); setChartState(null); };
  }, []);
  useEffect(() => {
    if (!chartState) return;
    const points = snapshots.filter((s) => s.spot != null).map((s) => ({ time: Math.floor(s.timestamp / 1000) as UTCTimestamp, open: s.spot!, high: s.spot!, low: s.spot!, close: s.spot! }));
    chartState.series.setData([...new Map(points.map((p) => [p.time, p])).values()].sort((a, b) => a.time - b.time));
    chartState.chart.timeScale().fitContent();
  }, [chartState, snapshots]);
  const emptyBook = !latest?.levels?.length;
  return <main className="min-h-screen min-w-0 overflow-x-hidden bg-[#080c14] text-zinc-200 font-mono p-3 pb-28 md:p-5">
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3 mb-3">
      <div className="min-w-0"><div className="text-[10px] tracking-[0.2em] text-amber-400">EAGLEBABA / RESEARCH DESK</div><h1 className="text-lg font-semibold">Liquidity & Orderflow Desk</h1><p className="text-[10px] text-zinc-500">Orderbook notional and near-expiry options OI · research only</p></div>
      <div className="flex items-center gap-2 text-xs"><Link to="/live-chart" className="text-amber-400 hover:underline">Live Chart ↗</Link><button type="button" onClick={() => void refetch()} className="border border-zinc-700 rounded px-2 py-1">Refresh</button></div>
    </header>
    <section className="flex min-w-0 flex-wrap items-center gap-3 border border-zinc-800 bg-[#0d1420] p-3 mb-3 text-xs" aria-label="Heatmap controls">
      <select aria-label="Asset" value={asset} onChange={(e) => setAsset(e.target.value as HeatmapAsset)} className="bg-[#111b2a] border border-zinc-700 rounded px-2 py-1">{assets.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select>
      <select aria-label="Timeframe" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="bg-[#111b2a] border border-zinc-700 rounded px-2 py-1"><option value={15}>15m</option><option value={60}>1h</option><option value={180}>3h</option><option value={1440}>1D</option></select>
      <button type="button" aria-pressed={enabled} onClick={() => setEnabled(!enabled)} className="border border-amber-500/50 text-amber-300 rounded px-2 py-1">🔥 Heatmap {enabled ? "ON" : "OFF"}</button>
      <label>Intensity {Math.round(threshold * 100)}% <input aria-label="Intensity threshold" type="range" min={0} max={0.9} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></label>
      <select aria-label="Color palette" value={palette} onChange={(e) => setPalette(e.target.value as HeatmapPalette)} className="bg-[#111b2a] border border-zinc-700 rounded px-2 py-1"><option value="institutional">Institutional</option><option value="contrast">Contrast</option></select>
      <span className={`min-w-0 basis-full break-words sm:basis-auto ${data?.stale || emptyBook ? "text-amber-400" : "text-emerald-400"}`}>{isPending ? "LOADING" : data?.stale ? "MARKET DATA / LAST VERIFIED · Market closed or unavailable" : emptyBook ? "MARKET DATA / LAST VERIFIED · Empty orderbook" : "LIVE SOURCE"}</span>
    </section>
    <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-3">
      <div className="relative min-w-0 h-[65vh] min-h-[420px] border border-zinc-800 bg-[#090d17]"><div ref={host} className="absolute inset-0" />{enabled && !data?.stale && !emptyBook && chartState && <LiquidityHeatmapCanvas snapshots={snapshots} chart={chartState.chart} series={chartState.series} threshold={threshold} palette={palette} viewportTick={viewportTick} />}{enabled && !isPending && (data?.stale || emptyBook) && <div role="status" className="absolute inset-x-3 top-1/3 rounded border border-amber-500/30 bg-[#111b2a]/95 p-4 text-center shadow-lg"><div className="text-xs font-bold text-amber-300">{data?.stale ? "Market closed / last verified data" : "Empty orderbook"}</div><p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{data?.stale ? "Live liquidity heatmap is paused until verified market data resumes." : "No verified depth or open-interest levels are available for this asset and timeframe."}</p></div>}</div>
      <aside className="border border-zinc-800 bg-[#0d1420] p-3"><div className="flex justify-between text-xs text-amber-400 mb-3"><span>DEPTH / OI LADDER</span><span>{latest?.source === "UPSTOX_OI" ? "CONTRACTS" : "USDT"}</span></div><div className="flex justify-between text-[10px] text-zinc-500 mb-2"><span>Spot {latest?.spot?.toLocaleString("en-IN") ?? "—"}</span><span>Max Pain {latest?.maxPain?.toLocaleString("en-IN") ?? "—"}</span></div><div className="space-y-1 overflow-auto max-h-[55vh]">{ladder.map((row) => <div key={row.price} className="relative flex justify-between text-[10px] tabular-nums border-b border-zinc-800 py-1"><div className="absolute inset-y-0 left-0 bg-amber-500/15" style={{ width: `${row.intensity / max * 100}%` }} /><span className="relative">{row.price.toLocaleString("en-IN")}</span><span className="relative">{row.intensity.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></div>)}</div><p className="text-[10px] text-zinc-500 mt-3">{latest ? new Date(latest.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Awaiting provider data"}</p></aside>
    </section>
  </main>;
}
