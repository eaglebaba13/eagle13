/**
 * Phase 20.3B — Trusted server functions for Razorpay checkout & billing
 * lifecycle. All authoritative fields (price, plan ID, customer ID) are
 * resolved server-side from environment secrets and the authenticated user.
 *
 * If Razorpay is not configured, every function returns a `not_configured`
 * envelope. The frontend uses these envelopes to gate UI without ever seeing
 * secrets or Plan IDs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BillingCycle, BillingProviderHealth } from "./razorpay-plan-map";
import { PLAN_IDS, type PlanId } from "./plans";

const CheckoutInput = z.object({
  plan: z.enum(PLAN_IDS),
  cycle: z.enum(["monthly", "annual"] as const),
  returnUrl: z.string().url().max(2048).optional(),
});

export type CheckoutStatus =
  | "not_configured"
  | "plan_not_billable"
  | "not_authenticated"
  | "ready";

export interface CreateCheckoutResult {
  status: CheckoutStatus;
  keyId: string | null;
  subscriptionId: string | null;
  provider: "razorpay";
  environment: "test" | "live" | "not_configured";
  message: string;
}

/** Create a Razorpay subscription and hand the browser only safe fields. */
export const createRazorpayCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => CheckoutInput.parse(raw))
  .handler(async ({ data, context }): Promise<CreateCheckoutResult> => {
    const { readRazorpayEnv, getServerPlanSlot } = await import("./razorpay-plan-map.server");
    const env = readRazorpayEnv();
    if (!env.configured) {
      return {
        status: "not_configured",
        keyId: null,
        subscriptionId: null,
        provider: "razorpay",
        environment: "not_configured",
        message: "Razorpay is not configured on this environment.",
      };
    }
    const slot = getServerPlanSlot(data.plan as PlanId, data.cycle as BillingCycle);
    if (!slot.configured || !slot.providerPlanId) {
      return {
        status: "plan_not_billable",
        keyId: null,
        subscriptionId: null,
        provider: "razorpay",
        environment: env.environment,
        message: `Plan ${data.plan}/${data.cycle} has no Razorpay Plan ID configured.`,
      };
    }
    // NOTE: intentionally not performing the live provider call here yet —
    // credentials are absent in this environment. When live credentials
    // land, replace this block with the Razorpay Subscriptions REST call
    // (POST /v1/subscriptions) authenticated as env.keyId:env.keySecret,
    // persist the returned id to `subscriptions.provider_subscription_id`,
    // and write a `billing_events` row of type "checkout.created".
    void context;
    return {
      status: "not_configured",
      keyId: null,
      subscriptionId: null,
      provider: "razorpay",
      environment: env.environment,
      message:
        "Razorpay credentials present but live checkout call is disabled in this build. Complete Phase 20.3B provisioning to enable.",
    };
  });

/** Public health/status probe. Never returns secrets or plan IDs. */
export const getBillingProviderHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<BillingProviderHealth> => {
    const { readRazorpayEnv, listServerPlanSlots } = await import("./razorpay-plan-map.server");
    const env = readRazorpayEnv();
    const slots = listServerPlanSlots().map((s) => ({
      plan: s.plan,
      cycle: s.cycle,
      configured: s.configured,
    }));
    if (!env.configured) {
      return {
        provider: "razorpay",
        environment: "not_configured",
        configured: false,
        webhookConfigured: false,
        slots,
        message: "Razorpay is not configured on this environment.",
      };
    }
    return {
      provider: "razorpay",
      environment: env.environment,
      configured: true,
      webhookConfigured: Boolean(env.webhookSecret),
      slots,
    };
  },
);