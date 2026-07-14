/**
 * Phase 20.3C — Shared client-safe helpers for the manual UPI payment flow.
 * Reference generation, UPI URI, and QR image URL are safe on the browser;
 * amounts, statuses and admin operations live in server functions / RPCs.
 */
import type { BillingCycle, PaidPlanId } from "./manual-payment-config";

export const MANUAL_PAYMENT_STATUSES = [
  "CREATED",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELED",
] as const;
export type ManualPaymentStatus = (typeof MANUAL_PAYMENT_STATUSES)[number];

export interface ManualPaymentRequest {
  id: string;
  userId: string;
  paymentReference: string;
  requestedPlan: PaidPlanId;
  billingCycle: BillingCycle;
  expectedAmount: number; // paise
  currency: string;
  upiId: string;
  payeeName: string | null;
  utrNumber: string | null;
  paymentDate: string | null;
  paymentApp: string | null;
  amountPaid: number | null;
  screenshotUrl: string | null;
  userNote: string | null;
  adminNote: string | null;
  rejectionReason: string | null;
  status: ManualPaymentStatus;
  submittedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Alphabet without ambiguous characters (0/O, 1/I). */
const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomSuffix(len: number): string {
  let out = "";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) out += REF_ALPHABET[buf[i] % REF_ALPHABET.length];
  } else {
    for (let i = 0; i < len; i++)
      out += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return out;
}

/** Generate a payment reference like `EB-PRO-20260714-8X4K2`. */
export function generatePaymentReference(
  plan: PaidPlanId,
  now: Date = new Date(),
): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `EB-${plan.toUpperCase()}-${y}${m}${d}-${randomSuffix(5)}`;
}

/**
 * Build a canonical UPI payment URI. The QR encodes THIS string.
 * NEVER include secrets — UPI VPA and payee name are already public.
 */
export function buildUpiUri(params: {
  upiId: string;
  payeeName: string;
  amountRupees: number;
  reference: string;
  currency?: "INR";
}): string {
  const q = new URLSearchParams({
    pa: params.upiId,
    pn: params.payeeName,
    am: params.amountRupees.toFixed(2),
    cu: params.currency ?? "INR",
    tn: params.reference,
  });
  return `upi://pay?${q.toString()}`;
}

/** Free QR renderer (public service). No secrets ever leave the app. */
export function qrImageUrlFor(uri: string, size = 320): string {
  return (
    "https://api.qrserver.com/v1/create-qr-code/?size=" +
    `${size}x${size}&margin=8&data=${encodeURIComponent(uri)}`
  );
}

export interface UtrValidationResult {
  ok: boolean;
  reason?: "empty" | "too_short" | "invalid_chars" | "too_long";
}

/** Loose UTR validation — 6-24 alphanumeric characters. */
export function validateUtr(input: string | null | undefined): UtrValidationResult {
  const v = (input ?? "").trim();
  if (!v) return { ok: false, reason: "empty" };
  if (v.length < 6) return { ok: false, reason: "too_short" };
  if (v.length > 24) return { ok: false, reason: "too_long" };
  if (!/^[A-Za-z0-9]+$/.test(v)) return { ok: false, reason: "invalid_chars" };
  return { ok: true };
}

/** ms until a payment request expires. Negative when already expired. */
export function msUntilExpiry(expiresAt: string, now: Date = new Date()): number {
  return new Date(expiresAt).getTime() - now.getTime();
}

export function isRequestActive(status: ManualPaymentStatus): boolean {
  return status === "CREATED" || status === "SUBMITTED" || status === "UNDER_REVIEW";
}

export const MANUAL_PAYMENT_PROVIDER = "manual_upi" as const;

/** Status → color helper for UI badges. */
export function statusTone(status: ManualPaymentStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "CREATED":
      return { label: "Awaiting payment", className: "bg-white/5 text-muted-foreground border-white/10" };
    case "SUBMITTED":
      return { label: "Submitted — pending review", className: "bg-amber-500/15 text-amber-300 border-amber-400/30" };
    case "UNDER_REVIEW":
      return { label: "Under review", className: "bg-sky-500/15 text-sky-300 border-sky-400/30" };
    case "APPROVED":
      return { label: "Approved — active", className: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" };
    case "REJECTED":
      return { label: "Rejected", className: "bg-red-500/15 text-red-300 border-red-400/30" };
    case "EXPIRED":
      return { label: "Expired", className: "bg-white/5 text-muted-foreground border-white/10" };
    case "CANCELED":
      return { label: "Canceled", className: "bg-white/5 text-muted-foreground border-white/10" };
  }
}

export interface ManualPaymentRow {
  id: string;
  user_id: string;
  payment_reference: string;
  requested_plan: string;
  billing_cycle: string;
  expected_amount: number;
  currency: string;
  upi_id: string;
  payee_name: string | null;
  utr_number: string | null;
  payment_date: string | null;
  payment_app: string | null;
  amount_paid: number | null;
  screenshot_url: string | null;
  user_note: string | null;
  admin_note: string | null;
  rejection_reason: string | null;
  status: string;
  submitted_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export function mapRow(row: ManualPaymentRow): ManualPaymentRequest {
  return {
    id: row.id,
    userId: row.user_id,
    paymentReference: row.payment_reference,
    requestedPlan: row.requested_plan as PaidPlanId,
    billingCycle: row.billing_cycle as BillingCycle,
    expectedAmount: row.expected_amount,
    currency: row.currency,
    upiId: row.upi_id,
    payeeName: row.payee_name,
    utrNumber: row.utr_number,
    paymentDate: row.payment_date,
    paymentApp: row.payment_app,
    amountPaid: row.amount_paid,
    screenshotUrl: row.screenshot_url,
    userNote: row.user_note,
    adminNote: row.admin_note,
    rejectionReason: row.rejection_reason,
    status: row.status as ManualPaymentStatus,
    submittedAt: row.submitted_at,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}