import { describe, it, expect } from "vitest";
import { summarizeDashboardHealth } from "./dashboard-health";
import { deriveDashboardFreshness } from "./dashboard-freshness-adapter";

const NOW = Date.parse("2026-07-16T10:00:00Z");
const iso = (offsetMs: number) => new Date(NOW - offsetMs).toISOString();

describe("Phase 24E · dashboard health summary", () => {
  it("returns LIVE when all critical deps fresh", () => {
    const f = deriveDashboardFreshness({
      nifty: { updatedAt: iso(2_000), marketState: "OPEN" },
      banknifty: { updatedAt: iso(2_000), marketState: "OPEN" },
      gold: { updatedAt: iso(2_000), marketState: "OPEN" },
      silver: { updatedAt: iso(2_000), marketState: "OPEN" },
      now: NOW,
    });
    const s = summarizeDashboardHealth({ freshness: f, providerStatus: "OK", lastSuccessAt: NOW });
    expect(["LIVE", "FRESH"]).toContain(s.overall);
  });

  it("elevates to STALE when critical dep stale", () => {
    const f = deriveDashboardFreshness({
      nifty: { updatedAt: iso(30 * 60_000), marketState: "OPEN" },
      banknifty: { updatedAt: iso(30 * 60_000), marketState: "OPEN" },
      gold: { updatedAt: iso(30 * 60_000), marketState: "OPEN" },
      silver: { updatedAt: iso(30 * 60_000), marketState: "OPEN" },
      now: NOW,
    });
    const s = summarizeDashboardHealth({ freshness: f, providerStatus: "OK" });
    expect(s.overall).toBe("STALE");
    expect(s.staleCount).toBeGreaterThan(0);
  });

  it("counts unavailable, blocked signals and methodology list", () => {
    const f = deriveDashboardFreshness({ now: NOW });
    const s = summarizeDashboardHealth({
      freshness: f,
      blockedSignals: 3,
      methodologies: ["GANN_NIFTY_ASTRO_V1_1", "CPR_CENTRAL_PIVOT_V1"],
    });
    expect(s.unavailableCount).toBeGreaterThan(0);
    expect(s.blockedSignals).toBe(3);
    expect(s.methodologies).toContain("GANN_NIFTY_ASTRO_V1_1");
  });
});