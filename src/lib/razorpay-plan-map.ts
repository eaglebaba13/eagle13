/**
 * Phase 20.3B — Client-safe view of the Razorpay plan-mapping status.
 *
 * Never contains real Razorpay plan IDs — those live only on the server
 * (see `razorpay-plan-map.server.ts`). The client only needs to know which
 * (plan, cycle) combinations are checkout-ready so it can gate buttons.
 */
import type { PlanId } from "./plans";

export type BillingCycle = "monthly" | "annual";

export interface PlanConfigSlot {
  plan: PlanId;
  cycle: BillingCycle;
  configured: boolean;
}

/** Envelope returned by the health-check server fn. */
export interface BillingProviderHealth {
  provider: "razorpay" | "dev" | "none";
  environment: "test" | "live" | "not_configured";
  configured: boolean;
  slots: PlanConfigSlot[];
  webhookConfigured: boolean;
  message?: string;
}

export function slotKey(plan: PlanId, cycle: BillingCycle): string {
  return `${plan}_${cycle}`;
}