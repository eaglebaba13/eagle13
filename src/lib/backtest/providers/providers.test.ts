import { describe, it, expect } from "vitest";
import {
  getIntradayProvider,
  listIntradayProviders,
  csvIntradayProvider,
  yahooIntradayProvider,
} from "./index";
import { SmcDataRangeUnavailableError } from "../smc-data-source";

describe("Phase 21.4 Stage 4C · intraday providers", () => {
  it("registry exposes CSV, BROKER_CSV, YAHOO_INTRADAY", () => {
    expect(getIntradayProvider("CSV").id).toBe("CSV");
    expect(getIntradayProvider("BROKER_CSV").id).toBe("BROKER_CSV");
    expect(getIntradayProvider("YAHOO_INTRADAY").id).toBe("YAHOO_INTRADAY");
  });

  it("listIntradayProviders filters by instrument + timeframe", () => {
    const list = listIntradayProviders("NIFTY50", "5m");
    expect(list.map((a) => a.id).sort()).toEqual([
      "BROKER_CSV",
      "CSV",
      "YAHOO_INTRADAY",
    ]);
  });

  it("CSV provider rejects empty payload with DATA_RANGE_UNAVAILABLE", async () => {
    await expect(
      csvIntradayProvider.loadCandles({
        instrument: "NIFTY50",
        timeframe: "5m",
        from: "2024-06-04",
        to: "2024-06-04",
        timezone: "Asia/Kolkata",
        csv: "",
      }),
    ).rejects.toBeInstanceOf(SmcDataRangeUnavailableError);
  });

  it("Yahoo provider throws DATA_RANGE_UNAVAILABLE (no daily→intraday)", async () => {
    await expect(
      yahooIntradayProvider.loadCandles({
        instrument: "NIFTY50",
        timeframe: "5m",
        from: "2024-06-04",
        to: "2024-06-04",
        timezone: "Asia/Kolkata",
      }),
    ).rejects.toBeInstanceOf(SmcDataRangeUnavailableError);
  });

  it("Yahoo provider rejects out-of-range window (60d max) with DATA_RANGE_UNAVAILABLE", async () => {
    await expect(
      yahooIntradayProvider.loadCandles({
        instrument: "NIFTY50",
        timeframe: "5m",
        from: "2023-01-01",
        to: "2024-01-01",
        timezone: "Asia/Kolkata",
      }),
    ).rejects.toThrow(/DATA_RANGE_UNAVAILABLE/);
  });

  it("CSV provider builds source metadata after a successful load", async () => {
    const rows: string[] = ["datetime,open,high,low,close,volume"];
    let h = 9, m = 15;
    for (let i = 0; i < 75; i++) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      rows.push(`2024-06-04 ${hh}:${mm}:00,22000,22005,21995,22001,100`);
      m += 5;
      if (m >= 60) { m -= 60; h += 1; }
    }
    const req = {
      instrument: "NIFTY50" as const,
      timeframe: "5m" as const,
      from: "2024-06-04",
      to: "2024-06-04",
      timezone: "Asia/Kolkata" as const,
      csv: rows.join("\n"),
    };
    const r = await csvIntradayProvider.loadCandles(req);
    const meta = csvIntradayProvider.buildSourceMetadata(req, r);
    expect(meta.providerId).toBe("CSV");
    expect(meta.candleCount).toBe(r.candles.length);
    expect(meta.dataHash).toMatch(/^[0-9a-f]{8}$/);
  });
});