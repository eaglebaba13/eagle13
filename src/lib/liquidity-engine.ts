// Phase 21.1 — Liquidity Engine.
//
// Pure detector for equal highs/lows, buy-side (BSL) and sell-side (SSL)
// liquidity pools, liquidity sweeps / grabs / stop hunts, and inducements.
// Internal vs external liquidity is classified relative to the last
// confirmed external swing range.

import type { Candle, Swing } from "./smc-types";
import { detectSwings } from "./smc-types";

export type LiquidityLevelKind =
  | "equal_high"
  | "equal_low"
  | "buy_side"
  | "sell_side";

export type LiquidityLevel = {
  kind: LiquidityLevelKind;
  price: number;
  /** Indices of the swings that produced this level. */
  sources: number[];
  scope: "internal" | "external";
  taken: boolean;
  /** Index of the candle that first pierced the level (if any). */
  takenIndex: number | null;
};

export type LiquidityEventType =
  | "sweep"
  | "grab"
  | "stop_hunt"
  | "inducement";

export type LiquidityEvent = {
  type: LiquidityEventType;
  side: "buy" | "sell";
  index: number;
  t: number;
  level: number;
  /** True if the candle wicked past the level then closed back inside. */
  reclaim: boolean;
};

export type LiquidityReport = {
  levels: LiquidityLevel[];
  events: LiquidityEvent[];
};

export type LiquidityOptions = {
  lookback?: number;
  /** Max relative distance between two swing prices to be "equal". Default 0.05%. */
  equalTolerance?: number;
  /** Volume multiple vs. rolling average to upgrade a sweep into a grab. */
  grabVolumeMultiple?: number;
};

function near(a: number, b: number, tol: number): boolean {
  const denom = Math.max(1e-9, (Math.abs(a) + Math.abs(b)) / 2);
  return Math.abs(a - b) / denom <= tol;
}

export function analyzeLiquidity(
  candles: Candle[],
  opts: LiquidityOptions = {},
): LiquidityReport {
  const lookback = opts.lookback ?? 2;
  const tol = opts.equalTolerance ?? 0.0005;
  const grabMul = opts.grabVolumeMultiple ?? 1.8;
  const swings = detectSwings(candles, lookback);
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");

  // External range = extremes across all confirmed swings.
  const extHi = highs.reduce((m, s) => (s.price > m ? s.price : m), -Infinity);
  const extLo = lows.reduce((m, s) => (s.price < m ? s.price : m), Infinity);

  const levels: LiquidityLevel[] = [];

  // Equal highs / lows: cluster nearby swings.
  const clusterEqual = (arr: Swing[], kind: "equal_high" | "equal_low") => {
    const used = new Set<number>();
    for (let i = 0; i < arr.length; i++) {
      if (used.has(i)) continue;
      const group = [arr[i]];
      for (let j = i + 1; j < arr.length; j++) {
        if (used.has(j)) continue;
        if (near(arr[j].price, arr[i].price, tol)) {
          group.push(arr[j]);
          used.add(j);
        }
      }
      if (group.length >= 2) {
        used.add(i);
        const price =
          group.reduce((a, s) => a + s.price, 0) / group.length;
        const isExternal =
          kind === "equal_high" ? price >= extHi - 1e-9 : price <= extLo + 1e-9;
        levels.push({
          kind,
          price,
          sources: group.map((s) => s.index),
          scope: isExternal ? "external" : "internal",
          taken: false,
          takenIndex: null,
        });
      }
    }
  };
  clusterEqual(highs, "equal_high");
  clusterEqual(lows, "equal_low");

  // Every individual swing high is BSL, swing low is SSL.
  for (const s of highs) {
    levels.push({
      kind: "buy_side",
      price: s.price,
      sources: [s.index],
      scope: s.price >= extHi - 1e-9 ? "external" : "internal",
      taken: false,
      takenIndex: null,
    });
  }
  for (const s of lows) {
    levels.push({
      kind: "sell_side",
      price: s.price,
      sources: [s.index],
      scope: s.price <= extLo + 1e-9 ? "external" : "internal",
      taken: false,
      takenIndex: null,
    });
  }

  // Walk candles to detect sweeps of confirmed levels (no lookahead).
  const events: LiquidityEvent[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const confirmedIdx = i - lookback;
    const win = candles.slice(Math.max(0, i - 20), i);
    const avgVol =
      win.length > 0 ? win.reduce((a, x) => a + x.v, 0) / win.length : c.v;

    for (const lv of levels) {
      // Only consider levels whose latest source is confirmed by this candle.
      const latestSrc = Math.max(...lv.sources);
      if (latestSrc > confirmedIdx) continue;
      if (lv.taken) continue;

      const isTop = lv.kind === "buy_side" || lv.kind === "equal_high";
      if (isTop && c.h > lv.price) {
        lv.taken = true;
        lv.takenIndex = i;
        const reclaim = c.c < lv.price;
        const grab = c.v > avgVol * grabMul && reclaim;
        events.push({
          type: grab ? "grab" : reclaim ? "sweep" : "stop_hunt",
          side: "buy",
          index: i,
          t: c.t,
          level: lv.price,
          reclaim,
        });
      } else if (!isTop && c.l < lv.price) {
        lv.taken = true;
        lv.takenIndex = i;
        const reclaim = c.c > lv.price;
        const grab = c.v > avgVol * grabMul && reclaim;
        events.push({
          type: grab ? "grab" : reclaim ? "sweep" : "stop_hunt",
          side: "sell",
          index: i,
          t: c.t,
          level: lv.price,
          reclaim,
        });
      }
    }
  }

  // Inducement: a minor (internal) sweep that occurred BEFORE a larger
  // (external) sweep on the same side, within a rolling window.
  const window = 50;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const lv = levels.find(
      (l) => l.takenIndex === e.index && l.price === e.level,
    );
    if (!lv || lv.scope !== "internal") continue;
    const laterExternal = events
      .slice(i + 1)
      .find((x) => x.side === e.side && x.index - e.index <= window && x.type !== "inducement");
    if (!laterExternal) continue;
    const laterLv = levels.find(
      (l) => l.takenIndex === laterExternal.index && l.price === laterExternal.level,
    );
    if (laterLv && laterLv.scope === "external") {
      events.push({
        type: "inducement",
        side: e.side,
        index: e.index,
        t: e.t,
        level: e.level,
        reclaim: e.reclaim,
      });
    }
  }

  return { levels, events };
}