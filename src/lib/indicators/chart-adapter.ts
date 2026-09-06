// Chart adapter — transforms IndicatorResult → ApexCharts-compatible series.
// Provider-neutral boundary. Knows about chart types, not about providers.
// No React, no INDstocks, no Upstox, no broker code.

import type { IndicatorResult, IndicatorPoint } from "./types";

// ────────────────────── ApexCharts-compatible types ────────────────

export interface ApexSeriesEntry {
  readonly name: string;
  readonly data: readonly ApexDataPoint[];
  readonly type?: "line" | "bar" | "area";
}

export interface ApexDataPoint {
  readonly x: number; // epoch ms
  readonly y: number | null;
}

export type ChartPlacement = "overlay" | "oscillator";

export interface IndicatorSeriesConfig {
  readonly indicatorId: string;
  readonly placement: ChartPlacement;
  readonly series: readonly ApexSeriesEntry[];
}

// ────────────────────── Indicator color palette ────────────────────

const INDICATOR_COLORS: Record<string, string> = {
  sma: "#f59e0b",    // amber
  ema: "#3b82f6",    // blue
  vwap: "#a855f7",   // purple
  upper: "#6b7280",  // gray (bollinger)
  middle: "#f59e0b", // amber (bollinger)
  lower: "#6b7280",  // gray (bollinger)
  rsi: "#8b5cf6",    // violet
  macd: "#3b82f6",   // blue
  signal: "#ef4444", // red
  histogram: "#6b7280", // gray
};

export function getIndicatorColor(outputKey: string): string {
  return INDICATOR_COLORS[outputKey] ?? "#888";
}

/**
 * Get ordered colors for overlay series (for ApexCharts colors array).
 * Returns one color per overlay series, matching their order.
 */
export function getOverlaySeriesColors(series: readonly ApexSeriesEntry[]): string[] {
  return series.map((s) => {
    // Extract output key from series name (e.g. "SMA Sma" → "sma", "BB Upper" → "upper")
    const parts = s.name.split(" ");
    const key = parts[parts.length - 1]?.toLowerCase() ?? "";
    return getIndicatorColor(key);
  });
}

// ────────────────────── Placement rules ────────────────────────────

const OVERLAY_INDICATORS = new Set(["SMA", "EMA", "VWAP", "BOLLINGER"]);
const OSCILLATOR_INDICATORS = new Set(["RSI", "MACD"]);

export function getChartPlacement(indicatorId: string): ChartPlacement {
  if (OSCILLATOR_INDICATORS.has(indicatorId)) return "oscillator";
  return "overlay";
}

// ────────────────────── Adapter ────────────────────────────────────

/**
 * Transform an IndicatorResult into ApexCharts-compatible series.
 * Returns the series grouped by chart placement (overlay vs oscillator).
 * Null values are preserved — ApexCharts handles them as gaps.
 */
export function indicatorToChartSeries(result: IndicatorResult): IndicatorSeriesConfig {
  const placement = getChartPlacement(result.id);
  const series: ApexSeriesEntry[] = [];

  // Get all output keys from the first non-null point
  const outputKeys = new Set<string>();
  for (const point of result.points) {
    for (const key of Object.keys(point.values)) {
      outputKeys.add(key);
    }
  }

  for (const key of outputKeys) {
    const data: ApexDataPoint[] = result.points.map((point) => ({
      x: point.time,
      y: point.values[key] ?? null,
    }));

    const outputDef = result.id === "MACD" && key === "histogram"
      ? { type: "bar" as const }
      : {};

    series.push({
      name: formatSeriesName(result.id, key),
      data,
      ...outputDef,
    });
  }

  return {
    indicatorId: result.id,
    placement,
    series,
  };
}

/**
 * Transform multiple IndicatorResults into grouped chart configs.
 * Returns overlay series (for price chart) and oscillator configs (for separate panels).
 */
export function indicatorsToChartSeries(
  results: readonly IndicatorResult[],
): {
  overlaySeries: readonly ApexSeriesEntry[];
  oscillators: readonly IndicatorSeriesConfig[];
} {
  const overlaySeries: ApexSeriesEntry[] = [];
  const oscillators: IndicatorSeriesConfig[] = [];

  for (const result of results) {
    const config = indicatorToChartSeries(result);
    if (config.placement === "overlay") {
      overlaySeries.push(...config.series);
    } else {
      oscillators.push(config);
    }
  }

  return { overlaySeries, oscillators };
}

// ────────────────────── Formatting ─────────────────────────────────

function formatSeriesName(indicatorId: string, outputKey: string): string {
  // MACD histogram → "MACD Histogram"
  // Bollinger upper → "BB Upper"
  if (indicatorId === "BOLLINGER") {
    return `BB ${capitalize(outputKey)}`;
  }
  if (indicatorId === "MACD") {
    if (outputKey === "histogram") return "MACD Histogram";
    return `MACD ${capitalize(outputKey)}`;
  }
  return `${indicatorId} ${capitalize(outputKey)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ────────────────────── Oscillator options ─────────────────────────

export interface OscillatorChartOptions {
  readonly title: string;
  readonly height: number;
  readonly yaxisMin?: number;
  readonly yaxisMax?: number;
  readonly referenceLines?: readonly { readonly y: number; readonly label: string; readonly color: string }[];
}

export function getOscillatorOptions(config: IndicatorSeriesConfig): OscillatorChartOptions {
  switch (config.indicatorId) {
    case "RSI":
      return {
        title: "RSI",
        height: 150,
        yaxisMin: 0,
        yaxisMax: 100,
        referenceLines: [
          { y: 30, label: "Oversold", color: "#22c55e" },
          { y: 50, label: "Midline", color: "#6b7280" },
          { y: 70, label: "Overbought", color: "#ef4444" },
        ],
      };
    case "MACD":
      return {
        title: "MACD",
        height: 150,
      };
    default:
      return {
        title: config.indicatorId,
        height: 150,
      };
  }
}

// ────────────────────── Parameter validation ───────────────────────

export function validateIndicatorParams(
  params: Record<string, number>,
  paramDefs: readonly { readonly key: string; readonly type: "int" | "float"; readonly min: number; readonly max: number }[],
): { readonly valid: boolean; readonly errors: readonly string[] } {
  const errors: string[] = [];

  for (const def of paramDefs) {
    const value = params[def.key];
    if (value === undefined || value === null || !Number.isFinite(value)) {
      errors.push(`${def.key}: required`);
      continue;
    }
    if (def.type === "int" && !Number.isInteger(value)) {
      errors.push(`${def.key}: must be integer`);
    }
    if (value < def.min) {
      errors.push(`${def.key}: minimum is ${def.min}`);
    }
    if (value > def.max) {
      errors.push(`${def.key}: maximum is ${def.max}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
