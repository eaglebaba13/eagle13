import type { ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { calculateVwap } from "../indicators/vwap";
import { stitchCandlePoints } from "../provider-foundation/indstocks/candle-aggregator";

export interface ChartCandleData {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number | null;
}

export const utcSeconds = (time: number): UTCTimestamp =>
  Math.floor(time > 1e11 ? time / 1000 : time) as UTCTimestamp;

export function mergeChartCandles(history: readonly ChartCandleData[], live?: ChartCandleData | null): ChartCandleData[] {
  const convert = (c: ChartCandleData) => ({ x: Number(utcSeconds(c.time)) * 1000,
    y: [c.open, c.high, c.low, c.close] as const, volume: c.volume ?? null });
  return stitchCandlePoints(history.map(convert), live ? [convert(live)] : []).map((c) => ({
    time: utcSeconds(c.x), open: c.y[0], high: c.y[1], low: c.y[2], close: c.y[3], volume: c.volume,
  }));
}

type SeriesPorts = {
  candle: Pick<ISeriesApi<"Candlestick">, "setData" | "update">;
  volume: Pick<ISeriesApi<"Histogram">, "setData" | "update">;
  vwap: Pick<ISeriesApi<"Line">, "setData" | "update">;
};

/** One initial load per selection. Normal ticks never touch the visible range or reload a series. */
export class LiveSeriesSynchronizer {
  private key = "";
  private loaded = new Map<number, ChartCandleData>();
  private vwapValues = new Map<number, number | null>();
  private lastTime = 0;

  get candles(): readonly ChartCandleData[] { return [...this.loaded.values()].sort((a, b) => a.time - b.time); }

  sync(key: string, candles: readonly ChartCandleData[], ports: SeriesPorts): boolean {
    if (!candles.length) return false;
    const initial = key !== this.key || this.loaded.size === 0;
    if (initial) {
      this.loaded.clear();
      this.vwapValues.clear();
      this.lastTime = 0;
      this.key = key;
    }
    candles = mergeChartCandles([...this.loaded.values(), ...candles]);
    const bars = candles.map((c) => ({ time: utcSeconds(c.time), open: c.open, high: c.high, low: c.low, close: c.close }));
    const volumes = candles.map((c) => ({ time: utcSeconds(c.time), value: c.volume ?? 0,
      color: c.close >= c.open ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)" }));
    const vwap = calculateVwap(candles.map((c) => ({ ...c, time: Number(utcSeconds(c.time)) * 1000, volume: c.volume ?? 0 })), {}).points
      .map((p) => ({ time: utcSeconds(p.time), ...(p.values.vwap != null ? { value: p.values.vwap } : {}) }));
    if (initial) {
      ports.candle.setData(bars);
      ports.volume.setData(volumes);
      ports.vwap.setData(vwap);
    }
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const time = Number(utcSeconds(c.time));
      const old = this.loaded.get(time);
      const historical = time < this.lastTime;
      // An absent older bar is never inserted by a live update.
      if (!initial && historical && !old) continue;
      if (!initial && (!old || old.open !== c.open || old.high !== c.high || old.low !== c.low || old.close !== c.close || old.volume !== c.volume)) {
        ports.candle.update(bars[i], historical);
        ports.volume.update(volumes[i], historical);
      }
      const value = "value" in vwap[i] ? vwap[i].value! : null;
      if (!initial && (!this.vwapValues.has(time) || this.vwapValues.get(time) !== value)) ports.vwap.update(vwap[i], historical);
      this.loaded.set(time, c);
      this.vwapValues.set(time, value);
      this.lastTime = Math.max(this.lastTime, time);
    }
    return initial;
  }
}
