import { describe, it, expect } from "vitest";
import { buildSessions } from "./candle-session-builder";
import type { ParsedCandle } from "./candle-csv-parser";

const IST_OFFSET = 5.5 * 60 * 60 * 1000;
function mk(date: string, minute: number, close: number): ParsedCandle {
  const t = Date.UTC(
    +date.slice(0, 4),
    +date.slice(5, 7) - 1,
    +date.slice(8, 10),
    0, 0, 0,
  ) - IST_OFFSET + minute * 60 * 1000;
  return {
    timeIst: new Date(t + IST_OFFSET).toISOString().replace("Z", "+05:30"),
    openTimeMs: t, open: close, high: close + 1, low: close - 1, close, volume: 1,
  };
}
function fullDay(date: string, base: number): ParsedCandle[] {
  const out: ParsedCandle[] = [];
  for (let m = 9 * 60 + 15; m < 15 * 60 + 30; m += 5) out.push(mk(date, m, base));
  return out;
}

describe("Phase 21.2 Stage 5.1 · session builder", () => {
  it("rejects the first session (no previous close)", () => {
    const rows = [...fullDay("2026-06-29", 24000), ...fullDay("2026-06-30", 24100)];
    const r = buildSessions({ provider: "Generic", instrument: "NIFTY50", rows });
    expect(r.sessions.length).toBe(2);
    expect(r.usable.length).toBe(1);
    expect(r.usable[0].tradingDate).toBe("2026-06-30");
    expect(r.usable[0].previousCloseDate).toBe("2026-06-29");
    expect(r.rejected[0].rejectionReason).toMatch(/previous/i);
  });

  it("carries the correct previous close per session", () => {
    const rows = [
      ...fullDay("2026-06-29", 24000),
      ...fullDay("2026-06-30", 24100),
      ...fullDay("2026-07-01", 24200),
    ];
    const r = buildSessions({ provider: "Generic", instrument: "NIFTY50", rows });
    const s = r.usable.find((x) => x.tradingDate === "2026-07-01")!;
    expect(s.previousCloseDate).toBe("2026-06-30");
    expect(s.previousClose).toBe(24100);
  });

  it("carries ingest + formula provenance", () => {
    const r = buildSessions({ provider: "Zerodha", instrument: "NIFTY50", rows: fullDay("2026-06-29", 24000) });
    expect(r.ingestVersion).toBe("GANN_ABSOLUTE_INTRADAY_INGEST_V1");
    expect(r.formulaVersion).toBe("GANN_ASTRO_INTRADAY_ABSOLUTE_V1");
  });
});