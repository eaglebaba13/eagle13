import { describe, it, expect } from "vitest";
import { selectPreviousCompletedDaily } from "./daily-candle";

const NOW = Date.parse("2026-07-22T04:00:00Z"); // Wed 09:30 IST

function c(over: Partial<Parameters<typeof selectPreviousCompletedDaily>[0]["candles"][number]>) {
  return {
    openTime: "2026-07-21T00:00:00Z",
    open: 100, high: 110, low: 95, close: 105,
    volume: 1000, complete: true,
    ...over,
  };
}

describe("selectPreviousCompletedDaily", () => {
  it("returns null when no completed candle exists", () => {
    const r = selectPreviousCompletedDaily({
      candles: [c({ complete: false })],
      providerTimezone: "Asia/Kolkata",
      session24x7: false,
      now: NOW,
    });
    expect(r).toBeNull();
  });

  it("skips incomplete candles and picks latest completed", () => {
    const r = selectPreviousCompletedDaily({
      candles: [
        c({ openTime: "2026-07-22T00:00:00Z", close: 999, complete: false }),
        c({ openTime: "2026-07-21T00:00:00Z", close: 500, complete: true }),
        c({ openTime: "2026-07-20T00:00:00Z", close: 400, complete: true }),
      ],
      providerTimezone: "Asia/Kolkata",
      session24x7: false,
      now: NOW,
    });
    expect(r?.close).toBe(500);
  });

  it("marks crypto candle STALE when older than 30h", () => {
    const r = selectPreviousCompletedDaily({
      candles: [c({ openTime: "2026-07-19T00:00:00Z" })],
      providerTimezone: "UTC",
      session24x7: true,
      now: NOW,
    });
    expect(r?.freshness).toBe("STALE");
  });

  it("marks index candle FRESH within 72h", () => {
    const r = selectPreviousCompletedDaily({
      candles: [c({ openTime: "2026-07-21T00:00:00Z" })],
      providerTimezone: "Asia/Kolkata",
      session24x7: false,
      now: NOW,
    });
    expect(r?.freshness).toBe("FRESH");
    expect(r?.reportingTimezone).toBe("Asia/Kolkata");
  });
});