import { describe, it, expect } from "vitest";
import { deriveDashboardFreshness } from "./dashboard-freshness-adapter";

const NOW = Date.parse("2026-07-16T10:00:00Z");
const iso = (offsetMs: number) => new Date(NOW - offsetMs).toISOString();

describe("Phase 24D · dashboard freshness adapter", () => {
  it("maps fresh MARKET_DATA to LIVE", () => {
    const m = deriveDashboardFreshness({
      nifty: { updatedAt: iso(5_000), marketState: "OPEN" },
      banknifty: { updatedAt: iso(5_000), marketState: "OPEN" },
      now: NOW,
    });
    expect(m.MARKET_DATA.status).toBe("LIVE");
  });

  it("marks UNAVAILABLE when no timestamps", () => {
    const m = deriveDashboardFreshness({ now: NOW });
    expect(m.MARKET_DATA.status).toBe("UNAVAILABLE");
    expect(m.GOLD_SILVER_RATIO.status).toBe("UNAVAILABLE");
  });

  it("uses receivedTimestamp fallback and discloses it in reason", () => {
    const m = deriveDashboardFreshness({
      queryReceivedAt: NOW - 4_000,
      now: NOW,
    });
    expect(m.MARKET_DATA.status).toBe("LIVE");
    expect(m.MARKET_DATA.reason).toMatch(/receivedTimestamp fallback/);
  });

  it("classifies GOLD_SILVER_RATIO from oldest of gold/silver", () => {
    const m = deriveDashboardFreshness({
      gold: { updatedAt: iso(5_000), marketState: "OPEN" },
      silver: { updatedAt: iso(10 * 60_000), marketState: "OPEN" },
      now: NOW,
    });
    // Older leg (10m ago) with 60s expected → DELAYED
    expect(m.GOLD_SILVER_RATIO.status).toBe("DELAYED");
  });

  it("provider DOWN → UNAVAILABLE across dependencies", () => {
    const m = deriveDashboardFreshness({
      nifty: { updatedAt: iso(1_000), marketState: "OPEN" },
      providerStatus: "DOWN",
      now: NOW,
    });
    expect(m.MARKET_DATA.status).toBe("UNAVAILABLE");
  });

  it("returns all six dependency keys", () => {
    const m = deriveDashboardFreshness({ now: NOW });
    expect(Object.keys(m).sort()).toEqual(
      [
        "ASTRO_SNAPSHOT",
        "DECISION_SNAPSHOT",
        "GOLD_SILVER_RATIO",
        "MARKET_BREADTH",
        "MARKET_DATA",
        "OPTIONS_CHAIN",
      ].sort(),
    );
  });
});