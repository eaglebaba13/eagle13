import { describe, expect, it } from "vitest";
import { makeStrike, type OptionChainSnapshot } from "../option-chain/types";
import {
  OI_WEIGHTS,
  computeOiRows,
  formatOi,
  oiMath,
  oiSession,
  oiTimeline,
  pcrRegime,
  type OiObservation,
} from "./oi-direction-scanner";

function observation(minute: number, call = 100, put = 200, spot = 25000): OiObservation {
  const timestamp = new Date(
    Date.parse("2026-11-17T09:15:00+05:30") + minute * 60_000,
  ).toISOString();
  const snapshot: OptionChainSnapshot = {
    instrument: "NIFTY",
    provider: "UPSTOX",
    expiry: "2026-11-19",
    availableExpiries: [],
    marketSession: "OPEN",
    dataQuality: "OK",
    timestamp,
    spotPrice: spot,
    strikes: Array.from({ length: 25 }, (_, i) =>
      makeStrike(
        24400 + i * 50,
        { oi: 1000 + call, changeOi: call, ltp: 100 + minute },
        { oi: 1000 + put, changeOi: put, ltp: 100 - minute / 2 },
      ),
    ),
  };
  return {
    snapshot,
    source: "CAPTURED",
    context: {
      open: 24950,
      high: 25050,
      low: 24900,
      previousClose: null,
      vwap: 24980,
      priorHigh: 25030,
      priorLow: 24920,
    },
  };
}
describe("OI direction arithmetic", () => {
  it("matches the requested Indian-number differential, acceleration and PCR exactly", () => {
    expect(oiMath(115514230, 101273575, -18679505)).toEqual({
      diff: -14240655,
      momentum: 4438850,
      pcr: 0.877,
    });
  });
  it.each([
    [0, 100],
    [-1, 100],
    [100, 0],
    [100, -1],
    [null, 100],
    [NaN, 100],
    [Infinity, 1],
  ])("nulls unsafe PCR inputs %s / %s", (call, put) => {
    expect(oiMath(call, put, null).pcr).toBeNull();
  });
  it("preserves null data and first-row baseline", () => {
    expect(oiMath(null, 100, 0)).toEqual({ diff: null, momentum: null, pcr: null });
    expect(oiMath(100, 200, null).momentum).toBeNull();
  });
  it("weights sum to exactly 100", () =>
    expect(Object.values(OI_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100));
  it("formats Indian full, lakh, crore, negative and missing values", () => {
    expect(formatOi(115514230, false)).toBe("11,55,14,230");
    expect(formatOi(4438850)).toBe("44.39 L");
    expect(formatOi(-14240655)).toBe("-1.42 Cr");
    expect(formatOi(null)).toBe("—");
  });
  it.each([
    [0.79, "Call Dominance"],
    [0.9, "Moderate Call"],
    [1, "Balanced"],
    [1.1, "Moderate Put"],
    [1.21, "Strong Put Dominance"],
  ])("labels PCR %s", (pcr, label) => expect(pcrRegime(pcr as number)).toBe(label));
});
describe("chronological session computation", () => {
  it("sorts first, aggregates 21 strikes and detects bullish shift in a negative differential", () => {
    const rows = computeOiRows([observation(1, 1000, 900), observation(0, 1000, 800)]);
    expect(rows[0].diff).toBe(-4200);
    expect(rows[1].diff).toBe(-2100);
    expect(rows[1].momentum).toBe(2100);
    expect(rows[1].direction).toBe("▲ BULLISH SHIFT");
    expect(rows[0].momentum).toBeNull();
  });
  it("takes the latest observation per interval and computes across the selected interval", () => {
    const rows = computeOiRows(
      Array.from({ length: 6 }, (_, i) => observation(i, 100, 200 + i * 10)),
      3,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].momentum).toBe(630);
  });
  it("breaks momentum after a gap and on expiry/session changes", () => {
    expect(computeOiRows([observation(0), observation(4)])[1].momentum).toBeNull();
    const b = observation(1);
    b.snapshot = { ...b.snapshot, expiry: "2026-11-26" };
    expect(computeOiRows([observation(0), b])[1].momentum).toBeNull();
    b.snapshot = { ...b.snapshot, timestamp: "2026-11-18T03:45:00.000Z" };
    expect(computeOiRows([observation(0), b])[1].momentum).toBeNull();
  });
  it("does not turn missing leg OI changes into zero", () => {
    const o = observation(0);
    o.snapshot = {
      ...o.snapshot,
      strikes: [makeStrike(25000, { oi: 100 }, { oi: 100, changeOi: 10 })],
    };
    const row = computeOiRows([o])[0];
    expect(row.callChange).toBeNull();
    expect(row.diff).toBeNull();
    expect(row.pcr).toBeNull();
    expect(row.view).toBe("NEUTRAL");
  });
  it("bounds scores and exposes missing VWAP coverage", () => {
    const a = observation(0),
      b = observation(1, 50, 300, 25010);
    b.context.vwap = null;
    const row = computeOiRows([a, b])[1];
    expect(row.score).toBeGreaterThanOrEqual(0);
    expect(row.score).toBeLessThanOrEqual(100);
    expect(row.pillars.find((p) => p.key === "vwap")?.points).toBeNull();
    expect(row.coverage).toBe(90);
  });
  it.each([
    [100, 300, 25010, "LONG BUILD-UP"],
    [50, 150, 25010, "SHORT COVERING"],
    [100, 300, 24990, "SHORT BUILD-UP"],
    [50, 150, 24990, "LONG UNWINDING"],
  ])("classifies quadrant %s %s %s", (ce, pe, spot, expected) =>
    expect(
      computeOiRows([observation(0), observation(1, ce as number, pe as number, spot as number)])[1]
        .buildup,
    ).toBe(expected),
  );
  it("produces explicit gaps from 09:15 without inventing observations", () => {
    const rows = computeOiRows([observation(2)]);
    const timeline = oiTimeline(rows, Date.parse("2026-11-17T09:18:00+05:30"), 1);
    expect(timeline).toHaveLength(4);
    expect(timeline[0].row).toBeNull();
    expect(timeline[2].row).toBe(rows[0]);
    expect(timeline[3].row).toBeNull();
  });
  it("uses IST date rollover and suppresses weekends/pre-open logs", () => {
    expect(oiSession("2026-11-17T20:00:00Z").date).toBe("2026-11-18");
    expect(oiTimeline([], Date.parse("2026-11-17T09:14:00+05:30"), 1)).toEqual([]);
    expect(oiTimeline([], Date.parse("2026-11-22T12:00:00+05:30"), 1)).toEqual([]);
  });
  it("is deterministic and does not mutate its inputs", () => {
    const values = [observation(1), observation(0)];
    const before = JSON.stringify(values);
    expect(computeOiRows(values)).toEqual(computeOiRows(values));
    expect(JSON.stringify(values)).toBe(before);
  });
});
