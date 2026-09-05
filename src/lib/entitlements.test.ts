import { describe, expect, it } from "vitest";
import {
  hasEntitlement,
  resolveEffectivePlan,
  limitsFor,
  minPlanFor,
  type SubscriptionSnapshot,
  type UserEntitlementContext,
} from "./entitlements";

const now = new Date("2026-07-14T00:00:00Z");

function sub(over: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return {
    plan: "pro",
    status: "active",
    trialEnd: null,
    currentPeriodEnd: new Date("2026-08-14T00:00:00Z"),
    cancelAtPeriodEnd: false,
    provider: null,
    ...over,
  };
}

function ctx(over: Partial<UserEntitlementContext> = {}): UserEntitlementContext {
  return { role: "free", subscription: null, now, ...over };
}

describe("entitlements", () => {
  it("personal terminal grants all capabilities regardless of subscription", () => {
    expect(hasEntitlement(ctx(), "decision.intelligence")).toBe(true);
    expect(hasEntitlement(ctx(), "dashboard.basic")).toBe(true);
    expect(hasEntitlement(ctx(), "market.terminal")).toBe(true);
    expect(hasEntitlement(ctx(), "broker.live")).toBe(true);
  });

  it("active pro subscription still resolves plan correctly", () => {
    const c = ctx({ subscription: sub({ plan: "pro", status: "active" }) });
    expect(hasEntitlement(c, "market.terminal")).toBe(true);
    expect(hasEntitlement(c, "decision.intelligence")).toBe(true);
  });

  it("active professional subscription still resolves plan correctly", () => {
    const c = ctx({ subscription: sub({ plan: "professional", status: "active" }) });
    expect(hasEntitlement(c, "decision.intelligence")).toBe(true);
    expect(hasEntitlement(c, "broker.live")).toBe(true);
  });

  it("trialing plan grants access", () => {
    const trialing = ctx({
      subscription: sub({
        plan: "professional",
        status: "trialing",
        trialEnd: new Date("2026-07-20T00:00:00Z"),
      }),
    });
    expect(hasEntitlement(trialing, "options.analytics")).toBe(true);
    const expired = ctx({
      subscription: sub({
        plan: "professional",
        status: "trialing",
        trialEnd: new Date("2026-07-13T00:00:00Z"),
      }),
    });
    expect(hasEntitlement(expired, "options.analytics")).toBe(true);
  });

  it("canceled subscription still grants access in personal terminal", () => {
    const c = ctx({ subscription: sub({ plan: "professional", status: "canceled" }) });
    expect(hasEntitlement(c, "options.analytics")).toBe(true);
    expect(resolveEffectivePlan(c).planId).toBe("free");
  });

  it("past_due retains access until backend flips status", () => {
    const c = ctx({ subscription: sub({ plan: "pro", status: "past_due" }) });
    expect(hasEntitlement(c, "market.terminal")).toBe(true);
  });

  it("expired subscription still grants access in personal terminal", () => {
    const c = ctx({ subscription: sub({ plan: "pro", status: "expired" }) });
    expect(hasEntitlement(c, "market.terminal")).toBe(true);
  });

  it("admin role bypasses all plan checks", () => {
    const c = ctx({ role: "admin" });
    expect(hasEntitlement(c, "broker.live")).toBe(true);
    expect(hasEntitlement(c, "admin.console")).toBe(true);
  });

  it("adminOverride bypasses plan checks", () => {
    const c = ctx({ adminOverride: true });
    expect(hasEntitlement(c, "options.analytics")).toBe(true);
  });

  it("granted capability overrides plan restriction", () => {
    const c = ctx({ grantedCapabilities: ["market.replay"] });
    expect(hasEntitlement(c, "market.replay")).toBe(true);
  });

  it("limits reflect effective plan not subscribed plan when expired", () => {
    const c = ctx({ subscription: sub({ plan: "professional", status: "expired" }) });
    expect(limitsFor(c).watchlists).toBeLessThanOrEqual(5);
  });

  it("minPlanFor resolves the entry-level plan for a capability", () => {
    expect(minPlanFor("dashboard.basic")).toBe("free");
    expect(minPlanFor("market.terminal")).toBe("pro");
    expect(minPlanFor("options.analytics")).toBe("professional");
    expect(minPlanFor("broker.live")).toBe("enterprise");
  });

  it("trial countdown reports days remaining", () => {
    const eff = resolveEffectivePlan(
      ctx({
        subscription: sub({
          plan: "pro",
          status: "trialing",
          trialEnd: new Date("2026-07-20T00:00:00Z"),
        }),
      }),
    );
    expect(eff.isTrial).toBe(true);
    expect(eff.trialDaysLeft).toBe(6);
  });
});
