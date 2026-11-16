/**
 * Interactive Chart Drawing Types & Persistence Models
 * Powers left-toolbar drawings synchronized with Lightweight Charts canvas
 */

export type DrawingToolType =
  | "cursor"
  | "trendline"
  | "horizontal"
  | "fibonacci"
  | "rectangle"
  | "riskRewardLong"
  | "riskRewardShort"
  | "ruler";

export interface DrawingPoint {
  readonly time: number; // UNIX timestamp in seconds
  readonly price: number;
  readonly logical?: number;
  readonly anchorTime?: number;
  readonly logicalOffset?: number;
  readonly intervalMs?: number;
}

const seconds = (time: number) => time > 1e11 ? time / 1000 : time;

export function pointAtLogical(logical: number, price: number, bars: readonly { time: number }[], intervalMs: number): DrawingPoint | null {
  if (!bars.length || !Number.isFinite(logical) || !Number.isFinite(price)) return null;
  const index = Math.max(0, Math.min(bars.length - 1, Math.round(logical)));
  const anchorTime = seconds(bars[index].time);
  const offset = logical - index;
  return { logical, price, time: anchorTime + offset * intervalMs / 1000,
    anchorTime, logicalOffset: offset, intervalMs };
}

/** Rebase saved logical coordinates when history shifts; legacy time-only drawings still load. */
export function drawingLogical(point: DrawingPoint, bars: readonly { time: number }[], intervalMs: number): number | null {
  if (!bars.length) return point.logical ?? null;
  if (point.anchorTime != null && point.intervalMs === intervalMs) {
    const anchor = bars.findIndex((c) => seconds(c.time) === point.anchorTime);
    if (anchor >= 0) return anchor + (point.logicalOffset ?? 0);
  }
  const time = seconds(point.time);
  const after = bars.findIndex((c) => seconds(c.time) >= time);
  if (after === 0) return (time - seconds(bars[0].time)) / (intervalMs / 1000);
  if (after < 0) return bars.length - 1 + (time - seconds(bars.at(-1)!.time)) / (intervalMs / 1000);
  const previous = seconds(bars[after - 1].time);
  return after - 1 + (time - previous) / (seconds(bars[after].time) - previous);
}

export interface ChartDrawing {
  readonly id: string;
  readonly type: DrawingToolType;
  readonly points: readonly DrawingPoint[];
  readonly color: string;
  readonly isComplete: boolean;
  readonly label?: string;
  readonly meta?: {
    readonly entryPrice?: number;
    readonly slPrice?: number;
    readonly tpPrice?: number;
    readonly riskRewardRatio?: number;
    readonly priceDiff?: number;
    readonly percentDiff?: number;
    readonly barCount?: number;
  };
}

export function createChartDrawing(type: DrawingToolType, first: DrawingPoint, second: DrawingPoint, id: string): ChartDrawing {
  let points = type === "horizontal" ? [first] : [first, second];
  if (type === "riskRewardLong" || type === "riskRewardShort") {
    const direction = type === "riskRewardLong" ? 1 : -1;
    const risk = Math.abs(second.price - first.price);
    points = [first, { ...second, price: first.price - direction * risk },
      { ...second, price: first.price + direction * risk * 2 }];
  }
  return { id, type, points, isComplete: true,
    color: type === "riskRewardLong" ? "#10B981" : type === "riskRewardShort" ? "#EF4444" : "#E5B869",
    meta: { priceDiff: second.price - first.price, percentDiff: first.price ? (second.price - first.price) / first.price * 100 : 0,
      barCount: Math.abs(Math.round((second.logical ?? 0) - (first.logical ?? 0))) } };
}

export const FIBONACCI_LEVELS = [
  { ratio: 0.0, label: "0.0% (Base)", color: "#9CA3AF" },
  { ratio: 0.236, label: "23.6%", color: "#EF4444" },
  { ratio: 0.382, label: "38.2%", color: "#F59E0B" },
  { ratio: 0.5, label: "50.0% (Equilibrium)", color: "#10B981" },
  { ratio: 0.618, label: "61.8% (Golden Pocket)", color: "#06B6D4" },
  { ratio: 0.786, label: "78.6%", color: "#8B5CF6" },
  { ratio: 1.0, label: "100.0% (High/Low)", color: "#E5B869" },
] as const;

const DRAWINGS_STORAGE_KEY_PREFIX = "eaglebaba_chart_drawings_";

export function loadSavedDrawings(symbol: string): ChartDrawing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${DRAWINGS_STORAGE_KEY_PREFIX}${symbol.toUpperCase()}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistDrawings(symbol: string, drawings: readonly ChartDrawing[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${DRAWINGS_STORAGE_KEY_PREFIX}${symbol.toUpperCase()}`,
      JSON.stringify(drawings.filter((d) => d.isComplete)),
    );
  } catch {
    // ignore quota error
  }
}

export function clearSavedDrawings(symbol: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${DRAWINGS_STORAGE_KEY_PREFIX}${symbol.toUpperCase()}`);
  } catch {
    // ignore
  }
}
