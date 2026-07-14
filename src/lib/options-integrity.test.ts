import { describe, it, expect } from "vitest";
import {
  classifyFreshness,
  evaluateOptionsTradability,
  atmCoverage,
  computeSpotDivergence,
  exportFilename,
  isExpiryValid,
  shouldAcceptAlert,
  safeRecommendationAction,
  FRESHNESS_THRESHOLDS,
  type TradabilityInputs,
  type AlertContext,
} from "./options-integrity";

function liveInputs(overrides: Partial<TradabilityInputs> = {}): TradabilityInputs {
  return {
    demo: false,
    sourceStatus: "LIVE",
    underlying: 24000,
    expiry: "2026-07-17",
    expiryValid: true,
    strikesBelowAtm: 10,
    strikesAboveAtm: 10,
    hasCallOi: true,
    hasPutOi: true,
    providerTimestampValid: true,
    marketOpen: true,
    ...overrides,
  };
}

describe("classifyFreshness", () => {
  it("bands by thresholds", () => {
    expect(classifyFreshness(0)).toBe("FRESH");
    expect(classifyFreshness(FRESHNESS_THRESHOLDS.freshMaxSec)).toBe("FRESH");
    expect(classifyFreshness(FRESHNESS_THRESHOLDS.freshMaxSec + 1)).toBe("DELAYED");
    expect(classifyFreshness(FRESHNESS_THRESHOLDS.delayedMaxSec + 1)).toBe("STALE");
  });
});

describe("evaluateOptionsTradability", () => {
  it("is tradable on a clean live snapshot", () => {
    const r = evaluateOptionsTradability(liveInputs());
    expect(r.isTradable).toBe(true);
    expect(r.blockingReasons).toEqual([]);
  });
  it("blocks on UNAVAILABLE", () => {
    const r = evaluateOptionsTradability(liveInputs({ sourceStatus: "UNAVAILABLE" }));
    expect(r.isTradable).toBe(false);
  });
  it("blocks on STALE", () => {
    expect(evaluateOptionsTradability(liveInputs({ sourceStatus: "STALE" })).isTradable).toBe(false);
  });
  it("blocks on PARTIAL", () => {
    expect(evaluateOptionsTradability(liveInputs({ sourceStatus: "PARTIAL" })).isTradable).toBe(false);
  });
  it("blocks on DEMO", () => {
    expect(evaluateOptionsTradability(liveInputs({ demo: true, sourceStatus: "DEMO" })).isTradable).toBe(false);
  });
  it("warns but stays tradable on DELAYED", () => {
    const r = evaluateOptionsTradability(liveInputs({ sourceStatus: "DELAYED" }));
    expect(r.isTradable).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("blocks on invalid underlying / expiry", () => {
    expect(evaluateOptionsTradability(liveInputs({ underlying: 0 })).isTradable).toBe(false);
    expect(evaluateOptionsTradability(liveInputs({ expiryValid: false })).isTradable).toBe(false);
  });
  it("blocks on missing ATM coverage", () => {
    expect(evaluateOptionsTradability(liveInputs({ strikesBelowAtm: 2 })).isTradable).toBe(false);
    expect(evaluateOptionsTradability(liveInputs({ strikesAboveAtm: 3 })).isTradable).toBe(false);
  });
  it("blocks on missing call or put OI", () => {
    expect(evaluateOptionsTradability(liveInputs({ hasCallOi: false })).isTradable).toBe(false);
    expect(evaluateOptionsTradability(liveInputs({ hasPutOi: false })).isTradable).toBe(false);
  });
  it("adds warning when market closed", () => {
    const r = evaluateOptionsTradability(liveInputs({ marketOpen: false }));
    expect(r.warnings.some((w) => /closed/i.test(w))).toBe(true);
  });
});

describe("atmCoverage", () => {
  it("counts strikes below and above", () => {
    expect(atmCoverage([100, 110, 120, 130, 140], 120)).toEqual({ below: 2, above: 2 });
    expect(atmCoverage([], 100)).toEqual({ below: 0, above: 0 });
  });
});

describe("computeSpotDivergence", () => {
  it("computes divergence pct", () => {
    const r = computeSpotDivergence(24000, 23880);
    expect(r.divergence).toBe(120);
    expect(r.divergencePct).toBeCloseTo(0.5, 3);
  });
  it("flags severe divergence", () => {
    expect(computeSpotDivergence(24000, 23500).severe).toBe(true);
    expect(computeSpotDivergence(24000, 24010).severe).toBe(false);
  });
  it("safely handles missing values", () => {
    expect(computeSpotDivergence(null, 100).severe).toBe(false);
    expect(computeSpotDivergence(100, null).severe).toBe(false);
  });
});

describe("exportFilename", () => {
  it("embeds LIVE/DEMO indicator", () => {
    const now = new Date("2026-07-14T00:00:00Z");
    expect(exportFilename("OPTIONS", "NIFTY", "2026-07-17", "LIVE", "csv", now)).toBe(
      "NIFTY_OPTIONS_LIVE_2026-07-17_2026-07-14.csv",
    );
    expect(exportFilename("OPTIONS", "NIFTY", "2026-07-17", "DEMO", "json", now)).toContain("_DEMO_");
  });
});

describe("isExpiryValid", () => {
  const now = new Date("2026-07-14T00:00:00Z");
  it("accepts a listed future expiry", () => {
    expect(isExpiryValid("2026-07-17", ["2026-07-17", "2026-07-24"], now)).toBe(true);
  });
  it("rejects past expiry", () => {
    expect(isExpiryValid("2026-07-10", ["2026-07-10"], now)).toBe(false);
  });
  it("rejects unlisted expiry", () => {
    expect(isExpiryValid("2026-07-17", ["2026-07-24"], now)).toBe(false);
  });
  it("rejects null", () => {
    expect(isExpiryValid(null, ["2026-07-17"], now)).toBe(false);
  });
});

describe("shouldAcceptAlert", () => {
  const base: AlertContext = {
    symbol: "NIFTY",
    expiry: "2026-07-17",
    provider: "NSE",
    sourceStatus: "LIVE",
    snapshotTs: 1000,
    marketOpen: true,
  };
  it("requires monotonically increasing timestamps", () => {
    expect(shouldAcceptAlert(base, { ...base, snapshotTs: 2000 })).toBe(true);
    expect(shouldAcceptAlert(base, { ...base, snapshotTs: 500 })).toBe(false);
  });
  it("resets on provider or expiry change", () => {
    expect(
      shouldAcceptAlert(base, { ...base, snapshotTs: 2000, provider: "OTHER" }),
    ).toBe(false);
    expect(shouldAcceptAlert(base, { ...base, snapshotTs: 2000, expiry: "2026-07-24" })).toBe(false);
  });
  it("rejects when market closed or not LIVE", () => {
    expect(shouldAcceptAlert(base, { ...base, snapshotTs: 2000, marketOpen: false })).toBe(false);
    expect(shouldAcceptAlert(base, { ...base, snapshotTs: 2000, sourceStatus: "STALE" })).toBe(false);
  });
  it("returns false when no previous context", () => {
    expect(shouldAcceptAlert(null, base)).toBe(false);
  });
});

describe("safeRecommendationAction", () => {
  const tradable = { isTradable: true, sourceStatus: "LIVE" as const, blockingReasons: [], warnings: [] };
  const untradable = {
    isTradable: false,
    sourceStatus: "UNAVAILABLE" as const,
    blockingReasons: ["x"],
    warnings: [],
  };
  it("passes through when tradable and market open", () => {
    expect(safeRecommendationAction("BUY_CE", tradable, true)).toBe("BUY_CE");
    expect(safeRecommendationAction("BUY_PE", tradable, true)).toBe("BUY_PE");
    expect(safeRecommendationAction("WAIT", tradable, true)).toBe("WAIT");
  });
  it("returns MARKET_CLOSED regardless of raw action", () => {
    expect(safeRecommendationAction("BUY_CE", tradable, false)).toBe("MARKET_CLOSED");
  });
  it("returns DATA_INCOMPLETE when data is unavailable/stale/partial/demo", () => {
    expect(safeRecommendationAction("BUY_CE", untradable, true)).toBe("DATA_INCOMPLETE");
    expect(
      safeRecommendationAction("BUY_CE", { ...untradable, sourceStatus: "STALE" }, true),
    ).toBe("DATA_INCOMPLETE");
    expect(
      safeRecommendationAction("BUY_CE", { ...untradable, sourceStatus: "DEMO" }, true),
    ).toBe("DATA_INCOMPLETE");
  });
  it("returns WAIT for other untradable reasons", () => {
    expect(
      safeRecommendationAction(
        "BUY_CE",
        {
          isTradable: false,
          sourceStatus: "LIVE",
          blockingReasons: ["something else"],
          warnings: [],
        },
        true,
      ),
    ).toBe("WAIT");
  });
});