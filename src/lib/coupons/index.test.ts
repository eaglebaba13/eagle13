import { describe, expect, it } from "vitest";
import { evaluateCoupon, COUPON_ENGINE_VERSION, type CouponDefinition } from "./index";

const base: CouponDefinition = {
  code: "LAUNCH20",
  type: "PERCENT",
  value: 20,
  currency: "INR",
  validFromIso: "2026-01-01T00:00:00Z",
  validToIso:   "2026-12-31T23:59:59Z",
  maxRedemptions: 100,
  appliesToPlans: ["pro", "professional"],
};

describe("coupons", () => {
  it("applies 20% off pro price", () => {
    const r = evaluateCoupon({
      coupon: base, plan: "pro", basePricePaise: 100000,
      nowIso: "2026-06-01T00:00:00Z", redemptions: 0,
    });
    expect(r.ok).toBe(true);
    expect(r.discountPaise).toBe(20000);
    expect(r.finalPricePaise).toBe(80000);
  });
  it("rejects unknown coupon", () => {
    const r = evaluateCoupon({
      coupon: null, plan: "pro", basePricePaise: 100000,
      nowIso: "2026-06-01T00:00:00Z", redemptions: 0,
    });
    expect(r.error).toBe("not_found");
  });
  it("rejects expired coupon", () => {
    const r = evaluateCoupon({
      coupon: base, plan: "pro", basePricePaise: 100000,
      nowIso: "2027-01-01T00:00:00Z", redemptions: 0,
    });
    expect(r.error).toBe("expired");
  });
  it("rejects not yet valid", () => {
    const r = evaluateCoupon({
      coupon: base, plan: "pro", basePricePaise: 100000,
      nowIso: "2025-12-31T00:00:00Z", redemptions: 0,
    });
    expect(r.error).toBe("not_yet_valid");
  });
  it("rejects exhausted", () => {
    const r = evaluateCoupon({
      coupon: base, plan: "pro", basePricePaise: 100000,
      nowIso: "2026-06-01T00:00:00Z", redemptions: 100,
    });
    expect(r.error).toBe("exhausted");
  });
  it("rejects plan mismatch", () => {
    const r = evaluateCoupon({
      coupon: base, plan: "enterprise", basePricePaise: 100000,
      nowIso: "2026-06-01T00:00:00Z", redemptions: 0,
    });
    expect(r.error).toBe("plan_mismatch");
  });
  it("rejects when discount exceeds price", () => {
    const c: CouponDefinition = { ...base, type: "AMOUNT", value: 200000 };
    const r = evaluateCoupon({
      coupon: c, plan: "pro", basePricePaise: 100000,
      nowIso: "2026-06-01T00:00:00Z", redemptions: 0,
    });
    expect(r.error).toBe("amount_exceeds_price");
    expect(r.ok).toBe(false);
  });
  it("applies absolute discount", () => {
    const c: CouponDefinition = { ...base, type: "AMOUNT", value: 15000 };
    const r = evaluateCoupon({
      coupon: c, plan: "pro", basePricePaise: 100000,
      nowIso: "2026-06-01T00:00:00Z", redemptions: 0,
    });
    expect(r.ok).toBe(true);
    expect(r.finalPricePaise).toBe(85000);
  });
  it("version stable", () => {
    expect(COUPON_ENGINE_VERSION).toBe("coupons@1.0.0");
  });
});