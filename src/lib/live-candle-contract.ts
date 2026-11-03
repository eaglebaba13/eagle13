import { z } from "zod";

export const LIVE_SYMBOLS = ["NIFTY50"] as const;
export const LIVE_INTERVALS = [60000, 180000, 300000, 900000, 3600000, 86400000] as const;
export const candleSchema = z
  .object({
    time: z.number().finite().positive(),
    open: z.number().finite().positive(),
    high: z.number().finite().positive(),
    low: z.number().finite().positive(),
    close: z.number().finite().positive(),
    volume: z.number().finite().nonnegative().nullable(),
  })
  .refine(
    (c) => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close),
    "Invalid OHLC",
  );
const envelope = {
  symbol: z.string(),
  intervalMs: z.number().finite().positive(),
  provider: z.string(),
  freshness: z.enum(["LIVE", "STALE", "NO_DATA", "UNAVAILABLE"]),
  quality: z.enum(["OK", "DEGRADED", "UNKNOWN"]),
  lastTick: z.string().datetime().nullable(),
  lastLtp: z.number().finite().positive().nullable(),
  connectionState: z.string(),
};
export const liveEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    ...envelope,
    completedCount: z.number(),
    currentCandle: candleSchema.nullable(),
    error: z.string().nullable(),
  }),
  z.object({
    type: z.literal("candle_update"),
    ...envelope,
    candle: candleSchema,
    completed: z.boolean(),
    timestamp: z.string().datetime(),
    tickCount: z.number().nullable(),
  }),
  z.object({
    type: z.literal("error"),
    symbol: z.string(),
    intervalMs: z.number(),
    message: z.string(),
  }),
]);
export type LiveCandleSseEvent = z.infer<typeof liveEventSchema>;
export type LiveCandleEvent = Extract<LiveCandleSseEvent, { type: "candle_update" }>;
export type LiveStatusEvent = Extract<LiveCandleSseEvent, { type: "status" }>;
export function parseLiveEvent(
  value: unknown,
  symbol: string,
  intervalMs: number,
): LiveCandleSseEvent | null {
  const result = liveEventSchema.safeParse(value);
  return result.success && result.data.symbol === symbol && result.data.intervalMs === intervalMs
    ? result.data
    : null;
}
export function tickFreshness(
  timestamp: string | null,
  now = Date.now(),
): "LIVE" | "STALE" | "NO_DATA" {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return "NO_DATA";
  return now - Date.parse(timestamp) >= 30000 ? "STALE" : "LIVE";
}
export function validSelection(symbol: string, interval: number): boolean {
  return LIVE_SYMBOLS.some((s) => s === symbol) && LIVE_INTERVALS.some((i) => i === interval);
}
