import { describe, it, expect } from "vitest";
import { snapshotToCsv, snapshotToJson, buildResearchBundle } from "./exports";
import { assessDataQuality } from "./data-quality";
import { makeStrike, type OptionChainSnapshot } from "./types";

const snap: OptionChainSnapshot = {
  instrument: "NIFTY", spotPrice: 24_000, timestamp: "2025-01-15T00:00:00Z",
  provider: "MOCK", expiry: "2025-01-16", availableExpiries: [], marketSession: "OPEN",
  dataQuality: "OK",
  strikes: [makeStrike(24_000, { oi: 10, ltp: 50 }, { oi: 20, ltp: 40 })],
};

describe("exports", () => {
  it("CSV has header and row", () => {
    const csv = snapshotToCsv(snap);
    expect(csv).toContain("strike,call_oi");
    expect(csv).toContain("24000,10");
  });
  it("JSON serializes cleanly", () => {
    const parsed = JSON.parse(snapshotToJson(snap));
    expect(parsed.instrument).toBe("NIFTY");
  });
  it("research bundle carries snapshot + quality", () => {
    const q = assessDataQuality(snap, { nowIso: "2025-01-15T00:00:30Z", minStrikes: 1 });
    const b = buildResearchBundle(snap, q);
    expect(b.version).toBe(1);
    expect(b.snapshot.instrument).toBe("NIFTY");
  });
});