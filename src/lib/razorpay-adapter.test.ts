import { describe, expect, it, vi } from "vitest";

vi.mock("./razorpay-checkout.functions", () => ({
  createRazorpayCheckout: vi.fn(async () => ({
    status: "not_configured",
    keyId: null,
    subscriptionId: null,
    provider: "razorpay",
    environment: "not_configured",
    message: "Razorpay is not configured on this environment.",
  })),
  getBillingProviderHealth: vi.fn(async () => ({
    provider: "razorpay" as const,
    environment: "not_configured" as const,
    configured: false,
    webhookConfigured: false,
    slots: [],
  })),
}));

vi.mock("./billing-rpc", () => ({
  selfSetCancelAtPeriodEnd: vi.fn(async () => {}),
}));

import { RazorpayBillingAdapter } from "./razorpay-adapter";

describe("RazorpayBillingAdapter (unconfigured)", () => {
  it("reports unconfigured when no publishable key id is supplied", () => {
    const a = new RazorpayBillingAdapter();
    expect(a.configured).toBe(false);
    expect(a.name).toBe("razorpay");
  });

  it("createCheckoutSession returns not-configured envelope, no url", async () => {
    const a = new RazorpayBillingAdapter();
    const cs = await a.createCheckoutSession({
      userId: "u1",
      plan: "pro",
      billingCycle: "monthly",
      returnUrl: "https://example.com/billing",
    });
    expect(cs.url).toBeNull();
    expect(cs.configured).toBe(false);
    expect(cs.provider).toBe("razorpay");
  });

  it("changePlan is forbidden from the client", async () => {
    const a = new RazorpayBillingAdapter();
    const r = await a.changePlan();
    expect(r.ok).toBe(false);
  });

  it("handleWebhook client stub never activates state", async () => {
    const a = new RazorpayBillingAdapter();
    const r = await a.handleWebhook();
    expect(r.ok).toBe(false);
  });

  it("healthCheck reports provider + environment without leaking secrets", async () => {
    const a = new RazorpayBillingAdapter();
    const h = await a.healthCheck();
    expect(h.ok).toBe(false);
    expect(h.message).toContain("razorpay");
  });
});