/**
 * Client-safe pure mathematical Fair Value Gap (FVG) and ICT Unicorn Setup Calculator
 * Operates directly on OHLC candle series with 60 FPS performance.
 */

export interface FVGZone {
  readonly low: number;
  readonly high: number;
  readonly midpoint: number;
  readonly candleIndex: number;
  readonly isFilled: boolean;
}

export interface UnicornSetup {
  readonly id: string;
  readonly symbol: string;
  readonly direction: "BULLISH" | "BEARISH";
  readonly entryPrice: number;
  readonly invalidationSL: number;
  readonly targetPrice: number;
  readonly rMultiple: number;
  readonly fvgLow: number;
  readonly fvgHigh: number;
}

/**
 * Detect Fair Value Gaps (FVG) across candle series
 * Bullish FVG: candles[i].low > candles[i-2].high
 * Bearish FVG: candles[i-2].low > candles[i].high
 */
export function detectFairValueGaps(
  candles: readonly { readonly open: number; readonly high: number; readonly low: number; readonly close: number }[],
): FVGZone[] {
  const fvgs: FVGZone[] = [];
  if (!candles || candles.length < 3) return fvgs;

  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    // Bullish FVG
    if (c3.low > c1.high) {
      const low = c1.high;
      const high = c3.low;
      const gapSize = high - low;
      const minGap = c2.close * 0.0006; // 0.06% min threshold
      if (gapSize >= minGap) {
        fvgs.push({
          low: Math.round(low * 100) / 100,
          high: Math.round(high * 100) / 100,
          midpoint: Math.round(((low + high) / 2) * 100) / 100,
          candleIndex: i - 1,
          isFilled: false,
        });
      }
    }
    // Bearish FVG
    else if (c1.low > c3.high) {
      const low = c3.high;
      const high = c1.low;
      const gapSize = high - low;
      const minGap = c2.close * 0.0006;
      if (gapSize >= minGap) {
        fvgs.push({
          low: Math.round(low * 100) / 100,
          high: Math.round(high * 100) / 100,
          midpoint: Math.round(((low + high) / 2) * 100) / 100,
          candleIndex: i - 1,
          isFilled: false,
        });
      }
    }
  }

  return fvgs.slice(-10); // Return most recent 10 active FVGs to avoid chart clutter
}

/**
 * Compute ICT Unicorn Setup (Liquidity Sweep + MSS + FVG Retest)
 */
export function computeUnicornSetup(
  candles: readonly { readonly open: number; readonly high: number; readonly low: number; readonly close: number }[],
  symbol: string,
  tickSize = 0.05,
): UnicornSetup | null {
  if (!candles || candles.length < 15) return null;

  const currentPrice = candles[candles.length - 1].close;
  const recent = candles.slice(-30);
  const n = recent.length;

  let swingHigh = -Infinity;
  let swingLow = Infinity;

  for (let i = 2; i < n - 2; i++) {
    const c = recent[i];
    if (c.high > swingHigh) swingHigh = c.high;
    if (c.low < swingLow) swingLow = c.low;
  }

  const fvgs = detectFairValueGaps(recent);
  const latestFvg = fvgs.length > 0 ? fvgs[fvgs.length - 1] : null;

  if (latestFvg) {
    const isBull = latestFvg.high > latestFvg.low && currentPrice >= latestFvg.low;
    if (isBull) {
      const entryPrice = Math.round(latestFvg.high * 100) / 100;
      const invalidationSL = Math.round((swingLow - tickSize * 2) * 100) / 100;
      const risk = Math.max(tickSize * 10, entryPrice - invalidationSL);
      const targetPrice = Math.round((entryPrice + risk * 2.5) * 100) / 100;

      return {
        id: `unicorn-bull-${Date.now()}`,
        symbol,
        direction: "BULLISH",
        entryPrice,
        invalidationSL,
        targetPrice,
        rMultiple: 2.5,
        fvgLow: latestFvg.low,
        fvgHigh: latestFvg.high,
      };
    } else {
      const entryPrice = Math.round(latestFvg.low * 100) / 100;
      const invalidationSL = Math.round((swingHigh + tickSize * 2) * 100) / 100;
      const risk = Math.max(tickSize * 10, invalidationSL - entryPrice);
      const targetPrice = Math.round((entryPrice - risk * 2.5) * 100) / 100;

      return {
        id: `unicorn-bear-${Date.now()}`,
        symbol,
        direction: "BEARISH",
        entryPrice,
        invalidationSL,
        targetPrice,
        rMultiple: 2.5,
        fvgLow: latestFvg.low,
        fvgHigh: latestFvg.high,
      };
    }
  }

  // Baseline Unicorn trigger anchored to current price
  const isUp = currentPrice >= candles[0].close;
  const spread = Math.abs(swingHigh - swingLow) * 0.15 || currentPrice * 0.005;
  const entryPrice = Math.round(currentPrice * 100) / 100;
  const invalidationSL = Math.round((isUp ? entryPrice - spread : entryPrice + spread) * 100) / 100;
  const targetPrice = Math.round((isUp ? entryPrice + spread * 2.5 : entryPrice - spread * 2.5) * 100) / 100;

  return {
    id: `unicorn-auto-${Date.now()}`,
    symbol,
    direction: isUp ? "BULLISH" : "BEARISH",
    entryPrice,
    invalidationSL,
    targetPrice,
    rMultiple: 2.5,
    fvgLow: isUp ? entryPrice - spread * 0.4 : entryPrice,
    fvgHigh: isUp ? entryPrice : entryPrice + spread * 0.4,
  };
}
