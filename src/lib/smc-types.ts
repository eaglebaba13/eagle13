// Phase 21.1 — shared, pure types for the Smart Money engines.
//
// Kept in a dedicated file so every engine (market-structure, liquidity,
// order-block, fvg) can share the same Candle contract without any of them
// importing from another. The Smart Money layer is strictly ADDITIVE and
// never touches the frozen EagleBaba Engine v1.0.

export type Candle = {
  /** Unix ms timestamp of the candle open. Monotonically increasing. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Volume; may be 0 if the feed doesn't provide it. */
  v: number;
};

export type Direction = "bull" | "bear";

/** A confirmed swing pivot detected N candles after it formed (no lookahead). */
export type Swing = {
  index: number;
  t: number;
  price: number;
  kind: "high" | "low";
};

/**
 * Detect fractal swing pivots with a symmetric window of `lookback` candles on
 * each side. A pivot at index `i` is only emitted once index `i + lookback`
 * exists in the series — this is the fundamental no-lookahead guarantee shared
 * by every Smart Money engine.
 */
export function detectSwings(candles: Candle[], lookback = 2): Swing[] {
  if (lookback < 1) throw new Error("lookback must be >= 1");
  const out: Swing[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= lookback; k++) {
      const l = candles[i - k];
      const r = candles[i + k];
      if (l.h >= c.h || r.h >= c.h) isHigh = false;
      if (l.l <= c.l || r.l <= c.l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ index: i, t: c.t, price: c.h, kind: "high" });
    if (isLow) out.push({ index: i, t: c.t, price: c.l, kind: "low" });
  }
  return out;
}

/** Validate a series is well-formed: monotonic time, OHLC ordering. */
export function validateCandles(candles: Candle[]): void {
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!Number.isFinite(c.o + c.h + c.l + c.c + c.v + c.t))
      throw new Error(`Non-finite value at index ${i}`);
    if (c.h < Math.max(c.o, c.c) || c.l > Math.min(c.o, c.c))
      throw new Error(`Invalid OHLC ordering at index ${i}`);
    if (i > 0 && candles[i - 1].t >= c.t)
      throw new Error(`Non-monotonic timestamp at index ${i}`);
  }
}