import type { OHLC } from "./market.functions";

export type Levels = {
  pivot: number;
  tc: number; // top central
  bc: number; // bottom central
  cprWidth: number;
  cprWidthPct: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
  safeBuy: number;
  safeSell: number;
  gannUp: number;
  gannDown: number;
};

const r = (n: number) => Math.round(n * 100) / 100;

export function computeLevels(o: OHLC, safeBand: number): Levels {
  const { high, low, close } = o;
  const pivot = (high + low + close) / 3;
  const bc = (pivot + low) / 2; // BC = (PP + Low) / 2
  const tc = (pivot + high) / 2; // TC = (PP + High) / 2
  const topCentral = Math.max(tc, bc);
  const bottomCentral = Math.min(tc, bc);
  const width = topCentral - bottomCentral;

  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;
  const r2 = pivot + (high - low);
  const s2 = pivot - (high - low);
  const r3 = high + 2 * (pivot - low);
  const s3 = low - 2 * (high - pivot);

  // Gann square-of-9 style 360° projection from close.
  const sq = Math.sqrt(close);
  const gannUp = Math.pow(sq + 1, 2);
  const gannDown = Math.pow(sq - 1, 2);

  return {
    pivot: r(pivot),
    tc: r(topCentral),
    bc: r(bottomCentral),
    cprWidth: r(width),
    cprWidthPct: r((width / close) * 100),
    r1: r(r1),
    r2: r(r2),
    r3: r(r3),
    s1: r(s1),
    s2: r(s2),
    s3: r(s3),
    safeBuy: r(close + safeBand),
    safeSell: r(close - safeBand),
    gannUp: r(gannUp),
    gannDown: r(gannDown),
  };
}

export function cprBias(l: Levels): {
  label: string;
  tone: "bull" | "bear" | "neutral";
} {
  if (l.cprWidthPct < 0.3) return { label: "NARROW · TRENDING DAY LIKELY", tone: "bull" };
  if (l.cprWidthPct > 0.75) return { label: "WIDE · SIDEWAYS / RANGE DAY", tone: "bear" };
  return { label: "MODERATE · BALANCED SETUP", tone: "neutral" };
}
