import { describe, it, expect } from "vitest";
import {
  PersistentPcrHistory,
  inMemoryStorage,
  readingToPersisted,
  PERSISTENT_HISTORY_SCHEMA_VERSION,
  DEFAULT_PERSISTENT_HISTORY_KEY,
  type PersistedPcrPoint,
} from "./persistent-history";
import type { CombinedPcrReading } from "./types";

function makePoint(i: number): PersistedPcrPoint {
  return {
    runId: `run-${i}`,
    timestamp: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    atmMode: "ATM_10",
    combinedScore: i,
    emaFast: i,
    emaSlow: i,
    slope: 0,
    signalState: "NO_TRADE",
    confirmedState: "NO_TRADE",
    niftyScore: i,
    banknityScore: i,
    expiryNifty: "2025-01-16",
    expiryBankNifty: "2025-01-16",
    provider: "MOCK",
    dataQuality: "OK",
    snapshotIds: [`NIFTY:2025-01-16:${i}`],
    warnings: [],
  };
}

describe("PersistentPcrHistory", () => {
  it("appends, dedupes, and enforces retention", () => {
    const h = new PersistentPcrHistory({ storage: inMemoryStorage(), max: 10 });
    for (let i = 0; i < 15; i++) h.append(makePoint(i));
    // dedupe: same runId+timestamp does not grow the buffer
    h.append(makePoint(14));
    const loaded = h.load();
    expect(loaded.length).toBe(10);
    expect(loaded[0].runId).toBe("run-5");
    expect(loaded[loaded.length - 1].runId).toBe("run-14");
  });

  it("restores after reload via the same storage adapter", () => {
    const storage = inMemoryStorage();
    const a = new PersistentPcrHistory({ storage, max: 50 });
    a.append(makePoint(1));
    a.append(makePoint(2));
    const b = new PersistentPcrHistory({ storage, max: 50 });
    expect(b.load().map((p) => p.runId)).toEqual(["run-1", "run-2"]);
  });

  it("falls back to empty when storage is corrupted", () => {
    const storage = inMemoryStorage();
    storage.setItem(DEFAULT_PERSISTENT_HISTORY_KEY, "not json{{{");
    const h = new PersistentPcrHistory({ storage });
    expect(h.load()).toEqual([]);
    // corrupted slot is cleared and new writes succeed
    h.append(makePoint(1));
    expect(h.load().length).toBe(1);
  });

  it("rejects wrong schema version", () => {
    const storage = inMemoryStorage();
    storage.setItem(DEFAULT_PERSISTENT_HISTORY_KEY, JSON.stringify({ schema: 99, points: [makePoint(1)] }));
    expect(new PersistentPcrHistory({ storage }).load()).toEqual([]);
  });

  it("writes the current schema version", () => {
    const storage = inMemoryStorage();
    new PersistentPcrHistory({ storage }).append(makePoint(1));
    const raw = storage.getItem(DEFAULT_PERSISTENT_HISTORY_KEY)!;
    expect(JSON.parse(raw).schema).toBe(PERSISTENT_HISTORY_SCHEMA_VERSION);
  });
});

describe("readingToPersisted", () => {
  it("captures scores, expiries, and data-quality flags", () => {
    const reading: CombinedPcrReading = {
      combinedScore: 12,
      direction: "PE",
      emaFast: 10, emaSlow: 5, slope: 5,
      previousSlope: 0, slopeChange: 5, zeroCross: false,
      signalState: "PE_FOCUS", confirmedState: "NO_TRADE", pendingState: "PE_FOCUS",
      confirmationCount: 1,
      instruments: [
        { underlying: "NIFTY", rawOiPcr: 1.1, rawChangeOiPcr: 1.2,
          normalizedOiPcr: 10, normalizedChangeOiPcr: 20,
          instrumentScore: 14, weight: 0.6, configuredWeight: 0.6,
          strikeCount: 20, atm: 24000, expiry: "2025-01-16",
          provider: "UPSTOX", timestamp: "2025-01-01T00:00:00Z",
          snapshotId: "NIFTY:2025-01-16:t1", missing: [] },
        { underlying: "BANKNIFTY", rawOiPcr: 1.0, rawChangeOiPcr: 1.0,
          normalizedOiPcr: 0, normalizedChangeOiPcr: 0,
          instrumentScore: 0, weight: 0.4, configuredWeight: 0.4,
          strikeCount: 20, atm: 51000, expiry: "2025-01-16",
          provider: "UPSTOX", timestamp: "2025-01-01T00:00:00Z",
          snapshotId: "BANKNIFTY:2025-01-16:t1", missing: ["call.oi:1"] },
      ],
      timestamp: "2025-01-01T00:00:00Z",
      warnings: [],
      runId: "pcr-1",
    };
    const p = readingToPersisted(reading, "ATM_10");
    expect(p.niftyScore).toBe(14);
    expect(p.banknityScore).toBe(0);
    expect(p.dataQuality).toBe("PARTIAL");
    expect(p.snapshotIds.length).toBe(2);
  });
});