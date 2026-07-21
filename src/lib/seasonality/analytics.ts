// Phase 45A — Seasonality Intelligence Analytics.
//
// Pure, deterministic statistics computed on the existing SeasonalityData.
// This module NEVER mutates historical values — it only derives descriptive
// statistics, probabilities, ranks, and qualitative bias labels.

import type { SeasonalityData, SeasonRow } from "@/lib/seasonality.functions";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const MONTH_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
] as const;

export type SeasonalBias =
  | "EXTREME_BULLISH"
  | "BULLISH"
  | "NEUTRAL"
  | "BEARISH"
  | "EXTREME_BEARISH";

export type SeasonalStrength = "WEAK" | "MODERATE" | "BULLISH" | "STRONG";

export interface MonthlyStats {
  readonly monthIndex: number; // 0..11
  readonly monthName: string;
  readonly values: readonly number[]; // non-null years for this month
  readonly count: number;
  readonly positive: number;
  readonly negative: number;
  readonly flat: number; // |x| < 0.05 treated as flat
  readonly winRate: number; // 0..1
  readonly lossRate: number; // 0..1
  readonly flatRate: number; // 0..1
  readonly average: number | null;
  readonly median: number | null;
  readonly stdev: number | null;
  readonly best: number | null;
  readonly worst: number | null;
  readonly bestYear: number | null;
  readonly worstYear: number | null;
  readonly maxGain: number | null;
  readonly maxLoss: number | null;
  readonly consistency: number; // 0..1 — 1 - stdev/scale
  readonly probPositive: number; // == winRate
  readonly probNegative: number;
  readonly historicalRank: number; // 1..12 by average, 1 = best
  readonly bias: SeasonalBias;
  readonly score: number; // 0..100
  readonly strength: SeasonalStrength;
}

export interface CellIntelligence {
  readonly year: number;
  readonly monthIndex: number;
  readonly value: number | null;
  readonly rankInMonth: number | null; // 1 = best
  readonly totalInMonth: number;
  readonly zScore: number | null;
  readonly vsAverage: number | null;
  readonly bias: SeasonalBias;
}

export interface SeasonalityIntelligence {
  readonly monthly: readonly MonthlyStats[];
  readonly bestMonth: MonthlyStats | null;
  readonly worstMonth: MonthlyStats | null;
  readonly currentMonth: MonthlyStats | null;
  readonly currentMonthIndex: number;
  readonly averageMonthlyReturn: number | null;
  readonly medianMonthlyReturn: number | null;
  readonly volatilityScore: number | null;
  readonly positiveYears: number;
  readonly negativeYears: number;
  readonly overallWinRate: number | null;
  readonly cell: (year: number, monthIndex: number) => CellIntelligence;
}

function mean(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stdev(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function classifyBias(avg: number | null): SeasonalBias {
  if (avg == null) return "NEUTRAL";
  if (avg >= 3) return "EXTREME_BULLISH";
  if (avg >= 1) return "BULLISH";
  if (avg <= -3) return "EXTREME_BEARISH";
  if (avg <= -1) return "BEARISH";
  return "NEUTRAL";
}

/** Blend of directional bias (avg), consistency (win rate), and stability (low stdev). */
export function seasonalityScore(
  avg: number | null,
  winRate: number,
  sd: number | null,
): number {
  if (avg == null) return 0;
  // Direction component: map [-5, +5] → [0, 100], clamp.
  const dirComp = Math.max(0, Math.min(100, 50 + avg * 10));
  // Consistency component: win rate 0..1 → 0..100
  const consComp = winRate * 100;
  // Stability component: stdev ~[0..10] → 100..0
  const sdVal = sd ?? 5;
  const stabComp = Math.max(0, Math.min(100, 100 - sdVal * 10));
  const raw = dirComp * 0.5 + consComp * 0.3 + stabComp * 0.2;
  return Math.round(raw);
}

function strengthFor(score: number, bias: SeasonalBias): SeasonalStrength {
  if (score >= 80) return "STRONG";
  if (score >= 65) return bias === "BULLISH" || bias === "EXTREME_BULLISH" ? "BULLISH" : "MODERATE";
  if (score >= 50) return "MODERATE";
  return "WEAK";
}

function buildMonthlyStats(rows: readonly SeasonRow[], monthIndex: number): MonthlyStats {
  const pairs = rows
    .map((r) => ({ year: r.year, v: r.months[monthIndex] }))
    .filter((p): p is { year: number; v: number } => p.v != null);
  const values = pairs.map((p) => p.v);
  const positive = values.filter((v) => v > 0.05).length;
  const negative = values.filter((v) => v < -0.05).length;
  const flat = values.length - positive - negative;
  const winRate = values.length ? positive / values.length : 0;
  const lossRate = values.length ? negative / values.length : 0;
  const flatRate = values.length ? flat / values.length : 0;
  const avg = mean(values);
  const med = median(values);
  const sd = stdev(values);
  let best: number | null = null, worst: number | null = null;
  let bestYear: number | null = null, worstYear: number | null = null;
  for (const { year, v } of pairs) {
    if (best == null || v > best) { best = v; bestYear = year; }
    if (worst == null || v < worst) { worst = v; worstYear = year; }
  }
  const consistency = sd == null ? 0 : Math.max(0, Math.min(1, 1 - sd / 10));
  const bias = classifyBias(avg);
  const score = seasonalityScore(avg, winRate, sd);
  const strength = strengthFor(score, bias);
  return {
    monthIndex,
    monthName: MONTH_NAMES[monthIndex],
    values,
    count: values.length,
    positive,
    negative,
    flat,
    winRate,
    lossRate,
    flatRate,
    average: avg,
    median: med,
    stdev: sd,
    best,
    worst,
    bestYear,
    worstYear,
    maxGain: best,
    maxLoss: worst,
    consistency,
    probPositive: winRate,
    probNegative: lossRate,
    historicalRank: 0, // filled below
    bias,
    score,
    strength,
  };
}

export function computeIntelligence(
  data: SeasonalityData,
  nowIso?: string,
): SeasonalityIntelligence {
  const now = nowIso ? new Date(nowIso) : new Date();
  const currentMonthIndex = now.getUTCMonth();
  const monthly: MonthlyStats[] = [];
  for (let m = 0; m < 12; m++) monthly.push(buildMonthlyStats(data.years, m));

  // Rank by average return (highest = 1). Nulls sink to bottom.
  const ordered = [...monthly].sort((a, b) => {
    if (a.average == null && b.average == null) return 0;
    if (a.average == null) return 1;
    if (b.average == null) return -1;
    return b.average - a.average;
  });
  ordered.forEach((m, i) => {
    (monthly[m.monthIndex] as { historicalRank: number }).historicalRank = i + 1;
  });

  const allValues: number[] = [];
  let posYears = 0, negYears = 0;
  for (const row of data.years) {
    let yearlyPos = 0, yearlyNeg = 0;
    for (const v of row.months) {
      if (v == null) continue;
      allValues.push(v);
      if (v > 0) yearlyPos++; else if (v < 0) yearlyNeg++;
    }
    if (yearlyPos > yearlyNeg) posYears++;
    else if (yearlyNeg > yearlyPos) negYears++;
  }

  const overallAvg = mean(allValues);
  const overallMedian = median(allValues);
  const overallSd = stdev(allValues);
  const overallWinRate = allValues.length
    ? allValues.filter((v) => v > 0).length / allValues.length
    : null;

  const withValues = monthly.filter((m) => m.average != null);
  const bestMonth = withValues.length
    ? withValues.reduce((a, b) => ((b.average ?? -Infinity) > (a.average ?? -Infinity) ? b : a))
    : null;
  const worstMonth = withValues.length
    ? withValues.reduce((a, b) => ((b.average ?? Infinity) < (a.average ?? Infinity) ? b : a))
    : null;

  const cell = (year: number, monthIndex: number): CellIntelligence => {
    const row = data.years.find((r) => r.year === year);
    const value = row?.months[monthIndex] ?? null;
    const mstats = monthly[monthIndex];
    const values = mstats.values;
    let rank: number | null = null;
    if (value != null) {
      const sorted = [...values].sort((a, b) => b - a);
      rank = sorted.indexOf(value) + 1;
    }
    const z = value != null && mstats.stdev && mstats.average != null
      ? (value - mstats.average) / mstats.stdev
      : null;
    const vsAvg = value != null && mstats.average != null ? value - mstats.average : null;
    return {
      year,
      monthIndex,
      value,
      rankInMonth: rank,
      totalInMonth: values.length,
      zScore: z,
      vsAverage: vsAvg,
      bias: classifyBias(value),
    };
  };

  return {
    monthly,
    bestMonth,
    worstMonth,
    currentMonth: monthly[currentMonthIndex],
    currentMonthIndex,
    averageMonthlyReturn: overallAvg,
    medianMonthlyReturn: overallMedian,
    volatilityScore: overallSd,
    positiveYears: posYears,
    negativeYears: negYears,
    overallWinRate,
    cell,
  };
}

export function biasLabel(b: SeasonalBias): string {
  return {
    EXTREME_BULLISH: "Extreme Bullish",
    BULLISH: "Bullish",
    NEUTRAL: "Neutral",
    BEARISH: "Bearish",
    EXTREME_BEARISH: "Extreme Bearish",
  }[b];
}

/** Deterministic template-based narrative. No LLM. */
export function aiInsight(intel: SeasonalityIntelligence): string {
  const cm = intel.currentMonth;
  if (!cm || cm.count === 0) {
    return "Not enough historical data to compute a seasonal outlook for the current month. Seasonality alone should never drive trading decisions.";
  }
  const avg = cm.average ?? 0;
  const direction = avg > 0.5 ? "positive" : avg < -0.5 ? "negative" : "flat";
  const dispersion = (cm.stdev ?? 0) > 4 ? "high" : (cm.stdev ?? 0) > 2 ? "moderate" : "low";
  const winPct = Math.round(cm.winRate * 100);
  return (
    `Historically ${cm.monthName} has delivered ${direction} average returns ` +
    `(${avg.toFixed(2)}%) with ${dispersion} dispersion (σ≈${(cm.stdev ?? 0).toFixed(2)}). ` +
    `Win rate is ${winPct}% across ${cm.count} observed years. ` +
    `Current seasonal probability is ${biasLabel(cm.bias).toLowerCase()}. ` +
    `Seasonality alone should not be used for trading decisions.`
  );
}

export function tradeSuggestions(m: MonthlyStats): readonly string[] {
  const out: string[] = [];
  if (m.score >= 75 && (m.bias === "BULLISH" || m.bias === "EXTREME_BULLISH")) out.push("Historically Strong Month");
  if (m.score <= 35) out.push("Historically Weak Month");
  if (m.winRate >= 0.7) out.push("High Consistency Month");
  if ((m.stdev ?? 0) >= 5) out.push("High Dispersion — Avoid Counter Trend");
  if (m.bias === "BULLISH" || m.bias === "EXTREME_BULLISH") out.push("Momentum Month");
  if (m.bias === "BEARISH" || m.bias === "EXTREME_BEARISH") out.push("Caution / Reversal Watch");
  if (out.length === 0) out.push("Neutral — No Directional Edge");
  out.push("Research Only · Not a Trade Signal");
  return out;
}

export function biasColor(b: SeasonalBias): { bg: string; fg: string } {
  switch (b) {
    case "EXTREME_BULLISH": return { bg: "color-mix(in srgb, var(--eb-bull) 90%, transparent)", fg: "#04140b" };
    case "BULLISH":         return { bg: "color-mix(in srgb, var(--eb-bull) 55%, transparent)", fg: "var(--eb-text)" };
    case "NEUTRAL":         return { bg: "color-mix(in srgb, var(--eb-muted) 15%, transparent)", fg: "var(--eb-text)" };
    case "BEARISH":         return { bg: "color-mix(in srgb, var(--eb-bear) 55%, transparent)", fg: "#fff" };
    case "EXTREME_BEARISH": return { bg: "color-mix(in srgb, var(--eb-bear) 90%, transparent)", fg: "#fff" };
  }
}

/** CSV of full seasonality matrix + monthly stats footer. */
export function toCsv(data: SeasonalityData, intel: SeasonalityIntelligence): string {
  const lines: string[] = [];
  lines.push(["Year", ...MONTH_SHORT].join(","));
  for (const row of data.years) {
    lines.push([row.year, ...row.months.map((v) => (v == null ? "" : v.toFixed(2)))].join(","));
  }
  lines.push(["Avg", ...intel.monthly.map((m) => (m.average == null ? "" : m.average.toFixed(2)))].join(","));
  lines.push(["WinRate%", ...intel.monthly.map((m) => (m.winRate * 100).toFixed(0))].join(","));
  lines.push(["Score", ...intel.monthly.map((m) => m.score.toString())].join(","));
  return lines.join("\n");
}