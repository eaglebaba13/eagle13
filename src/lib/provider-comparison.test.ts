import { describe, it, expect } from "vitest";
import { compareProviders } from "./provider-comparison";
import type { ParsedCandle } from "./candle-csv-parser";

const IST_OFFSET = 5.5 * 60 * 60 * 1000;
function mk(date: string, m: number, close: number): ParsedCandle {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 0, 0, 0)
    - IST_OFFSET + m * 60 * 1000;
  return { timeIst: "", openTimeMs: t, open: close, high: close + 1, low: close - 1, close, volume: 1 };
}
function session(date: string, base: number, offset = 0): ParsedCandle[] {
  const out: ParsedCandle[] = [];
  for (let m = 9 * 60 + 15; m < 15 * 60 + 30; m += 5) out.push(mk(date, m, base + offset));
  return out;
}

describe("Phase 21.2 Stage 5.1 · provider comparison", () => {
  it("classifies MATCH on identical datasets", () => {
    const a = session("2026-06-29", 24000);
    const b = session("2026-06-29", 24000);
    const r = compareProviders(a, b);
    expect(r.overall).toBe("MATCH");
  });
  it("classifies MINOR on small OHLC drift", () => {
    const a = session("2026-06-29", 24000);
    const b = session("2026-06-29", 24000, 1);
    const r = compareProviders(a, b);
    expect(r.overall).toBe("MINOR_DIFFERENCE");
  });
  it("classifies MATERIAL on large drift", () => {
    const a = session("2026-06-29", 24000);
    const b = session("2026-06-29", 24000, 20);
    const r = compareProviders(a, b);
    expect(r.overall).toBe("MATERIAL_DIFFERENCE");
  });
});