import { describe, expect, it } from "vitest";
import { DevBillingAdapter, getBillingAdapter, setBillingAdapter } from "./billing-adapter";

describe("billing adapter (dev no-op)", () => {
  it("reports not configured", async () => {
    const a = new DevBillingAdapter();
    expect(a.configured).toBe(false);
    expect(a.name).toBe("dev");
    const h = await a.healthCheck();
    expect(h.ok).toBe(true);
  });

  it("checkout, cancel and resume all report not configured", async () => {
    const a = new DevBillingAdapter();
    const cs = await a.createCheckoutSession({
      userId: "u1",
      plan: "pro",
      billingCycle: "monthly",
      returnUrl: "/billing",
    });
    expect(cs.configured).toBe(false);
    expect(cs.url).toBeNull();
    const cancel = await a.cancelSubscription("sub_1");
    expect(cancel.ok).toBe(false);
    const resume = await a.resumeSubscription("sub_1");
    expect(resume.ok).toBe(false);
  });

  it("webhook handler refuses to activate paid status from unverified events", async () => {
    const a = new DevBillingAdapter();
    const res = await a.handleWebhook("{}", null);
    expect(res.ok).toBe(false);
  });

  it("adapter registry is swappable at runtime", () => {
    const prev = getBillingAdapter();
    const custom = new DevBillingAdapter();
    setBillingAdapter(custom);
    expect(getBillingAdapter()).toBe(custom);
    setBillingAdapter(prev);
  });
});