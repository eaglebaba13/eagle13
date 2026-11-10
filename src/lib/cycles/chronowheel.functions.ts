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
} from "./cycle-performance.server";
import type {
  HistoricalLunarWindow,
  LunarPhaseDetails,
  LunarCycleScanResponse,
} from "./lunar-cycle-engine.server";

export type {
  ChronoWheelScanFilter,
  ChronoWheelScanResult,
  StockCyclePerformance,
  YearWindowPerformance,
  ConfluenceBias,
  FOInstrument,
  HistoricalLunarWindow,
  LunarPhaseDetails,
  LunarCycleScanResponse,
};

function validateScanInput(input: unknown): ChronoWheelScanFilter {
  const i = (input ?? {}) as Partial<ChronoWheelScanFilter>;

  // Default to today and +3 days if not specified
  const now = new Date();
  const defaultStart = now.toISOString().slice(0, 10);
  const futureDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const defaultEnd = futureDate.toISOString().slice(0, 10);

  const startDate = typeof i.startDate === "string" && i.startDate.length === 10 ? i.startDate : defaultStart;
  const endDate = typeof i.endDate === "string" && i.endDate.length === 10 ? i.endDate : defaultEnd;

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
    return executeChronoWheelScan(data);
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
