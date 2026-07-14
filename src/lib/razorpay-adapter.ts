/**
 * Phase 20.3B — Razorpay implementation of BillingProviderAdapter.
 *
 * The adapter lives in the client bundle but MUST NEVER touch secrets. It
 * delegates every real operation to server functions or trusted RPCs.
 *
 * When Razorpay is not configured, methods return the same "not configured"
 * envelopes as `DevBillingAdapter` so entitlement logic keeps working.
 */
import type {
  BillingProviderAdapter,
  CheckoutSessionResult,
  Invoice,
  PaymentMethodSummary,
  WebhookResult,
} from "./billing-adapter";
import type { PlanId } from "./plans";
import { selfSetCancelAtPeriodEnd } from "./billing-rpc";
import {
  createRazorpayCheckout,
  getBillingProviderHealth,
} from "./razorpay-checkout.functions";

export class RazorpayBillingAdapter implements BillingProviderAdapter {
  readonly name = "razorpay" as const;
  /** Client-side flag. Trusted status comes from `healthCheck()`. */
  readonly configured: boolean;

  constructor(opts: { publishableKeyId?: string | null } = {}) {
    // The publishable Razorpay Key ID is the ONLY billing secret that may
    // reach the browser, and only when explicitly baked in as VITE_*.
    this.configured = Boolean(opts.publishableKeyId);
  }

  async createCheckoutSession(input: {
    userId: string;
    plan: PlanId;
    billingCycle: "monthly" | "annual";
    returnUrl: string;
  }): Promise<CheckoutSessionResult> {
    const res = await createRazorpayCheckout({
      data: { plan: input.plan, cycle: input.billingCycle, returnUrl: input.returnUrl },
    });
    return {
      url: null, // Razorpay uses an in-page SDK modal, not a hosted URL
      provider: "razorpay",
      configured: res.status === "ready",
      message: res.message,
    };
  }

  async createCustomerPortalSession(): Promise<CheckoutSessionResult> {
    // Razorpay has no hosted customer portal — we render one at /billing.
    return {
      url: "/billing",
      provider: "razorpay",
      configured: this.configured,
      message: "Managed via in-app billing screen.",
    };
  }
  async cancelSubscription() {
    try {
      await selfSetCancelAtPeriodEnd(true);
      return { ok: true, message: "Cancellation scheduled at period end." };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
  async resumeSubscription() {
    try {
      await selfSetCancelAtPeriodEnd(false);
      return { ok: true, message: "Subscription resumed." };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
  async changePlan() {
    // Plan-change flow must round-trip through a verified webhook. Client
    // cannot mutate plan directly.
    return { ok: false, message: "Plan changes require verified provider event." };
  }
  async getInvoices(_userId: string): Promise<Invoice[]> {
    void _userId;
    return [];
  }
  async getPaymentMethods(_userId: string): Promise<PaymentMethodSummary[]> {
    void _userId;
    return [];
  }
  async handleWebhook(): Promise<WebhookResult> {
    // Webhook handling is server-only — the public route
    // `/api/public/webhooks/razorpay` owns this path. This client stub
    // exists only to satisfy the interface.
    return {
      ok: false,
      eventId: null,
      duplicate: false,
      reason: "Webhooks are processed server-side.",
    };
  }
  async healthCheck() {
    try {
      const h = await getBillingProviderHealth();
      return { ok: h.configured, message: `${h.provider}:${h.environment}` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
}