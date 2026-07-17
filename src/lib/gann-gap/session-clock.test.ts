import { describe, it, expect } from "vitest";
import { resolveLifecycle, toIstParts, WEEKEND_ONLY_CALENDAR } from "./session-clock";
import { DEFAULT_GANN_GAP_CONFIG } from "./config";

describe("toIstParts", () => {
  it("converts a UTC instant to IST date + hour + minute", () => {
    // 2025-01-15 09:56 UTC → 15:26 IST
    const p = toIstParts(new Date("2025-01-15T09:56:00Z"));
    expect(p.date).toBe("2025-01-15");
    expect(p.hour).toBe(15);
    expect(p.minute).toBe(26);
  });
});

describe("resolveLifecycle", () => {
  const cfg = DEFAULT_GANN_GAP_CONFIG;
  it("PENDING before 15:26 IST on a trading day", () => {
    // 2025-01-15 09:55 UTC → 15:25 IST (Wednesday)
    const r = resolveLifecycle({ now: new Date("2025-01-15T09:55:00Z"), config: cfg });
    expect(r.lifecycle).toBe("PENDING");
    expect(r.isTradingDay).toBe(true);
  });
  it("EVAL at exactly 15:26 IST on a trading day", () => {
    const r = resolveLifecycle({ now: new Date("2025-01-15T09:56:00Z"), config: cfg });
    expect(r.lifecycle).toBe("EVAL");
  });
  it("FROZEN on a weekend", () => {
    // 2025-01-18 is Saturday
    const r = resolveLifecycle({ now: new Date("2025-01-18T10:00:00Z"), config: cfg });
    expect(r.lifecycle).toBe("FROZEN");
    expect(r.isTradingDay).toBe(false);
  });
  it("nextTradingDate skips weekend", () => {
    // Friday 2025-01-17 EOD IST
    const r = resolveLifecycle({ now: new Date("2025-01-17T12:00:00Z"), config: cfg });
    expect(r.nextTradingDate).toBe("2025-01-20");
  });
  it("forceFrozen overrides to FROZEN", () => {
    const r = resolveLifecycle({
      now: new Date("2025-01-15T09:56:00Z"),
      config: cfg,
      forceFrozen: true,
    });
    expect(r.lifecycle).toBe("FROZEN");
  });
});

describe("WEEKEND_ONLY_CALENDAR", () => {
  it("recognises weekdays as trading days", () => {
    expect(WEEKEND_ONLY_CALENDAR.isTradingDay("2025-01-15")).toBe(true);
  });
  it("rejects Saturday and Sunday", () => {
    expect(WEEKEND_ONLY_CALENDAR.isTradingDay("2025-01-18")).toBe(false);
    expect(WEEKEND_ONLY_CALENDAR.isTradingDay("2025-01-19")).toBe(false);
  });
});