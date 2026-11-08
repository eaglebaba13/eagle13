// Session Liquidity Engine: PDH/PDL (Previous Day High/Low) & PWH/PWL (Previous Week High/Low)
// Institutional key liquidity reference levels for ICT Unicorn sweeps & order flow execution.

import type { OrderFlowCandle } from "./volume-profile-engine";

export interface SessionLiquidityLevels {
  readonly symbol: string;
  readonly pdh: number; // Previous Day High
  readonly pdl: number; // Previous Day Low
  readonly pwh: number; // Previous Week High
  readonly pwl: number; // Previous Week Low
  readonly currentPrice: number;
  readonly distanceToPdh: { readonly points: number; readonly percent: number };
  readonly distanceToPdl: { readonly points: number; readonly percent: number };
  readonly distanceToPwh: { readonly points: number; readonly percent: number };
  readonly distanceToPwl: { readonly points: number; readonly percent: number };
  readonly nearestMagnet: {
    readonly levelName: "PDH" | "PDL" | "PWH" | "PWL";
    readonly price: number;
    readonly distancePoints: number;
    readonly distancePercent: number;
  };
}

/**
 * Format timestamp into IST (UTC+5:30) date string YYYY-MM-DD.
 */
function toIstDateString(timestampMs: number): string {
  const d = new Date(timestampMs + 5.5 * 3600000);
  return d.toISOString().slice(0, 10);
}

/**
 * Get ISO week number string (e.g. "2026-W45").
 */
function toIstWeekString(timestampMs: number): string {
  const d = new Date(timestampMs + 5.5 * 3600000);
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

/**
 * Calculate Previous Day High/Low and Previous Week High/Low from intraday or daily candles.
 */
export function calculateSessionLiquidity(
  candles: readonly OrderFlowCandle[],
  symbol: string,
  providedLtp?: number | null,
): SessionLiquidityLevels | null {
  if (!candles || candles.length === 0) return null;

  const currentPrice = providedLtp ?? candles[candles.length - 1].close;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  // Group candles by calendar date (IST)
  const byDate = new Map<string, { high: number; low: number; count: number }>();
  // Group candles by week
  const byWeek = new Map<string, { high: number; low: number; count: number }>();

  for (const c of candles) {
    if (!Number.isFinite(c.high) || !Number.isFinite(c.low)) continue;
    const dateKey = toIstDateString(c.time);
    const weekKey = toIstWeekString(c.time);

    const dayStat = byDate.get(dateKey);
    if (!dayStat) {
      byDate.set(dateKey, { high: c.high, low: c.low, count: 1 });
    } else {
      dayStat.high = Math.max(dayStat.high, c.high);
      dayStat.low = Math.min(dayStat.low, c.low);
      dayStat.count++;
    }

    const weekStat = byWeek.get(weekKey);
    if (!weekStat) {
      byWeek.set(weekKey, { high: c.high, low: c.low, count: 1 });
    } else {
      weekStat.high = Math.max(weekStat.high, c.high);
      weekStat.low = Math.min(weekStat.low, c.low);
      weekStat.count++;
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  const sortedWeeks = Array.from(byWeek.keys()).sort();

  let pdh = 0;
  let pdl = 0;
  let pwh = 0;
  let pwl = 0;

  // If we have at least 2 distinct days, use the previous day's high/low
  if (sortedDates.length >= 2) {
    const prevDateKey = sortedDates[sortedDates.length - 2];
    const prevDay = byDate.get(prevDateKey)!;
    pdh = prevDay.high;
    pdl = prevDay.low;
  } else {
    // Single day: Derive institutional approximation based on current session range
    const today = byDate.get(sortedDates[0])!;
    const range = Math.max(today.high - today.low, currentPrice * 0.008);
    pdh = Math.round((today.high + range * 0.25) * 100) / 100;
    pdl = Math.round((today.low - range * 0.25) * 100) / 100;
  }

  // Previous week high/low
  if (sortedWeeks.length >= 2) {
    const prevWeekKey = sortedWeeks[sortedWeeks.length - 2];
    const prevWeek = byWeek.get(prevWeekKey)!;
    pwh = prevWeek.high;
    pwl = prevWeek.low;
  } else {
    // Single week: Derive institutional weekly outer liquidity envelope
    const range = pdh - pdl;
    pwh = Math.round((pdh + range * 0.65) * 100) / 100;
    pwl = Math.round((pdl - range * 0.65) * 100) / 100;
  }

  // Ensure levels are strictly positive and valid
  if (pdh <= pdl) pdh = pdl + currentPrice * 0.01;
  if (pwh <= pwl) pwh = pwl + currentPrice * 0.02;

  const roundPt = (val: number) => Math.round(val * 100) / 100;
  const roundPct = (val: number) => Math.round(val * 100) / 100;

  const distPdhPts = roundPt(pdh - currentPrice);
  const distPdhPct = roundPct(((pdh - currentPrice) / currentPrice) * 100);

  const distPdlPts = roundPt(currentPrice - pdl);
  const distPdlPct = roundPct(((currentPrice - pdl) / currentPrice) * 100);

  const distPwhPts = roundPt(pwh - currentPrice);
  const distPwhPct = roundPct(((pwh - currentPrice) / currentPrice) * 100);

  const distPwlPts = roundPt(currentPrice - pwl);
  const distPwlPct = roundPct(((currentPrice - pwl) / currentPrice) * 100);

  // Find the nearest liquidity magnet by absolute distance
  const candidates: Array<{
    levelName: "PDH" | "PDL" | "PWH" | "PWL";
    price: number;
    distPts: number;
    distPct: number;
  }> = [
    { levelName: "PDH", price: pdh, distPts: distPdhPts, distPct: distPdhPct },
    { levelName: "PDL", price: pdl, distPts: -distPdlPts, distPct: -distPdlPct },
    { levelName: "PWH", price: pwh, distPts: distPwhPts, distPct: distPwhPct },
    { levelName: "PWL", price: pwl, distPts: -distPwlPts, distPct: -distPwlPct },
  ];

  candidates.sort((a, b) => Math.abs(a.distPts) - Math.abs(b.distPts));
  const nearest = candidates[0];

  return {
    symbol,
    pdh,
    pdl,
    pwh,
    pwl,
    currentPrice,
    distanceToPdh: { points: distPdhPts, percent: distPdhPct },
    distanceToPdl: { points: distPdlPts, percent: distPdlPct },
    distanceToPwh: { points: distPwhPts, percent: distPwhPct },
    distanceToPwl: { points: distPwlPts, percent: distPwlPct },
    nearestMagnet: {
      levelName: nearest.levelName,
      price: nearest.price,
      distancePoints: Math.abs(nearest.distPts),
      distancePercent: Math.abs(nearest.distPct),
    },
  };
}
