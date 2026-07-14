/**
 * Phase 20.3B — SERVER-ONLY Razorpay plan-mapping.
 *
 * Real Razorpay Plan IDs are read from environment variables so the browser
 * bundle never sees them. The client only receives a boolean `configured`
 * flag per (plan, cycle) slot via `getBillingProviderHealth()`.
 *
 * File is `.server.ts` — the bundler forbids client-side imports, so no
 * plan ID can leak into the frontend even by accident.
 */
import type { PlanId } from "./plans";
import type { BillingCycle, PlanConfigSlot } from "./razorpay-plan-map";

export interface ServerPlanSlot extends PlanConfigSlot {
  providerPlanId: string | null;
  expectedAmountInPaise: number | null;
  currency: "INR";
}

function readEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

/**
 * Every paid (plan, cycle) EagleBABA slot MUST have a Razorpay Plan ID
 * configured before checkout unlocks. Enterprise is contact-sales only.
 */
const SLOT_ENV_MATRIX: Record<`${PlanId}_${BillingCycle}`, { env: string; amount: number } | null> = {
  free_monthly: null,
  free_annual: null,
  pro_monthly: { env: "RAZORPAY_PLAN_PRO_MONTHLY", amount: 99900 },
  pro_annual: { env: "RAZORPAY_PLAN_PRO_ANNUAL", amount: 999000 },
  professional_monthly: { env: "RAZORPAY_PLAN_PROFESSIONAL_MONTHLY", amount: 249900 },
  professional_annual: { env: "RAZORPAY_PLAN_PROFESSIONAL_ANNUAL", amount: 2499000 },
  enterprise_monthly: null,
  enterprise_annual: null,
};

export function getServerPlanSlot(plan: PlanId, cycle: BillingCycle): ServerPlanSlot {
  const key = `${plan}_${cycle}` as const;
  const spec = SLOT_ENV_MATRIX[key];
  if (!spec) return { plan, cycle, providerPlanId: null, expectedAmountInPaise: null, configured: false, currency: "INR" };
  const providerPlanId = readEnv(spec.env);
  return {
    plan,
    cycle,
    providerPlanId,
    expectedAmountInPaise: spec.amount,
    configured: providerPlanId !== null,
    currency: "INR",
  };
}

export function listServerPlanSlots(): ServerPlanSlot[] {
  const slots: ServerPlanSlot[] = [];
  for (const [key, spec] of Object.entries(SLOT_ENV_MATRIX)) {
    if (!spec) continue;
    const [plan, cycle] = key.split("_") as [PlanId, BillingCycle];
    slots.push(getServerPlanSlot(plan, cycle));
  }
  return slots;
}

export function readRazorpayEnv() {
  const keyId = readEnv("RAZORPAY_KEY_ID");
  const keySecret = readEnv("RAZORPAY_KEY_SECRET");
  const webhookSecret = readEnv("RAZORPAY_WEBHOOK_SECRET");
  const webhookSecretPrevious = readEnv("RAZORPAY_WEBHOOK_SECRET_PREVIOUS");
  const rawEnv = (readEnv("RAZORPAY_ENVIRONMENT") ?? "test").toLowerCase();
  const environment: "test" | "live" = rawEnv === "live" ? "live" : "test";
  return {
    keyId,
    keySecret,
    webhookSecret,
    webhookSecretPrevious,
    environment,
    configured: Boolean(keyId && keySecret),
  };
}