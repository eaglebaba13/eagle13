import { dateRangeError } from "@/lib/input-validation";
// Phase 36.4 — Server Functions & TanStack Query Options for ChronoWheel Quantitative Screener
// Read-only server function for Gann & Dynamic Lunar Cycle screening across 200+ F&O stocks.

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type {
  ChronoWheelScanFilter,
  ChronoWheelScanResult,
  StockCyclePerformance,
  YearWindowPerformance,
  ConfluenceBias,
  FOInstrument,
  TradeDirection,
  TradeHitOutcome,
  TradeExecutionPlan,
  ExecutionHitRateSummary,
} from "./cycle-performance.server";
import type {
  HistoricalLunarWindow,
  LunarPhaseDetails,
  LunarCycleScanResponse,
} from "./lunar-cycle-engine.server";
import type {
  ChronoWheelAIRequest,
  ChronoWheelAIResponse,
} from "./chronowheel-ai.server";

export type {
  ChronoWheelScanFilter,
  ChronoWheelScanResult,
  StockCyclePerformance,
  YearWindowPerformance,
  ConfluenceBias,
  FOInstrument,
  TradeDirection,
  TradeHitOutcome,
  TradeExecutionPlan,
  ExecutionHitRateSummary,
  HistoricalLunarWindow,
  LunarPhaseDetails,
  LunarCycleScanResponse,
  ChronoWheelAIRequest,
  ChronoWheelAIResponse,
};

export function validateScanInput(input: unknown): ChronoWheelScanFilter {
  const i = (input ?? {}) as Partial<ChronoWheelScanFilter>;

  // Default to today and +3 days if not specified
  const now = new Date();
  const defaultStart = now.toISOString().slice(0, 10);
  const futureDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const defaultEnd = futureDate.toISOString().slice(0, 10);

  const startDate = i.startDate === undefined ? defaultStart : i.startDate;
  const endDate = i.endDate === undefined ? defaultEnd : i.endDate;
  const invalid = dateRangeError(startDate, endDate);
  if (invalid) throw new Error(invalid);

  let lookbackYears = typeof i.lookbackYears === "number" ? i.lookbackYears : 10;
  if (lookbackYears !== 3 && lookbackYears !== 5 && lookbackYears !== 10) {
    lookbackYears = 10;
  }

  const directionFilter = i.directionFilter ?? "ALL";
  const sectorFilter = i.sectorFilter ?? "ALL";
  const searchQuery = typeof i.searchQuery === "string" ? i.searchQuery : "";
  const minWinRate = typeof i.minWinRate === "number" ? i.minWinRate : undefined;

  return {
    startDate,
    endDate,
    lookbackYears,
    directionFilter,
    sectorFilter,
    searchQuery,
    minWinRate,
  };
}

export const getChronoWheelScan = createServerFn({ method: "POST" })
  .validator(validateScanInput)
  .handler(async ({ data }): Promise<ChronoWheelScanResult> => {
    // Dynamic import ensures .server file is strictly isolated to server runtime
    const { executeChronoWheelScan } = await import("./cycle-performance.server");
    return await executeChronoWheelScan(data);
  });

export const chronoWheelQuery = (filter: ChronoWheelScanFilter) =>
  queryOptions({
    queryKey: [
      "chronowheel-scan",
      filter.startDate,
      filter.endDate,
      filter.lookbackYears ?? 10,
      filter.directionFilter ?? "ALL",
      filter.sectorFilter ?? "ALL",
      filter.searchQuery ?? "",
    ],
    queryFn: () => getChronoWheelScan({ data: filter }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

function validateAIInput(input: unknown): ChronoWheelAIRequest {
  const i = (input ?? {}) as Partial<ChronoWheelAIRequest>;
  const query = typeof i.query === "string" && i.query.trim().length > 0 ? i.query.trim() : "Analyze this cycle setup";
  return {
    query,
    stockContext: i.stockContext,
    cycleContext: i.cycleContext,
    accountContext: i.accountContext,
  };
}

export const queryChronoWheelAIFn = createServerFn({ method: "POST" })
  .validator(validateAIInput)
  .handler(async ({ data }): Promise<ChronoWheelAIResponse> => {
    const { queryChronoWheelAI } = await import("./chronowheel-ai.server");
    return queryChronoWheelAI(data);
  });

export interface ChronoWheelBroadcastPayload {
  readonly symbol: string;
  readonly direction: string;
  readonly ltp: number;
  readonly foBanStatus: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly startPhase?: string;
  readonly endPhase?: string;
  readonly winRate: number;
  readonly avgReturn: number;
  readonly entryLow: number;
  readonly entryHigh: number;
  readonly sl: number;
  readonly tp1: number;
  readonly tp2: number;
  readonly tp3: number;
  readonly lotSize: number;
}

export const broadcastChronoWheelSetupToTelegram = createServerFn({ method: "POST" })
  .validator((input: unknown): ChronoWheelBroadcastPayload => {
    return input as ChronoWheelBroadcastPayload;
  })
  .handler(async ({ data }) => {
    const { postTelegramBroadcast } = await import("../smart-alerts/telegram-delivery.server");
    const phaseStr = data.startPhase ? ` (${data.startPhase} to ${data.endPhase ?? "Target"})` : "";
    const lines = [
      `🦅 *EAGLEBABA CHRONOWHEEL SIGNAL*`,
      `• *Symbol:* ${data.symbol} (${data.direction}) | LTP: ₹${Number(data.ltp || 0).toFixed(2)}`,
      `• *Ban/MWPL Status:* ${data.foBanStatus}`,
      `• *Synodic Window:* ${data.startDate} -> ${data.endDate}${phaseStr}`,
      `• *10-Yr Historical Consistency:* ${data.winRate}% (Avg Return: ${data.avgReturn}%)`,
      `• *Entry Zone:* ₹${Number(data.entryLow || 0).toFixed(2)} – ₹${Number(data.entryHigh || 0).toFixed(2)}`,
      `• *Hard SL:* ₹${Number(data.sl || 0).toFixed(2)} | TP1: ₹${Number(data.tp1 || 0).toFixed(2)} | TP2: ₹${Number(data.tp2 || 0).toFixed(2)} | TP3: ₹${Number(data.tp3 || 0).toFixed(2)} (Lot: ${data.lotSize})`,
    ];
    return await postTelegramBroadcast(lines.join("\n"), "Markdown");
  });
