import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { heatmapColor, type HeatmapPalette, type LiquiditySnapshot, type LiquidityLevel } from "@/lib/market-data/liquidity-heatmap";

interface Props {
  snapshots: readonly LiquiditySnapshot[];
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  threshold: number;
  palette: HeatmapPalette;
  viewportTick?: number;
}
export function LiquidityHeatmapCanvas({ snapshots, chart, series, threshold, palette, viewportTick }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; level: LiquidityLevel; source: string } | null>(null);
  const max = useMemo(() => Math.max(1, ...snapshots.flatMap((s) => s.levels.map((l) => l.intensity))), [snapshots]);
  const coordinateFor = (timestamp: number): number | null => {
    if (!chart || !series) return null;
    const target = Math.floor(timestamp / 1000);
    const candles = series.data();
    if (!candles.length) return null;
    let low = 0; let high = candles.length - 1;
    while (low < high) { const mid = Math.floor((low + high) / 2); if ((candles[mid].time as number) < target) low = mid + 1; else high = mid; }
    const after = candles[low].time as number;
    const before = candles[Math.max(0, low - 1)].time as number;
    const nearest = Math.abs(after - target) < Math.abs(before - target) ? after : before;
    return chart.timeScale().timeToCoordinate(nearest as UTCTimestamp);
  };
  useEffect(() => {
    const node = canvas.current; const parent = node?.parentElement; if (!node || !parent || !chart || !series) return;
    const onMove = (event: MouseEvent) => {
      const bounds = node.getBoundingClientRect(); const x = event.clientX - bounds.left; const y = event.clientY - bounds.top;
      let best: { level: LiquidityLevel; source: string; distance: number } | null = null;
      for (const snapshot of snapshots) {
        const sx = coordinateFor(snapshot.timestamp);
        if (sx == null || Math.abs(sx - x) > 40) continue;
        for (const level of snapshot.levels) {
          const sy = series.priceToCoordinate(level.price); if (sy == null) continue;
          const distance = Math.abs(sx - x) + Math.abs(sy - y);
          if (distance < 24 && (!best || distance < best.distance)) best = { level, source: snapshot.source, distance };
        }
      }
      setHover(best ? { x, y, level: best.level, source: best.source } : null);
    };
    parent.addEventListener("mousemove", onMove); parent.addEventListener("mouseleave", () => setHover(null));
    return () => parent.removeEventListener("mousemove", onMove);
  }, [snapshots, chart, series]);
  useEffect(() => {
    const node = canvas.current; if (!node || !chart || !series) return;
    const context = node.getContext("2d"); if (!context) return;
    const width = node.clientWidth; const height = node.clientHeight; const dpr = window.devicePixelRatio || 1;
    node.width = Math.max(1, Math.round(width * dpr)); node.height = Math.max(1, Math.round(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
    const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < sorted.length; i++) {
      const snapshot = sorted[i]; const x = coordinateFor(snapshot.timestamp);
      if (x == null) continue;
      const next = sorted[i + 1];
      const nextX = next ? coordinateFor(next.timestamp) : null;
      const barWidth = Math.max(6, Math.min(100, nextX == null ? 36 : nextX - x));
      const prices = snapshot.levels.map((l) => l.price).sort((a, b) => a - b);
      const step = prices.length > 1 ? Math.min(...prices.slice(1).map((p, j) => p - prices[j]).filter((v) => v > 0)) : snapshot.spot ? snapshot.spot * 0.001 : 1;
      for (const level of snapshot.levels) {
        const ratio = level.intensity / max; if (ratio < threshold) continue;
        const y = series.priceToCoordinate(level.price); const y2 = series.priceToCoordinate(level.price + step);
        if (y == null || y2 == null) continue;
        const cellHeight = Math.max(2, Math.min(24, Math.abs(y - y2)));
        context.globalAlpha = 0.15 + 0.5 * ratio; context.fillStyle = heatmapColor(ratio, palette);
        context.fillRect(x - barWidth, y - cellHeight / 2, barWidth, cellHeight);
      }
    }
    context.globalAlpha = 1;
  }, [snapshots, chart, series, threshold, palette, max, viewportTick]);
  return <>
    <canvas ref={canvas} className="absolute inset-0 w-full h-full pointer-events-none" aria-label="Liquidity heatmap overlay" />
    {hover && <div className="absolute z-20 rounded border border-amber-500/40 bg-[#090d17]/95 px-2 py-1 text-[10px] font-mono text-zinc-200 pointer-events-none" style={{ left: Math.min(hover.x + 12, (canvas.current?.clientWidth ?? 300) - 185), top: Math.max(4, hover.y - 55) }}>
      <div>{new Date(hover.level.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
      <div>Price {hover.level.price.toLocaleString("en-IN")}</div>
      <div>{hover.source === "UPSTOX_OI" ? "OI" : "Depth notional"} {hover.level.intensity.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
    </div>}
  </>;
}
