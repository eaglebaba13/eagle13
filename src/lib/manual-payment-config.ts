/**
 * Phase 20.3C — Server-side configuration for the manual UPI QR payment
 * workflow. All values live in code (or env overrides) — never trust the
 * browser for amounts, UPI ID, payee name, etc.
 */
import type { PlanId } from "./plans";

export type PaidPlanId = Extract<PlanId, "pro" | "professional">;
export type BillingCycle = "monthly" | "annual";

export interface ManualPaymentConfig {
  upiId: string;
  payeeName: string;
  bankName: string;
  supportEmail: string;
  supportPhone: string;
  currency: "INR";
  instructions: string[];
  /** amounts in whole rupees (₹) — must match `PLANS[*].monthlyPrice/annualPrice`. */
  prices: Record<PaidPlanId, Record<BillingCycle, number>>;
  qrImageOverride?: string | null;
  requestTtlHours: number;
  approvalSlaHours: number;
}

function envOr(key: string, fallback: string): string {
  const v =
    typeof process !== "undefined" && process.env && typeof process.env[key] === "string"
      ? (process.env[key] as string)
      : "";
  return v && v.trim() ? v : fallback;
}

/** Resolved once per server-fn call; safe to also import in tests. */
export function getManualPaymentConfig(): ManualPaymentConfig {
  return {
    upiId: envOr("MANUAL_UPI_ID", "eaglebaba@upi"),
    payeeName: envOr("MANUAL_UPI_PAYEE", "EagleBABA"),
    bankName: envOr("MANUAL_UPI_BANK", "—"),
    supportEmail: envOr("MANUAL_UPI_SUPPORT_EMAIL", "support@eaglebaba.com"),
    supportPhone: envOr("MANUAL_UPI_SUPPORT_PHONE", "—"),
    currency: "INR",
    instructions: [
      "Scan the QR using any UPI app (GPay, PhonePe, Paytm, BHIM, Amazon Pay).",
      "Pay the EXACT amount shown — do not round up or down.",
      "Do NOT change the payment reference in the note field.",
      "After payment, submit your UTR / Transaction ID with a screenshot.",
      "Subscription activates only after admin verification (typically within 24 hours).",
    ],
    prices: {
      pro: { monthly: 999, annual: 9990 },
      professional: { monthly: 2499, annual: 24990 },
    },
    qrImageOverride: envOr("MANUAL_UPI_QR_IMAGE_URL", "") || null,
    requestTtlHours: 24,
    approvalSlaHours: 24,
  };
}

/** Amount in paise (integer) for a given plan+cycle — used server-side. */
export function resolveAmountPaise(
  plan: PaidPlanId,
  cycle: BillingCycle,
  cfg: ManualPaymentConfig = getManualPaymentConfig(),
): number {
  const rupees = cfg.prices[plan]?.[cycle];
  if (!rupees || rupees <= 0) {
    throw new Error(`no_price:${plan}:${cycle}`);
  }
  return Math.round(rupees * 100);
}

/** Human amount label (₹1,234). */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export function isPaidPlan(plan: string): plan is PaidPlanId {
  return plan === "pro" || plan === "professional";
}

export function isBillingCycle(cycle: string): cycle is BillingCycle {
  return cycle === "monthly" || cycle === "annual";
}