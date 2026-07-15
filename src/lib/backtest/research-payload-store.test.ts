import { describe, it, expect, beforeEach } from "vitest";
import {
  publishResearchPayload,
  getResearchPayload,
  clearResearchPayload,
  subscribeResearchPayload,
  __resetResearchPayloadStoreForTests,
  RESEARCH_PAYLOAD_STORE_MARKER,
  type PublishedResearchPayload,
} from "./research-payload-store";

function mk(over: Partial<PublishedResearchPayload> = {}): PublishedResearchPayload {
  const candles = Object.freeze([{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 0 }]);
  return {
    strategy: "SMC_V1",
    formulaVersion: "SMC_V1",
    publishedAt: "2025-01-01T00:00:00.000Z",
    instrument: "NIFTY50",
    timeframe: "5m",
    provider: "csv",
    timezone: "Asia/Kolkata",
    requestedRange: { from: "2025-01-01", to: "2025-01-02" },
    actualRange: { from: "2025-01-01", to: "2025-01-02" },
    candles,
    dataHash: "deadbeef",
    dataQuality: { status: "OK", coveragePct: 99, missingBars: 0, reasons: [] },
    baseRunId: "SMC_V1:0",
    costs: { slippagePct: 0, brokerageFlat: 0, brokeragePct: 0, taxesPct: 0 },
    source: "csv#deadbeef#5m",
    ...over,
  } as PublishedResearchPayload;
}

describe("research-payload-store", () => {
  beforeEach(() => __resetResearchPayloadStoreForTests());

  it("exports version marker", () => {
    expect(RESEARCH_PAYLOAD_STORE_MARKER).toBe("RESEARCH_PAYLOAD_STORE_V1");
  });

  it("publish / get / clear", () => {
    expect(getResearchPayload()).toBeNull();
    publishResearchPayload(mk());
    expect(getResearchPayload()?.dataHash).toBe("deadbeef");
    clearResearchPayload();
    expect(getResearchPayload()).toBeNull();
  });

  it("freezes the payload", () => {
    publishResearchPayload(mk());
    const p = getResearchPayload()!;
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.candles)).toBe(true);
  });

  it("notifies subscribers on identity change only", () => {
    let n = 0;
    const off = subscribeResearchPayload(() => n++);
    publishResearchPayload(mk({ dataHash: "aa" }));
    publishResearchPayload(mk({ dataHash: "aa" })); // same key → no notify
    publishResearchPayload(mk({ dataHash: "bb" }));
    expect(n).toBe(2);
    off();
  });

  it("carries strategy and astroByDate", () => {
    publishResearchPayload(
      mk({
        strategy: "ASTRO_SMC_HYBRID_V1",
        formulaVersion: "ASTRO_SMC_HYBRID_V1",
        astroByDate: { "2025-01-01": { direction: "BUY", confidence: 70 } },
      }),
    );
    const p = getResearchPayload()!;
    expect(p.strategy).toBe("ASTRO_SMC_HYBRID_V1");
    expect(p.astroByDate?.["2025-01-01"].direction).toBe("BUY");
  });
});