import { describe, it, expect } from "vitest";
import { checkTicks, isSnapshotActionable } from "./data-quality";
import { computeBreadth } from "./breadth-calc";

describe("data quality gates", () => {
  it("detects duplicate and unknown symbols", () => {
    const r = checkTicks(["A", "B"], [
      { symbol: "A", direction: "ADVANCE", changePercent: 1 },
      { symbol: "A", direction: "ADVANCE", changePercent: 1 },
      { symbol: "C", direction: "ADVANCE", changePercent: 1 },
    ]);
    expect(r.issues.some((i) => i.code === "DUPLICATE_SYMBOL")).toBe(true);
    expect(r.issues.some((i) => i.code === "UNKNOWN_SYMBOL")).toBe(true);
    expect(r.issues.some((i) => i.code === "MISSING_CONSTITUENTS")).toBe(true);
  });

  it("hard-fails when zero coverage", () => {
    const r = checkTicks(["A", "B"], []);
    expect(r.hardFail).toBe(true);
  });

  it("rejects future timestamps", () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    const r = checkTicks(["A"], [{ symbol: "A", direction: "ADVANCE", changePercent: 1 }], Date.now(), future);
    expect(r.issues.some((i) => i.code === "FUTURE_TIMESTAMP")).toBe(true);
  });

  it("isSnapshotActionable rejects FAILED", () => {
    const failed = computeBreadth({
      universe: "BROAD_NSE", provider: "M", timestamp: new Date().toISOString(),
      expectedSymbols: ["A"], ticks: [{ symbol: "A", direction: "UNAVAILABLE", changePercent: null }],
      freshnessMs: 1000, snapshotId: "x",
    });
    expect(isSnapshotActionable(failed)).toBe(false);
  });
});
