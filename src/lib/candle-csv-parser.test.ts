import { describe, it, expect } from "vitest";
import { parseCandleCsv, parseTimestamp } from "./candle-csv-parser";

const genericCsv = `timestamp,open,high,low,close,volume
2026-06-29 09:15:00,24000,24010,23990,24005,1200
2026-06-29 09:20:00,24005,24020,24000,24015,1500
2026-06-29 09:25:00,24015,24025,24010,24020,900
`;

describe("Phase 21.2 Stage 5.1 · CSV parser", () => {
  it("parses generic OHLCV CSV in IST", () => {
    const r = parseCandleCsv({
      csv: genericCsv,
      provider: "Generic",
      instrument: "NIFTY50",
      timezone: "Asia/Kolkata",
      interval: "5m",
    });
    expect(r.rows.length).toBe(3);
    expect(r.rejected.length).toBe(0);
    expect(r.rows[0].timeIst).toContain("09:15:00+05:30");
  });

  it("parses TradingView-style ISO timestamps", () => {
    const tv = `time,open,high,low,close
2026-06-29T09:15:00+05:30,24000,24010,23990,24005
2026-06-29T09:20:00+05:30,24005,24020,24000,24015
`;
    const r = parseCandleCsv({
      csv: tv,
      provider: "TradingView",
      instrument: "NIFTY50",
      timezone: "Asia/Kolkata",
      interval: "5m",
    });
    expect(r.rows.length).toBe(2);
  });

  it("parses Zerodha-style DD-MM-YYYY", () => {
    const zr = `date,open,high,low,close,volume
29-06-2026 09:15:00,24000,24010,23990,24005,1200
29-06-2026 09:20:00,24005,24020,24000,24015,1500
`;
    const r = parseCandleCsv({
      csv: zr,
      provider: "Zerodha",
      instrument: "NIFTY50",
      timezone: "Asia/Kolkata",
      interval: "5m",
    });
    expect(r.rows.length).toBe(2);
  });

  it("rejects duplicate timestamps", () => {
    const dup = `time,open,high,low,close
2026-06-29 09:15:00,24000,24010,23990,24005
2026-06-29 09:15:00,24000,24010,23990,24005
`;
    const r = parseCandleCsv({
      csv: dup, provider: "Generic", instrument: "NIFTY50",
      timezone: "Asia/Kolkata", interval: "5m",
    });
    expect(r.rows.length).toBe(1);
    expect(r.rejected.some((x) => /Duplicate/.test(x.reason))).toBe(true);
  });

  it("rejects OHLC-inconsistent rows", () => {
    const bad = `time,open,high,low,close
2026-06-29 09:15:00,24000,23990,24010,24005
`;
    const r = parseCandleCsv({
      csv: bad, provider: "Generic", instrument: "NIFTY50",
      timezone: "Asia/Kolkata", interval: "5m",
    });
    expect(r.rows.length).toBe(0);
    expect(r.rejected[0].reason).toMatch(/OHLC/);
  });

  it("rejects future timestamps", () => {
    const fut = `time,open,high,low,close
2099-01-01 09:15:00,24000,24010,23990,24005
`;
    const r = parseCandleCsv({
      csv: fut, provider: "Generic", instrument: "NIFTY50",
      timezone: "Asia/Kolkata", interval: "5m",
    });
    expect(r.rejected[0].reason).toMatch(/Future/);
  });

  it("requires explicit timezone", () => {
    expect(() =>
      parseCandleCsv({
        csv: genericCsv,
        provider: "Generic",
        instrument: "NIFTY50",
        // @ts-expect-error intentionally wrong
        timezone: "auto",
        interval: "5m",
      }),
    ).toThrow();
  });

  it("rejects intervals other than 5m", () => {
    expect(() =>
      parseCandleCsv({
        csv: genericCsv,
        provider: "Generic",
        instrument: "NIFTY50",
        timezone: "Asia/Kolkata",
        // @ts-expect-error intentional
        interval: "1m",
      }),
    ).toThrow();
  });

  it("parses epoch seconds and millis", () => {
    expect(parseTimestamp("1719631500", "UTC")).toBe(1719631500 * 1000);
    expect(parseTimestamp("1719631500000", "UTC")).toBe(1719631500000);
  });
});