import { describe, it, expect } from "vitest";
import {
  hashCandleSeries,
  loadSmcCandles,
  SmcDataRangeUnavailableError,
} from "./smc-data-source";

function makeCsv(rows: Array<[string, number, number, number, number, number?]>): string {
  const header = "datetime,open,high,low,close,volume";
  const body = rows.map((r) => r.join(","));
  return `${header}\n${body.join("\n")}`;
}

// Build a synthetic 2024-06-04 IST session, 5m candles.
function genSession(date: string, opens: number[]): Array<[string, number, number, number, number, number]> {
  const rows: Array<[string, number, number, number, number, number]> = [];
  let h = 9, m = 15;
  for (const o of opens) {
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    rows.push([`${date} ${hh}:${mm}:00`, o, o + 5, o - 5, o + 1, 100]);
    m += 5;
    if (m >= 60) { m -= 60; h += 1; }
  }
  return rows;
}

describe("Phase 21.4 Stage 4A · smc-data-source", () => {
  it("hashCandleSeries is deterministic and reflects any field change", () => {
    const a = [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }];
    const b = [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }];
    const c = [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 11 }];
    expect(hashCandleSeries(a)).toBe(hashCandleSeries(b));
    expect(hashCandleSeries(a)).not.toBe(hashCandleSeries(c));
  });

  it("provider fetch always throws DATA_RANGE_UNAVAILABLE (no daily→intraday fallback)", async () => {
    await expect(
      loadSmcCandles({
        instrument: "NIFTY50",
        timeframe: "5m",
        from: "2024-06-04",
        to: "2024-06-04",
        timezone: "Asia/Kolkata",
        source: { kind: "provider", provider: "Yahoo" },
      }),
    ).rejects.toBeInstanceOf(SmcDataRangeUnavailableError);
  });

  it("loads a CSV inside the requested window and reports data quality", async () => {
    const rows = genSession("2024-06-04", Array.from({ length: 75 }, (_, i) => 22000 + i));
    const csv = makeCsv(rows);
    const r = await loadSmcCandles({
      instrument: "NIFTY50",
      timeframe: "5m",
      from: "2024-06-04",
      to: "2024-06-04",
      timezone: "Asia/Kolkata",
      source: { kind: "csv", csv, provider: "Zerodha" },
    });
    expect(r.candles.length).toBe(75);
    expect(r.actualFrom).toBe("2024-06-04");
    expect(r.actualTo).toBe("2024-06-04");
    expect(r.dataQuality.coveragePct).toBeGreaterThan(90);
    expect(r.dataHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("15m rebucket collapses 3× 5m rows into one candle (never fabricates intraday)", async () => {
    const rows = genSession("2024-06-04", Array.from({ length: 75 }, (_, i) => 22000 + i));
    const csv = makeCsv(rows);
    const r = await loadSmcCandles({
      instrument: "NIFTY50",
      timeframe: "15m",
      from: "2024-06-04",
      to: "2024-06-04",
      timezone: "Asia/Kolkata",
      source: { kind: "csv", csv, provider: "Zerodha" },
    });
    // 75 5m rows → 25 15m rows.
    expect(r.candles.length).toBe(25);
  });

  it("throws DATA_RANGE_UNAVAILABLE when CSV has zero rows inside window", async () => {
    const rows = genSession("2024-06-04", [22000, 22001, 22002]);
    const csv = makeCsv(rows);
    await expect(
      loadSmcCandles({
        instrument: "NIFTY50",
        timeframe: "5m",
        from: "2099-01-01",
        to: "2099-01-31",
        timezone: "Asia/Kolkata",
        source: { kind: "csv", csv, provider: "Zerodha" },
      }),
    ).rejects.toBeInstanceOf(SmcDataRangeUnavailableError);
  });
});