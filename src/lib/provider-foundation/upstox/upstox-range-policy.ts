// Deterministic range policy for the Upstox historical-candle V3 endpoint.
// Client-safe (no server-only imports).

import type { Timeframe } from "../types";

export interface RangePolicy {
  readonly timeframe: Timeframe;
  readonly earliestSupportedDate: string; // ISO date
  readonly maximumRequestSpanDays: number;
  readonly chunkingRequired: boolean;
  readonly supported: boolean;
  readonly reason: string;
}

// Values reflect documented Upstox limits at time of adapter authoring.
// If Upstox tightens limits, the adapter fails explicitly rather than
// silently fabricating data.
const POLICY: Readonly<Record<Timeframe, RangePolicy>> = {
  "1m": {
    timeframe: "1m",
    earliestSupportedDate: "2022-01-01",
    maximumRequestSpanDays: 30,
    chunkingRequired: true,
    supported: true,
    reason: "1-minute history capped at ~1 month per request",
  },
  "3m": {
    timeframe: "3m",
    earliestSupportedDate: "2022-01-01",
    maximumRequestSpanDays: 60,
    chunkingRequired: true,
    supported: true,
    reason: "3-minute history requires chunking beyond 60 days",
  },
  "5m": {
    timeframe: "5m",
    earliestSupportedDate: "2022-01-01",
    maximumRequestSpanDays: 90,
    chunkingRequired: true,
    supported: true,
    reason: "5-minute history requires chunking beyond 90 days",
  },
  "15m": {
    timeframe: "15m",
    earliestSupportedDate: "2022-01-01",
    maximumRequestSpanDays: 180,
    chunkingRequired: true,
    supported: true,
    reason: "15-minute history requires chunking beyond 180 days",
  },
  "1h": {
    timeframe: "1h",
    earliestSupportedDate: "2020-01-01",
    maximumRequestSpanDays: 365,
    chunkingRequired: true,
    supported: true,
    reason: "1-hour history requires chunking beyond 365 days",
  },
  "1d": {
    timeframe: "1d",
    earliestSupportedDate: "2000-01-01",
    maximumRequestSpanDays: 365 * 10,
    chunkingRequired: false,
    supported: true,
    reason: "Daily history supports large single-request spans",
  },
};

export function policyFor(tf: Timeframe): RangePolicy {
  return POLICY[tf];
}

export interface RangeChunk {
  readonly from: string; // ISO date YYYY-MM-DD
  readonly to: string; // ISO date YYYY-MM-DD
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(s: string): Date {
  // Accept YYYY-MM-DD or full ISO.
  const d = new Date(s.length === 10 ? s + "T00:00:00.000Z" : s);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${s}`);
  return d;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export interface RangeValidation {
  readonly ok: boolean;
  readonly reason: string;
  readonly chunks: readonly RangeChunk[];
}

/**
 * Validate a requested range against the policy and produce deterministic
 * ordered chunks (inclusive dates). Chunks never fabricate gaps — they only
 * partition the requested window.
 */
export function planRange(tf: Timeframe, fromIso: string, toIso: string): RangeValidation {
  const policy = policyFor(tf);
  if (!policy.supported) return { ok: false, reason: policy.reason, chunks: [] };

  let from: Date;
  let to: Date;
  try {
    from = parseIsoDate(fromIso);
    to = parseIsoDate(toIso);
  } catch (e) {
    return { ok: false, reason: (e as Error).message, chunks: [] };
  }
  if (from.getTime() > to.getTime()) {
    return { ok: false, reason: "from > to", chunks: [] };
  }
  const earliest = parseIsoDate(policy.earliestSupportedDate);
  if (from.getTime() < earliest.getTime()) {
    return {
      ok: false,
      reason: `from < earliest supported (${policy.earliestSupportedDate})`,
      chunks: [],
    };
  }

  const chunks: RangeChunk[] = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    const end = addDays(cursor, policy.maximumRequestSpanDays - 1);
    const chunkTo = end.getTime() > to.getTime() ? to : end;
    chunks.push({ from: toIsoDate(cursor), to: toIsoDate(chunkTo) });
    cursor = addDays(chunkTo, 1);
  }
  return { ok: true, reason: "planned", chunks };
}