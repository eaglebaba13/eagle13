// Phase 21.1 — Order Block Engine.
//
// Pure detector for institutional order blocks. An OB is the last opposite-
// coloured candle immediately BEFORE an impulsive move that breaks a prior
// confirmed swing. State is tracked forward candle-by-candle:
//
//   • active      — untouched, still valid
//   • mitigated   — price has returned into the OB range at least once
//   • breaker     — OB range was broken through in the opposite direction
//                   AFTER formation; the block flips role
//   • invalidated — decisively closed through against the OB direction
//
// Depends only on `smc-types` and `market-structure` (both pure).

import type { Candle } from "./smc-types";
import { analyzeStructure } from "./market-structure";

export type OrderBlockDirection = "bullish" | "bearish";

export type OrderBlockStatus =
  | "active"
  | "mitigated"
  | "breaker"
  | "invalidated";

export type OrderBlock = {
  direction: OrderBlockDirection;
  /** Candle index of the OB itself (the last opposite-colour candle). */
  index: number;
  t: number;
  top: number;
  bottom: number;
  /** Index of the BOS/CHoCH candle that qualified this OB. */
  impulseIndex: number;
  status: OrderBlockStatus;
  /** Number of times price returned into the range after formation. */
  retests: number;
  /** Age in candles at the end of the analysed series. */
  age: number;
  /** 0..1 heuristic — impulse size normalised by recent range. */
  strength: number;
};

export type OrderBlockOptions = {
  lookback?: number;
  /** Candles to search backwards for the opposite-colour anchor. */
  anchorWindow?: number;
};

function isBull(c: Candle): boolean {
  return c.c > c.o;
}
function isBear(c: Candle): boolean {
  return c.c < c.o;
}

export function detectOrderBlocks(
  candles: Candle[],
  opts: OrderBlockOptions = {},
): OrderBlock[] {
  const lookback = opts.lookback ?? 2;
  const anchorWindow = opts.anchorWindow ?? 20;
  const { events } = analyzeStructure(candles, lookback);

  const blocks: OrderBlock[] = [];

  for (const ev of events) {
    const isBull_ = ev.direction === "bull";
    let anchor = -1;
    for (
      let k = ev.index - 1;
      k >= Math.max(0, ev.index - anchorWindow);
      k--
    ) {
      const cc = candles[k];
      if (isBull_ ? isBear(cc) : isBull(cc)) {
        anchor = k;
        break;
      }
    }
    if (anchor < 0) continue;
    const a = candles[anchor];

    // Impulse size vs local average range → normalised strength.
    const win = candles.slice(Math.max(0, ev.index - 10), ev.index);
    const avgRange = win.length
      ? win.reduce((s, x) => s + (x.h - x.l), 0) / win.length
      : ev.price - a.c;
    const impulseSize = Math.abs(candles[ev.index].c - a.c);
    const strength = Math.max(0, Math.min(1, impulseSize / (avgRange * 3)));

    blocks.push({
      direction: isBull_ ? "bullish" : "bearish",
      index: anchor,
      t: a.t,
      top: a.h,
      bottom: a.l,
      impulseIndex: ev.index,
      status: "active",
      retests: 0,
      age: candles.length - 1 - anchor,
      strength,
    });
  }

  // Forward walk: update status/retests without any lookahead relative to the
  // block's own impulseIndex.
  for (const b of blocks) {
    for (let i = b.impulseIndex + 1; i < candles.length; i++) {
      const c = candles[i];
      const inside = c.h >= b.bottom && c.l <= b.top;
      if (inside && b.status === "active") {
        b.status = "mitigated";
        b.retests++;
        continue;
      }
      if (inside && (b.status === "mitigated" || b.status === "breaker")) {
        b.retests++;
      }
      // Breaker: opposite-direction close through the block AFTER mitigation.
      if (b.direction === "bullish" && c.c < b.bottom) {
        b.status = b.status === "mitigated" ? "breaker" : "invalidated";
        if (b.status === "invalidated") break;
      } else if (b.direction === "bearish" && c.c > b.top) {
        b.status = b.status === "mitigated" ? "breaker" : "invalidated";
        if (b.status === "invalidated") break;
      }
    }
  }

  return blocks;
}