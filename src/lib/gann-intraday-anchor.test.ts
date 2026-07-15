import { describe, it, expect } from "vitest";
import {
  computeSnapshotStatus,
  getTradingSessionAnchor,
  isWeekendIst,
  istDateString,
  parseIstDateAt0915,
  previousTradingDate,
} from "./gann-intraday-anchor";
import { asAbsolutePlanetDegree, asDegreeWithinSign } from "./gann-intraday.types";

describe("Stage 3 · session anchor", () => {
  it("09:15 IST → 03:45 UTC deterministic conversion (India has no DST)", () => {
    const a = getTradingSessionAnchor("2026-07-15", "NIFTY50");
    expect(a.anchorIst).toBe("2026-07-15T09:15:00+05:30");
    expect(a.anchorUtc).toBe("2026-07-15T03:45:00.000Z");
    // Same for a winter date — DST-independent.
    const w = getTradingSessionAnchor("2026-01-15", "BANKNIFTY");
    expect(w.anchorUtc).toBe("2026-01-15T03:45:00.000Z");
  });

  it("rejects unsupported instruments", () => {
    // @ts-expect-error runtime guard
    expect(() => getTradingSessionAnchor("2026-07-15", "GOLD")).toThrow();
  });

  it("rejects malformed trading dates", () => {
    expect(() => parseIstDateAt0915("07/15/2026")).toThrow();
  });

  it("weekend detection", () => {
    expect(isWeekendIst("2026-07-18")).toBe(true); // Saturday
    expect(isWeekendIst("2026-07-19")).toBe(true); // Sunday
    expect(isWeekendIst("2026-07-15")).toBe(false); // Wednesday
  });

  it("previousTradingDate skips weekends", () => {
    // Monday → previous Friday
    expect(previousTradingDate("2026-07-20")).toBe("2026-07-17");
    // Wed → Tue
    expect(previousTradingDate("2026-07-15")).toBe("2026-07-14");
  });
});

describe("Stage 3 · snapshot status", () => {
  const wed = "2026-07-15";
  const before = new Date("2026-07-15T03:44:59.000Z"); // 09:14:59 IST
  const at = new Date("2026-07-15T03:45:00.000Z"); // 09:15:00 IST
  const later = new Date("2026-07-15T10:00:00.000Z");

  it("PREVIEW before 09:15 IST on the trading day", () => {
    expect(computeSnapshotStatus(wed, before)).toBe("PREVIEW");
  });
  it("LOCKED at/after 09:15 IST", () => {
    expect(computeSnapshotStatus(wed, at)).toBe("LOCKED");
    expect(computeSnapshotStatus(wed, later)).toBe("LOCKED");
  });
  it("HISTORICAL_LOCKED for prior trading days", () => {
    expect(computeSnapshotStatus("2026-07-14", later)).toBe("HISTORICAL_LOCKED");
  });
  it("PREVIEW for future trading days", () => {
    expect(computeSnapshotStatus("2026-07-16", later)).toBe("PREVIEW");
  });
  it("NO_TRADING_SESSION on weekends", () => {
    expect(computeSnapshotStatus("2026-07-18", later)).toBe("NO_TRADING_SESSION");
  });
});

describe("Stage 3 · field brand separation", () => {
  it("absolute domain accepts [0,360)", () => {
    expect(asAbsolutePlanetDegree("Sun", 0)).toBe(0);
    expect(asAbsolutePlanetDegree("Sun", 359.9)).toBe(359.9);
  });
  it("sign-degree domain rejects >=30", () => {
    expect(() => asDegreeWithinSign("Sun", 30)).toThrow();
    expect(() => asDegreeWithinSign("Sun", 45)).toThrow();
  });
  it("absolute domain rejects sign-degree-like negative", () => {
    expect(() => asAbsolutePlanetDegree("Sun", -0.5)).toThrow();
  });
  it("istDateString handles IST rollover", () => {
    // 23:00 UTC → 04:30 IST next day
    expect(istDateString(new Date("2026-07-15T23:00:00.000Z"))).toBe("2026-07-16");
    expect(istDateString(new Date("2026-07-15T18:29:00.000Z"))).toBe("2026-07-15");
  });
});