// Phase 3D — Combined market-internals snapshot.
// Consumes canonical breadth, PCR, VIX, Decision, GTI. No provider access.

import type { MarketBreadthSnapshot } from "@/lib/market-breadth/types";
import type { MarketInternals, CalcAvailability } from "./types";

export interface MarketInternalsInput {
  readonly broadBreadth: MarketBreadthSnapshot | null;
  readonly pcrScore: number | null;
  readonly pcrState: string | null;
  readonly vix: number | null;
  readonly decisionAction: string | null;
  readonly decisionConfidence: number | null;
  readonly gtiState: string | null;
  readonly gtiConfidence: number | null;
}

export function buildMarketInternals(i: MarketInternalsInput): MarketInternals {
  const advances = i.broadBreadth?.advances ?? null;
  const declines = i.broadBreadth?.declines ?? null;
  const unchanged = i.broadBreadth?.unchanged ?? null;
  const ratio = i.broadBreadth?.advanceDeclineRatio ?? null;
  const net = i.broadBreadth?.netBreadth ?? null;

  const parts = [advances, i.pcrScore, i.vix, i.decisionAction, i.gtiState];
  const present = parts.filter((v) => v != null).length;
  const availability: CalcAvailability =
    present === 0 ? "UNAVAILABLE" : present === parts.length ? "OK" : "PARTIAL";

  return {
    advances,
    declines,
    unchanged,
    advanceDeclineRatio: ratio,
    netBreadth: net,
    pcr: i.pcrScore,
    pcrState: i.pcrState ?? "UNAVAILABLE",
    vix: i.vix,
    decisionAction: i.decisionAction ?? "UNAVAILABLE",
    decisionConfidence: i.decisionConfidence,
    gtiState: i.gtiState ?? "UNAVAILABLE",
    gtiConfidence: i.gtiConfidence ?? 0,
    availability,
  };
}