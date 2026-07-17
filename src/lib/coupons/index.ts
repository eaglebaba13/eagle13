// Phase 30 — Deterministic coupon validator.
//
// Pure. Server functions consuming this must additionally verify that
// the coupon has not been redeemed beyond its cap (via DB).

export type CouponType = "PERCENT" | "AMOUNT";

export interface CouponDefinition {
  readonly code: string;
  readonly type: CouponType;
  readonly value: number;         // percent (1..100) or paise amount (>0)
  readonly currency: "INR";
  readonly validFromIso: string;
  readonly validToIso: string;
  readonly maxRedemptions: number;
  readonly appliesToPlans: readonly ("pro" | "professional" | "enterprise")[];
}

export type CouponError =
  | "not_found"
  | "expired"
  | "not_yet_valid"
  | "exhausted"
  | "plan_mismatch"
  | "invalid_amount"
  | "amount_exceeds_price";

export interface CouponEvaluation {
  readonly ok: boolean;
  readonly discountPaise: number;
  readonly finalPricePaise: number;
  readonly error: CouponError | null;
  readonly coupon: CouponDefinition | null;
}

export const COUPON_ENGINE_VERSION = "coupons@1.0.0";

export interface EvaluateCouponInput {
  readonly coupon: CouponDefinition | null;
  readonly plan: "pro" | "professional" | "enterprise";
  readonly basePricePaise: number;
  readonly nowIso: string;
  readonly redemptions: number;
}

export function evaluateCoupon(inp: EvaluateCouponInput): CouponEvaluation {
  const empty = { ok: false, discountPaise: 0, finalPricePaise: inp.basePricePaise, coupon: null };
  if (!inp.coupon) return { ...empty, error: "not_found" };
  const c = inp.coupon;
  const now = Date.parse(inp.nowIso);
  if (Number.isNaN(now)) return { ...empty, coupon: c, error: "invalid_amount" };
  if (now < Date.parse(c.validFromIso)) return { ...empty, coupon: c, error: "not_yet_valid" };
  if (now > Date.parse(c.validToIso)) return { ...empty, coupon: c, error: "expired" };
  if (inp.redemptions >= c.maxRedemptions) return { ...empty, coupon: c, error: "exhausted" };
  if (!c.appliesToPlans.includes(inp.plan)) return { ...empty, coupon: c, error: "plan_mismatch" };
  if (inp.basePricePaise <= 0) return { ...empty, coupon: c, error: "invalid_amount" };

  let discount = 0;
  if (c.type === "PERCENT") {
    if (c.value <= 0 || c.value > 100) return { ...empty, coupon: c, error: "invalid_amount" };
    discount = Math.floor((inp.basePricePaise * c.value) / 100);
  } else {
    if (c.value <= 0) return { ...empty, coupon: c, error: "invalid_amount" };
    discount = c.value;
  }
  if (discount >= inp.basePricePaise) {
    return { ok: false, discountPaise: discount, finalPricePaise: 0, coupon: c, error: "amount_exceeds_price" };
  }
  return {
    ok: true,
    discountPaise: discount,
    finalPricePaise: inp.basePricePaise - discount,
    coupon: c,
    error: null,
  };
}