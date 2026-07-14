import { describe, expect, it } from "vitest";
import { rowToSnapshot } from "./cloud-sync";

describe("cloud-sync row mapping", () => {
  it("returns null for null row", () => {
    expect(rowToSnapshot(null)).toBeNull();
  });

  it("maps known plans/statuses", () => {
    const snap = rowToSnapshot({
      plan: "professional",
      status: "trialing",
      trial_end: "2026-08-01T00:00:00Z",
      current_period_end: "2026-09-01T00:00:00Z",
      cancel_at_period_end: true,
      provider: "razorpay",
    });
    expect(snap?.plan).toBe("professional");
    expect(snap?.status).toBe("trialing");
    expect(snap?.cancelAtPeriodEnd).toBe(true);
    expect(snap?.provider).toBe("razorpay");
    expect(snap?.trialEnd?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("falls back to free/active for unknown values", () => {
    const snap = rowToSnapshot({
      plan: "mystery-plan",
      status: "mystery-status",
      trial_end: null,
      current_period_end: null,
      cancel_at_period_end: null,
      provider: null,
    });
    expect(snap?.plan).toBe("free");
    expect(snap?.status).toBe("active");
    expect(snap?.cancelAtPeriodEnd).toBe(false);
  });
});