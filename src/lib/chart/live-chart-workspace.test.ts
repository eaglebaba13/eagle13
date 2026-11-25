import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearWorkspaceDrawings,
  ensureContinuousCandles,
  formatIstTimestamp,
  getDrawingStorageKey,
  loadWorkspaceDrawings,
  persistWorkspaceDrawings,
  resolveReplayStartIndex,
} from "./live-chart-workspace";
import { filterIndicatorItems, type ChartIndicatorItem } from "@/components/chart/IndicatorsDropdown";
import type { ChartDrawing } from "./drawing-types";

describe("live-chart-workspace", () => {
  it("normalizes and stitches historical and current session candles continuously", () => {
    const day1Close = Date.UTC(2026, 10, 24, 9, 55, 0); // 15:25 IST
    const day2Open = Date.UTC(2026, 10, 25, 3, 45, 0);  // 09:15 IST
    const day2Next = Date.UTC(2026, 10, 25, 3, 50, 0);  // 09:20 IST

    const result = ensureContinuousCandles([
      { x: day2Next, y: [24110, 24120, 24100, 24115], volume: 500 },
      { x: day1Close, y: [24000, 24010, 23990, 24005], volume: 1000 },
      { x: day2Open, y: [24050, 24090, 24040, 24080], volume: 1200 },
      // Duplicate timestamp with higher high and later close
      { x: day2Open, y: [24050, 24105, 24040, 24095], volume: 1500 },
    ]);

    expect(result).toHaveLength(3);
    expect(result.map((c) => c.x)).toEqual([day1Close, day2Open, day2Next]);
    expect(result[1].y).toEqual([24050, 24105, 24040, 24095]);
    expect(result[1].volume).toBe(1500);
  });

  it("resolves Replay start point by session_start, HH:MM IST, timestamp, and index", () => {
    // 2026-11-24 15:20 IST, then 2026-11-25 09:15, 09:20, 09:25, 09:30 IST
    const candles = [
      { x: Date.UTC(2026, 10, 24, 9, 50, 0) }, // 0: prev day 15:20 IST
      { x: Date.UTC(2026, 10, 25, 3, 45, 0) }, // 1: today 09:15 IST
      { x: Date.UTC(2026, 10, 25, 3, 50, 0) }, // 2: today 09:20 IST
      { x: Date.UTC(2026, 10, 25, 3, 55, 0) }, // 3: today 09:25 IST
      { x: Date.UTC(2026, 10, 25, 4, 0, 0) },  // 4: today 09:30 IST
    ];

    expect(resolveReplayStartIndex(candles, { mode: "session_start" })).toBe(1);
    expect(resolveReplayStartIndex(candles, { mode: "time_string", hhmm: "09:25" })).toBe(3);
    expect(resolveReplayStartIndex(candles, { mode: "timestamp", timeMs: candles[2].x })).toBe(2);
    expect(resolveReplayStartIndex(candles, { mode: "index", index: 4 })).toBe(4);
    expect(resolveReplayStartIndex(candles, { mode: "index", index: 0 })).toBe(1);
    expect(formatIstTimestamp(candles[1].x)).toContain("IST");
  });

  describe("drawing persistence scoped by symbol and timeframe", () => {
    const store = new Map<string, string>();
    beforeEach(() => {
      store.clear();
      vi.stubGlobal("window", {});
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      });
    });

    it("persists, loads, falls back to legacy key, and clears drawings", () => {
      const drawing: ChartDrawing = {
        id: "d1",
        type: "horizontal",
        points: [{ time: 1700000000, price: 24100 }],
        color: "#E5B869",
        isComplete: true,
      };

      persistWorkspaceDrawings("NIFTY", 300_000, [drawing]);
      expect(store.has(getDrawingStorageKey("NIFTY", 300_000))).toBe(true);
      expect(loadWorkspaceDrawings("NIFTY", 300_000)).toHaveLength(1);
      expect(loadWorkspaceDrawings("NIFTY", 60_000)).toHaveLength(0);

      // Legacy fallback check
      store.set(getDrawingStorageKey("BANKNIFTY"), JSON.stringify([drawing]));
      expect(loadWorkspaceDrawings("BANKNIFTY", 300_000)).toHaveLength(1);

      clearWorkspaceDrawings("NIFTY", 300_000);
      expect(loadWorkspaceDrawings("NIFTY", 300_000)).toHaveLength(0);
    });
  });

  it("filters IndicatorsDropdown items by label, description, and category", () => {
    const noop = () => {};
    const items: ChartIndicatorItem[] = [
      {
        id: "ict",
        label: "ICT Unicorn & FVG",
        description: "Fair value gaps",
        category: "structure",
        active: true,
        accentClass: "bg-amber-400",
        onToggle: noop,
      },
      {
        id: "astro",
        label: "Gann & Astro Levels",
        description: "Planetary degree R1/S1",
        category: "astro",
        active: false,
        accentClass: "bg-purple-400",
        onToggle: noop,
      },
    ];

    expect(filterIndicatorItems(items, "")).toHaveLength(2);
    expect(filterIndicatorItems(items, "unicorn").map((i) => i.id)).toEqual(["ict"]);
    expect(filterIndicatorItems(items, "planetary").map((i) => i.id)).toEqual(["astro"]);
    expect(filterIndicatorItems(items, "gann & astro").map((i) => i.id)).toEqual(["astro"]);
  });
});
