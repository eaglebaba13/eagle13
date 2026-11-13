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
