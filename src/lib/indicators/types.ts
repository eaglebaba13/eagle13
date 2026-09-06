// Provider-neutral indicator foundation types.
// Strict TypeScript. No any. Immutable. Deterministic.

// ────────────────────── Canonical Input ────────────────────────────

/**
 * Canonical candle input for indicator calculations.
 * Provider-neutral — works with HistoricalCandle, LiveCandle, or any OHLCV source.
 * Timestamp is epoch milliseconds for deterministic bucketing.
 */
export interface IndicatorCandle {
  readonly time: number; // epoch ms
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number | null;
}

// ────────────────────── Indicator Contract ─────────────────────────

export type IndicatorId = string;

export interface IndicatorParamDef {
  readonly key: string;
  readonly label: string;
  readonly type: "int" | "float";
  readonly default: number;
  readonly min: number;
  readonly max: number;
}

export interface IndicatorOutputDef {
  readonly key: string;
  readonly label: string;
  readonly type: "line" | "area" | "histogram" | "multi";
}

export interface IndicatorDefinition {
  readonly id: IndicatorId;
  readonly name: string;
  readonly description: string;
  readonly params: readonly IndicatorParamDef[];
  readonly outputs: readonly IndicatorOutputDef[];
  readonly warmUpPeriod: (params: Record<string, number>) => number;
  readonly calculate: (
    candles: readonly IndicatorCandle[],
    params: Record<string, number>,
  ) => IndicatorResult;
}

// ────────────────────── Result Types ───────────────────────────────

export interface IndicatorPoint {
  readonly time: number; // epoch ms, matches candle time
  readonly values: Record<string, number | null>;
}

export interface IndicatorResult {
  readonly id: IndicatorId;
  readonly params: Record<string, number>;
  readonly points: readonly IndicatorPoint[];
  readonly warmUpComplete: boolean;
  readonly computedAt: number; // epoch ms
}

// ────────────────────── Specific Output Types ──────────────────────

export interface SmaOutput {
  readonly sma: number | null;
}

export interface EmaOutput {
  readonly ema: number | null;
}

export interface RsiOutput {
  readonly rsi: number | null;
}

export interface MacdOutput {
  readonly macd: number | null;
  readonly signal: number | null;
  readonly histogram: number | null;
}

export interface BollingerOutput {
  readonly upper: number | null;
  readonly middle: number | null;
  readonly lower: number | null;
}

export interface VwapOutput {
  readonly vwap: number | null;
}

// ────────────────────── Helpers ────────────────────────────────────

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}
