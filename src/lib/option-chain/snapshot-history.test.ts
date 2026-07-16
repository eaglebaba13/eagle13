import { describe, it, expect, beforeEach } from "vitest";
import { SnapshotHistory, _resetSnapshotHistory, getSnapshotHistory } from "./snapshot-history";
import type { OptionChainSnapshot } from "./types";

function snap(i: number): OptionChainSnapshot {
  return {
    instrument: "NIFTY", spotPrice: 24_000 + i, timestamp: new Date(i * 1000).toISOString(),
    provider: "MOCK", expiry: "2025-01-16", availableExpiries: [], marketSession: "OPEN",
    dataQuality: "OK", strikes: [],
  };
}

describe("snapshot-history", () => {
  beforeEach(() => _resetSnapshotHistory(50));
  it("bounded ring buffer", () => {
    const h = new SnapshotHistory(50);
    for (let i = 0; i < 60; i++) h.push(snap(i));
    expect(h.size("NIFTY", "2025-01-16")).toBe(50);
    expect(h.latest("NIFTY", "2025-01-16")?.spotPrice).toBe(24_059);
  });
  it("keys by underlying+expiry", () => {
    const h = new SnapshotHistory(100);
    h.push({ ...snap(1), instrument: "NIFTY" });
    h.push({ ...snap(2), instrument: "BANKNIFTY" });
    expect(h.size("NIFTY", "2025-01-16")).toBe(1);
    expect(h.size("BANKNIFTY", "2025-01-16")).toBe(1);
  });
  it("singleton resettable", () => {
    getSnapshotHistory().push(snap(1));
    expect(getSnapshotHistory().size("NIFTY", "2025-01-16")).toBe(1);
    _resetSnapshotHistory(50);
    expect(getSnapshotHistory().size("NIFTY", "2025-01-16")).toBe(0);
  });
});