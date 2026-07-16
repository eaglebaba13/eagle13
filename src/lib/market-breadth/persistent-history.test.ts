import { describe, it, expect, beforeEach } from "vitest";
import {
  PersistentMarketBreadthHistory,
  inMemoryStorage,
  MARKET_BREADTH_HISTORY_SCHEMA_VERSION,
  readingToPersisted,
  type PersistedGtiPoint,
} from "./persistent-history";
import type { GtiResearchReading } from "./types";

function makeReading(runId: string, ts: string): GtiResearchReading {
  return {
    timestamp: ts,
    runId,
    state: "NEUTRAL_RESEARCH",
    confidence: 50,
    confidenceBreakdown: { base: 50, coveragePenalty: 0, freshnessPenalty: 0, conflictPenalty: 0, agreementBonus: 0, pcrBonus: 0, vixConsistencyBonus: 0, total: 50, formulaVersion: "v" },
    conflicts: [],
    breadth: { broad: null, nifty50: null, topWeighted: null, sectors: [] },
    vix: { currentVix: null, previousVix: null, regime: "UNKNOWN", previousRegime: "UNKNOWN", regimeChanged: false, rising: false, freshness: "UNKNOWN", provider: "M", timestamp: ts },
    pcr: { available: false, combinedScore: null, confirmedState: "UNAVAILABLE", slope: null, slopeChange: null, freshness: "UNKNOWN", dataQuality: "UNAVAILABLE", provider: "M", timestamp: null },
    warnings: [],
    formulaVersion: "f",
    disclaimer: "RESEARCH ONLY — NOT INVESTMENT ADVICE",
  };
}

let store: ReturnType<typeof inMemoryStorage>;
beforeEach(() => { store = inMemoryStorage(); });

describe("PersistentMarketBreadthHistory", () => {
  it("appends, dedupes, and restores on reload", () => {
    const h1 = new PersistentMarketBreadthHistory({ storage: store });
    const p: PersistedGtiPoint = readingToPersisted(makeReading("r1", "2026-07-16T00:00:00Z"));
    h1.append(p);
    h1.append(p); // dedupe
    expect(h1.load().length).toBe(1);
    const h2 = new PersistentMarketBreadthHistory({ storage: store });
    expect(h2.load()[0].runId).toBe("r1");
  });

  it("respects capacity", () => {
    const h = new PersistentMarketBreadthHistory({ storage: store, max: 10 });
    for (let i = 0; i < 20; i++) {
      h.append(readingToPersisted(makeReading(`r${i}`, `2026-07-16T00:00:${String(i).padStart(2, "0")}Z`)));
    }
    expect(h.load().length).toBe(10);
  });

  it("falls back gracefully on corrupted storage", () => {
    store.setItem("eb.market-breadth.history.v1", "{{ not json");
    const h = new PersistentMarketBreadthHistory({ storage: store });
    expect(h.load()).toEqual([]);
  });

  it("rejects wrong schema version", () => {
    store.setItem("eb.market-breadth.history.v1", JSON.stringify({ schema: MARKET_BREADTH_HISTORY_SCHEMA_VERSION + 999, points: [] }));
    const h = new PersistentMarketBreadthHistory({ storage: store });
    expect(h.load()).toEqual([]);
  });

  it("clear removes the slot", () => {
    const h = new PersistentMarketBreadthHistory({ storage: store });
    h.append(readingToPersisted(makeReading("r1", "2026-07-16T00:00:00Z")));
    h.clear();
    expect(h.load()).toEqual([]);
  });
});
