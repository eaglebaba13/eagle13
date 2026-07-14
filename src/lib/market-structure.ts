// Phase 21.1 — Market Structure Engine.
//
// Pure, deterministic detector for HH / HL / LH / LL, BOS, CHoCH and MSS.
// Consumes an OHLC series and returns labelled swing points plus structure
// events. No lookahead: swings are only confirmed `lookback` candles after
// they form, and events fire on the candle whose close actually breaks a
// prior confirmed swing.

import type { Candle, Swing } from "./smc-types";
import { detectSwings } from "./smc-types";

export type SwingLabel = "HH" | "HL" | "LH" | "LL";

export type LabeledSwing = Swing & { label: SwingLabel | null };

export type StructureEventType = "BOS" | "CHoCH" | "MSS";

export type StructureEvent = {
  type: StructureEventType;
  direction: "bull" | "bear";
  /** Candle index whose close broke the reference swing. */
  index: number;
  t: number;
  brokenSwing: Swing;
  price: number;
};

export type StructureState = {
  bias: "bullish" | "bearish" | "neutral";
  /** 0..1 strength derived from streak of trend-continuing swings + latest event. */
  strength: number;
  lastEvent: StructureEvent | null;
  swings: LabeledSwing[];
  events: StructureEvent[];
};

/** Label a chronological list of swings with HH/HL/LH/LL relative to prior same-kind swing. */
export function labelSwings(swings: Swing[]): LabeledSwing[] {
  const out: LabeledSwing[] = [];
  let prevHigh: Swing | null = null;
  let prevLow: Swing | null = null;
  for (const s of swings) {
    let label: SwingLabel | null = null;
    if (s.kind === "high") {
      if (prevHigh) label = s.price > prevHigh.price ? "HH" : "LH";
      prevHigh = s;
    } else {
      if (prevLow) label = s.price > prevLow.price ? "HL" : "LL";
      prevLow = s;
    }
    out.push({ ...s, label });
  }
  return out;
}

/**
 * Detect BOS / CHoCH / MSS events by walking the candle series forward.
 *
 * - BOS  : close breaks the most recent confirmed swing IN the direction of
 *          the current bias.
 * - CHoCH: close breaks the most recent confirmed swing AGAINST the current
 *          bias — flips the bias.
 * - MSS  : a CHoCH accompanied by displacement (candle range >= 1.5x the
 *          recent average). MSS events are ALSO emitted as CHoCH so callers
 *          that only care about structure flips keep working.
 */
export function analyzeStructure(candles: Candle[], lookback = 2): StructureState {
  const rawSwings = detectSwings(candles, lookback);
  const labeled = labelSwings(rawSwings);

  const events: StructureEvent[] = [];
  let bias: "bullish" | "bearish" | "neutral" = "neutral";

  // Rolling reference swings (only swings CONFIRMED by candle i are eligible).
  for (let i = lookback; i < candles.length; i++) {
    // A swing at pivot index p is confirmed once i >= p + lookback.
    const confirmedIdx = i - lookback;
    const confirmed = labeled.filter((s) => s.index <= confirmedIdx);
    const lastHigh = [...confirmed].reverse().find((s) => s.kind === "high");
    const lastLow = [...confirmed].reverse().find((s) => s.kind === "low");
    const c = candles[i];

    // Average true range proxy for displacement.
    const win = candles.slice(Math.max(0, i - 10), i);
    const avgRange = win.length
      ? win.reduce((a, x) => a + (x.h - x.l), 0) / win.length
      : c.h - c.l;
    const displaced = c.h - c.l >= avgRange * 1.5;

    if (lastHigh && c.c > lastHigh.price) {
      const type: StructureEventType =
        bias === "bearish" ? (displaced ? "MSS" : "CHoCH") : "BOS";
      events.push({
        type,
        direction: "bull",
        index: i,
        t: c.t,
        brokenSwing: lastHigh,
        price: c.c,
      });
      bias = "bullish";
    } else if (lastLow && c.c < lastLow.price) {
      const type: StructureEventType =
        bias === "bullish" ? (displaced ? "MSS" : "CHoCH") : "BOS";
      events.push({
        type,
        direction: "bear",
        index: i,
        t: c.t,
        brokenSwing: lastLow,
        price: c.c,
      });
      bias = "bearish";
    }
  }

  const lastEvent = events.length ? events[events.length - 1] : null;

  // Strength = trailing streak of trend-continuing swings, capped, blended
  // with a displacement bonus if the last event was MSS.
  let streak = 0;
  const wantedHigh: SwingLabel = bias === "bullish" ? "HH" : "LH";
  const wantedLow: SwingLabel = bias === "bullish" ? "HL" : "LL";
  for (let i = labeled.length - 1; i >= 0; i--) {
    const l = labeled[i].label;
    if (bias === "neutral") break;
    if (l === wantedHigh || l === wantedLow) streak++;
    else break;
  }
  const base = Math.min(1, streak / 4);
  const bonus = lastEvent?.type === "MSS" ? 0.15 : 0;
  const strength = bias === "neutral" ? 0 : Math.min(1, base + bonus);

  return { bias, strength, lastEvent, swings: labeled, events };
}