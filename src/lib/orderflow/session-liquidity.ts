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
    const candleHigh = Math.max(c.high, c.low, Number.isFinite(c.open) ? c.open : c.high, Number.isFinite(c.close) ? c.close : c.low);
    const candleLow = Math.min(c.high, c.low, Number.isFinite(c.open) ? c.open : c.high, Number.isFinite(c.close) ? c.close : c.low);
    const dateKey = toIstDateString(c.time);
    const weekKey = toIstWeekString(c.time);

    const dayStat = byDate.get(dateKey);
    if (!dayStat) {
      byDate.set(dateKey, { high: candleHigh, low: candleLow, count: 1 });
    } else {
      dayStat.high = Math.max(dayStat.high, candleHigh);
      dayStat.low = Math.min(dayStat.low, candleLow);
      dayStat.count++;
    }

    const weekStat = byWeek.get(weekKey);
    if (!weekStat) {
      byWeek.set(weekKey, { high: candleHigh, low: candleLow, count: 1 });
    } else {
      weekStat.high = Math.max(weekStat.high, candleHigh);
      weekStat.low = Math.min(weekStat.low, candleLow);
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
    pdh = Math.max(prevDay.high, prevDay.low);
    pdl = Math.min(prevDay.high, prevDay.low);
  } else {
    // Single day: Derive institutional approximation based on current session range
    const today = byDate.get(sortedDates[0])!;
    const todayHigh = Math.max(today.high, today.low);
    const todayLow = Math.min(today.high, today.low);
    const range = Math.max(todayHigh - todayLow, currentPrice * 0.008);
    pdh = Math.round((todayHigh + range * 0.25) * 100) / 100;
    pdl = Math.round((todayLow - range * 0.25) * 100) / 100;
  }

  // Strictly enforce pdh >= pdl
  let safePdh = Math.max(pdh, pdl);
  let safePdl = Math.min(pdh, pdl);
  if (safePdh <= safePdl) {
    safePdh = safePdl + Math.max(currentPrice * 0.005, 0.5);
  }
  pdh = safePdh;
  pdl = safePdl;

  // Previous week high/low
  if (sortedWeeks.length >= 2) {
    const prevWeekKey = sortedWeeks[sortedWeeks.length - 2];
    const prevWeek = byWeek.get(prevWeekKey)!;
    pwh = Math.max(prevWeek.high, prevWeek.low);
    pwl = Math.min(prevWeek.high, prevWeek.low);
  } else {
    // Single week: Derive institutional weekly outer liquidity envelope
    const range = pdh - pdl;
    pwh = Math.round((pdh + range * 0.65) * 100) / 100;
    pwl = Math.round((pdl - range * 0.65) * 100) / 100;
  }

  // Strictly enforce pwh >= pwl and outer bounds
  let safePwh = Math.max(pwh, pwl);
  let safePwl = Math.min(pwh, pwl);
  if (safePwh <= safePwl) {
    safePwh = safePwl + Math.max(currentPrice * 0.01, 1.0);
  }
  pwh = safePwh;
  pwl = safePwl;

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
