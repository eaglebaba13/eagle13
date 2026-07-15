import { describe, it, expect } from "vitest";
import { computeDataQuality, groupBySessionDate } from "./candle-data-quality";
import type { ParsedCandle } from "./candle-csv-parser";

const IST_OFFSET = 5.5 * 60 * 60 * 1000;
function mk(dateIso: string, minute: number): ParsedCandle {
  // dateIso = YYYY-MM-DD IST; minute = minutes from midnight IST.
  const t = Date.UTC(
    +dateIso.slice(0, 4),
    +dateIso.slice(5, 7) - 1,
    +dateIso.slice(8, 10),
    0,
    0,
    0,
  ) - IST_OFFSET + minute * 60 * 1000;
  return {
    timeIst: new Date(t + IST_OFFSET).toISOString().replace("Z", "+05:30"),
    openTimeMs: t,
    open: 100, high: 101, low: 99, close: 100, volume: 1,
  };
}

function fullSession(date: string): ParsedCandle[] {
  const out: ParsedCandle[] = [];
  for (let m = 9 * 60 + 15; m < 15 * 60 + 30; m += 5) out.push(mk(date, m));
  return out;
}

describe("Phase 21.2 Stage 5.1 · data quality", () => {
  it("detects a complete session with 100% coverage", () => {
    const dq = computeDataQuality(fullSession("2026-06-29"));
    expect(dq.sessionsDetected).toBe(1);
    expect(dq.gaps.length).toBe(0);
    expect(dq.coveragePct).toBe(100);
  });

  it("detects missing candles", () => {
    const rows = fullSession("2026-06-29").slice(0, -3); // drop last three
    const dq = computeDataQuality(rows);
    expect(dq.gaps.length).toBe(1);
    expect(dq.gaps[0].missingCount).toBe(3);
    expect(dq.coveragePct).toBeLessThan(100);
  });

  it("counts out-of-window candles", () => {
    const rows = [
      ...fullSession("2026-06-29"),
      mk("2026-06-29", 8 * 60), // before open
      mk("2026-06-29", 16 * 60), // after close
    ];
    const dq = computeDataQuality(rows);
    expect(dq.outOfWindowCount).toBe(2);
  });

  it("groups by session date, skipping out-of-window rows", () => {
    const rows = [
      ...fullSession("2026-06-29"),
      ...fullSession("2026-06-30"),
      mk("2026-06-30", 8 * 60),
    ];
    const g = groupBySessionDate(rows);
    expect(g.size).toBe(2);
    expect(g.get("2026-06-29")!.length).toBe(75);
  });
});