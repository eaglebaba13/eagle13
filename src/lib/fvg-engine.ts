// Phase 21.1 — Fair Value Gap Engine.
//
// A Fair Value Gap (FVG) is a 3-candle imbalance:
//
//   Bullish FVG : candles[i-1].high < candles[i+1].low
//                 → gap = (candles[i-1].high, candles[i+1].low)
//   Bearish FVG : candles[i-1].low  > candles[i+1].high
//                 → gap = (candles[i+1].high, candles[i-1].low)
//
// Fill state is tracked by walking candles AFTER the middle candle (i+1) and
// measuring encroachment. No lookahead: an FVG at pivot i is only emitted
// once candle i+1 exists, and its fill % only reflects candles >= i+2.

import type { Candle } from "./smc-types";

export type FvgDirection = "bullish" | "bearish";

export type FvgStatus =
  | "unfilled"
  | "partial"
  | "filled"
  | "mitigated";

export type FairValueGap = {
  direction: FvgDirection;
  /** Middle candle index of the 3-candle pattern. */
  index: number;
  t: number;
  /** Upper edge of the gap. */
  top: number;
  /** Lower edge of the gap. */
  bottom: number;
  size: number;
  status: FvgStatus;
  /** 0..1 how much of the gap has been retraced. */
  fillPct: number;
  /** Candle index at which the gap first became fully filled, if ever. */
  filledIndex: number | null;
};

export type FvgOptions = {
  /** Minimum gap size (in absolute price units). Default 0. */
  minSize?: number;
  /** Threshold for the "mitigated" status once fillPct exceeds it (< 1). */
  mitigationPct?: number;
};

export function detectFvgs(
  candles: Candle[],
  opts: FvgOptions = {},
): FairValueGap[] {
  const minSize = opts.minSize ?? 0;
  const mitPct = opts.mitigationPct ?? 0.5;
  const gaps: FairValueGap[] = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const next = candles[i + 1];
    if (prev.h < next.l) {
      const size = next.l - prev.h;
      if (size > minSize) {
        gaps.push({
          direction: "bullish",
          index: i,
          t: candles[i].t,
          top: next.l,
          bottom: prev.h,
          size,
          status: "unfilled",
          fillPct: 0,
          filledIndex: null,
        });
      }
    } else if (prev.l > next.h) {
      const size = prev.l - next.h;
      if (size > minSize) {
        gaps.push({
          direction: "bearish",
          index: i,
          t: candles[i].t,
          top: prev.l,
          bottom: next.h,
          size,
          status: "unfilled",
          fillPct: 0,
          filledIndex: null,
        });
      }
    }
  }

  for (const g of gaps) {
    for (let j = g.index + 2; j < candles.length; j++) {
      const c = candles[j];
      // How far has price retraced into the gap from the "far" edge?
      let retraced = 0;
      if (g.direction === "bullish") {
        // Gap gets filled from ABOVE (price coming down into it).
        const penetration = g.top - Math.max(g.bottom, Math.min(g.top, c.l));
        retraced = Math.max(retraced, penetration);
      } else {
        const penetration = Math.min(g.top, Math.max(g.bottom, c.h)) - g.bottom;
        retraced = Math.max(retraced, penetration);
      }
      const pct = Math.max(g.fillPct, Math.min(1, retraced / g.size));
      g.fillPct = pct;
      if (pct >= 1 && g.filledIndex === null) {
        g.filledIndex = j;
        g.status = "filled";
        break;
      } else if (pct >= mitPct) {
        g.status = "mitigated";
      } else if (pct > 0) {
        g.status = "partial";
      }
    }
  }

  return gaps;
}