import { describe, it, expect } from "vitest";
import { classifyExpiries, selectExpiry, isExpiryFresh } from "./expiry-engine";

describe("expiry-engine", () => {
  const now = "2025-01-15T00:00:00.000Z"; // Wed

  it("classifies weekly / next / monthly", () => {
    const s = classifyExpiries(["2025-01-16", "2025-01-23", "2025-01-30"], now);
    expect(s.currentWeekly).toBe("2025-01-16");
    expect(s.nextWeekly).toBe("2025-01-23");
    expect(s.monthly).toBe("2025-01-30");
  });

  it("selects preferred when available, else current weekly", () => {
    const s = classifyExpiries(["2025-01-16", "2025-01-23"], now);
    expect(selectExpiry(s, "2025-01-23")).toBe("2025-01-23");
    expect(selectExpiry(s, "2099-12-31")).toBe("2025-01-16");
  });

  it("filters expired dates", () => {
    const s = classifyExpiries(["2024-01-01", "2025-01-16"], now);
    expect(s.all).toHaveLength(1);
  });

  it("freshness detection", () => {
    expect(isExpiryFresh("2025-01-15T00:00:00Z", 60_000, "2025-01-15T00:00:30Z")).toBe(true);
    expect(isExpiryFresh("2025-01-15T00:00:00Z", 1_000, "2025-01-15T00:01:00Z")).toBe(false);
  });
});