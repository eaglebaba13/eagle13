/**
 * Phase 20.2 — Provider-neutral billing adapter.
 *
 * Design contract: entitlement logic never depends on provider specifics.
 * The dev-mode adapter here does no real charging; a future Razorpay /
 * Stripe adapter can implement the same interface without touching the
 * entitlement engine.
 */
import type { PlanId } from "./plans";

export type BillingProviderName = "none" | "dev" | "razorpay" | "stripe";

export interface CheckoutSessionResult {
  url: string | null;
  provider: BillingProviderName;
  configured: boolean;
  message?: string;
}

export interface Invoice {
  id: string;
  amountInPaise: number;
  currency: string;
  status: "paid" | "open" | "void";
  issuedAt: Date;
  hostedUrl: string | null;
}

export interface PaymentMethodSummary {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface WebhookResult {
  ok: boolean;
  eventId: string | null;
  duplicate: boolean;
  reason?: string;
}

export interface BillingProviderAdapter {
  readonly name: BillingProviderName;
  readonly configured: boolean;
  createCheckoutSession(input: {
    userId: string;
    plan: PlanId;
    billingCycle: "monthly" | "annual";
    returnUrl: string;
  }): Promise<CheckoutSessionResult>;
  createCustomerPortalSession(userId: string): Promise<CheckoutSessionResult>;
  cancelSubscription(subscriptionId: string): Promise<{ ok: boolean; message?: string }>;
  resumeSubscription(subscriptionId: string): Promise<{ ok: boolean; message?: string }>;
  changePlan(subscriptionId: string, plan: PlanId): Promise<{ ok: boolean; message?: string }>;
  getInvoices(userId: string): Promise<Invoice[]>;
  getPaymentMethods(userId: string): Promise<PaymentMethodSummary[]>;
  handleWebhook(raw: string, signature: string | null): Promise<WebhookResult>;
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}

/** No-op adapter used until a real provider is wired in. */
export class DevBillingAdapter implements BillingProviderAdapter {
  readonly name = "dev" as const;
  readonly configured = false;

  async createCheckoutSession(): Promise<CheckoutSessionResult> {
    return {
      url: null,
      provider: "dev",
      configured: false,
      message: "Billing provider not configured.",
    };
  }
  async createCustomerPortalSession(): Promise<CheckoutSessionResult> {
    return { url: null, provider: "dev", configured: false, message: "Billing provider not configured." };
  }
  async cancelSubscription() {
    return { ok: false, message: "Billing provider not configured." };
  }
  async resumeSubscription() {
    return { ok: false, message: "Billing provider not configured." };
  }
  async changePlan() {
    return { ok: false, message: "Billing provider not configured." };
  }
  async getInvoices(): Promise<Invoice[]> {
    return [];
  }
  async getPaymentMethods(): Promise<PaymentMethodSummary[]> {
    return [];
  }
  async handleWebhook(): Promise<WebhookResult> {
    return { ok: false, eventId: null, duplicate: false, reason: "Billing provider not configured." };
  }
  async healthCheck() {
    return { ok: true, message: "dev adapter (no real billing)" };
  }
}

let _active: BillingProviderAdapter = new DevBillingAdapter();

export function getBillingAdapter(): BillingProviderAdapter {
  return _active;
}

export function setBillingAdapter(next: BillingProviderAdapter): void {
  _active = next;
}