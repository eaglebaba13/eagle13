import { describe, expect, it } from "vitest";
import { checkUsage, todayPeriod, monthPeriod, periodFor } from "./usage-limits";

describe("usage limits", () => {
  it("allows consumption below the limit", () => {
    const c = checkUsage(3, 10, "watchlists");
    expect(c.allowed).toBe(true);
    expect(c.remaining).toBe(7);
  });

  it("denies at the limit", () => {
    const c = checkUsage(10, 10, "watchlists");
    expect(c.allowed).toBe(false);
    expect(c.reason).toContain("Usage limit reached");
  });

  it("ratio never exceeds 1", () => {
    expect(checkUsage(999, 5, "watchlists").ratio).toBe(1);
  });

  it("negative used is clamped", () => {
    expect(checkUsage(-5, 3, "watchlists").used).toBe(0);
  });

  it("daily and monthly periods have stable formats", () => {
    const d = new Date("2026-07-14T12:00:00Z");
    expect(todayPeriod(d)).toBe("2026-07-14");
    expect(monthPeriod(d)).toBe("2026-07");
    expect(periodFor("backtestsPerDay", d)).toBe("2026-07-14");
    expect(periodFor("watchlists", d)).toBe("lifetime");
  });
});