// Phase 2I-C — Pure confirmation aggregation.

import type { GannGapConfirmation } from "./types";

export interface ConfirmationAggregate {
  readonly total: number;
  readonly aligned: number;
  readonly conflict: number;
  readonly neutral: number;
  readonly unavailable: number;
  readonly bullish: number;
  readonly bearish: number;
  readonly netDirection: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";
  readonly coverageRatio: number; // aligned / (total - unavailable), 0..1
}

export function aggregateConfirmations(
  confirmations: readonly GannGapConfirmation[],
  bias: "SUPPORTS_UP" | "SUPPORTS_DOWN",
): ConfirmationAggregate {
  let aligned = 0, conflict = 0, neutral = 0, unavailable = 0, bullish = 0, bearish = 0;
  for (const c of confirmations) {
    if (c.alignment === bias) aligned++;
    else if (c.alignment === "NEUTRAL") neutral++;
    else if (c.alignment === "UNAVAILABLE") unavailable++;
    else conflict++;
    if (c.direction === "BULLISH") bullish++;
    else if (c.direction === "BEARISH") bearish++;
  }
  const total = confirmations.length;
  const usable = Math.max(0, total - unavailable);
  const coverage = usable === 0 ? 0 : aligned / usable;
  const netDirection: ConfirmationAggregate["netDirection"] =
    total === unavailable
      ? "UNKNOWN"
      : bullish > bearish
        ? "BULLISH"
        : bearish > bullish
          ? "BEARISH"
          : "NEUTRAL";
  return {
    total,
    aligned,
    conflict,
    neutral,
    unavailable,
    bullish,
    bearish,
    netDirection,
    coverageRatio: coverage,
  };
}
