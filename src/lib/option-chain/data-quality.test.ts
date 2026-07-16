import { describe, it, expect } from "vitest";
import { assessDataQuality } from "./data-quality";
import { makeStrike, type OptionChainSnapshot } from "./types";

function base(over: Partial<OptionChainSnapshot> = {}): OptionChainSnapshot {
  return {
    instrument: "NIFTY",
    spotPrice: 24_000,
    timestamp: "2025-01-15T00:00:00.000Z",
    provider: "MOCK",
    expiry: "2025-01-16",
    availableExpiries: [],
    marketSession: "OPEN",
    dataQuality: "OK",
    strikes: Array.from({ length: 7 }, (_, i) => makeStrike(23_800 + i * 100, { oi: 100 }, { oi: 100 })),
    ...over,
  };
}

const NOW = "2025-01-15T00:01:00.000Z";

describe("data-quality", () => {
  it("passes clean snapshot", () => {
    expect(assessDataQuality(base(), { nowIso: NOW }).ok).toBe(true);
  });
  it("flags duplicate strike", () => {
    const s = base({ strikes: [makeStrike(24_000, { oi: 1 }, { oi: 1 }), makeStrike(24_000, { oi: 1 }, { oi: 1 })] });
    const r = assessDataQuality(s, { nowIso: NOW });
    expect(r.issues.some((i) => i.code === "DUPLICATE_STRIKE")).toBe(true);
    expect(r.ok).toBe(false);
  });
  it("flags spot missing", () => {
    const r = assessDataQuality(base({ spotPrice: null }), { nowIso: NOW });
    expect(r.issues.some((i) => i.code === "SPOT_MISSING")).toBe(true);
  });
  it("flags <5 strikes", () => {
    const r = assessDataQuality(base({ strikes: [makeStrike(24_000)] }), { nowIso: NOW });
    expect(r.issues.some((i) => i.code === "INSUFFICIENT_STRIKES")).toBe(true);
  });
  it("flags future timestamp", () => {
    const r = assessDataQuality(base({ timestamp: "2099-01-01T00:00:00Z" }), { nowIso: NOW });
    expect(r.issues.some((i) => i.code === "FUTURE_TIMESTAMP")).toBe(true);
  });
  it("flags stale", () => {
    const r = assessDataQuality(base({ timestamp: "2025-01-15T00:00:00Z" }), { nowIso: "2025-01-15T00:30:00Z", staleMs: 60_000 });
    expect(r.issues.some((i) => i.code === "PROVIDER_STALE")).toBe(true);
  });
  it("flags negative OI as FAIL", () => {
    const s = base({ strikes: [makeStrike(24_000, { oi: -1 }, { oi: 1 }), ...base().strikes] });
    const r = assessDataQuality(s, { nowIso: NOW });
    expect(r.issues.some((i) => i.code === "NEGATIVE_OI")).toBe(true);
    expect(r.ok).toBe(false);
  });
  it("flags partial snapshot", () => {
    const s = base({ strikes: [makeStrike(24_000), ...base().strikes] });
    const r = assessDataQuality(s, { nowIso: NOW });
    expect(r.issues.some((i) => i.code === "PARTIAL_SNAPSHOT")).toBe(true);
  });
});