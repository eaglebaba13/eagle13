import { describe, it, expect } from "vitest";
import {
  generatePaymentReference,
  buildUpiUri,
  validateUtr,
  isRequestActive,
  statusTone,
  mapRow,
  msUntilExpiry,
  type ManualPaymentRow,
} from "./manual-payment";
import {
  getManualPaymentConfig,
  resolveAmountPaise,
  formatRupees,
  isPaidPlan,
  isBillingCycle,
} from "./manual-payment-config";

describe("manual payment reference", () => {
  it("has correct shape EB-<PLAN>-YYYYMMDD-<5>", () => {
    const ref = generatePaymentReference("pro", new Date("2026-07-14T00:00:00Z"));
    expect(ref).toMatch(/^EB-PRO-20260714-[A-Z0-9]{5}$/);
  });
  it("uses PROFESSIONAL segment for professional plan", () => {
    const ref = generatePaymentReference("professional", new Date("2026-01-02T00:00:00Z"));
    expect(ref).toMatch(/^EB-PROFESSIONAL-20260102-[A-Z0-9]{5}$/);
  });
  it("has no ambiguous 0/O/1/I characters in the suffix", () => {
    for (let i = 0; i < 50; i++) {
      const suffix = generatePaymentReference("pro").split("-").pop()!;
      expect(suffix).not.toMatch(/[0O1I]/);
    }
  });
});

describe("UPI URI builder", () => {
  it("encodes payee name and reference", () => {
    const uri = buildUpiUri({
      upiId: "eaglebaba@upi",
      payeeName: "EagleBABA",
      amountRupees: 999,
      reference: "EB-PRO-20260714-ABCDE",
    });
    expect(uri.startsWith("upi://pay?")).toBe(true);
    expect(uri).toContain("pa=eaglebaba%40upi");
    expect(uri).toContain("pn=EagleBABA");
    expect(uri).toContain("am=999.00");
    expect(uri).toContain("cu=INR");
    expect(uri).toContain("tn=EB-PRO-20260714-ABCDE");
  });
});

describe("UTR validation", () => {
  it("rejects empty / short / long / non-alphanumeric", () => {
    expect(validateUtr("").ok).toBe(false);
    expect(validateUtr("abc").ok).toBe(false);
    expect(validateUtr("a".repeat(30)).ok).toBe(false);
    expect(validateUtr("ABC 123").ok).toBe(false);
    expect(validateUtr("abc-123").ok).toBe(false);
  });
  it("accepts normal UTR values", () => {
    expect(validateUtr("123456789012").ok).toBe(true);
    expect(validateUtr("UPI2026ABCDEF").ok).toBe(true);
  });
});

describe("config amount resolution", () => {
  const cfg = getManualPaymentConfig();
  it("returns paise for supported plans", () => {
    expect(resolveAmountPaise("pro", "monthly", cfg)).toBe(99900);
    expect(resolveAmountPaise("pro", "annual", cfg)).toBe(999000);
    expect(resolveAmountPaise("professional", "monthly", cfg)).toBe(249900);
    expect(resolveAmountPaise("professional", "annual", cfg)).toBe(2499000);
  });
  it("guards paid plan and billing cycle predicates", () => {
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("enterprise")).toBe(false);
    expect(isBillingCycle("monthly")).toBe(true);
    expect(isBillingCycle("weekly")).toBe(false);
  });
  it("formats paise as rupees", () => {
    expect(formatRupees(99900)).toContain("999");
  });
});

describe("status helpers", () => {
  it("classifies active statuses", () => {
    expect(isRequestActive("CREATED")).toBe(true);
    expect(isRequestActive("SUBMITTED")).toBe(true);
    expect(isRequestActive("UNDER_REVIEW")).toBe(true);
    expect(isRequestActive("APPROVED")).toBe(false);
    expect(isRequestActive("REJECTED")).toBe(false);
    expect(isRequestActive("EXPIRED")).toBe(false);
    expect(isRequestActive("CANCELED")).toBe(false);
  });
  it("returns a tone for every status", () => {
    for (const s of [
      "CREATED",
      "SUBMITTED",
      "UNDER_REVIEW",
      "APPROVED",
      "REJECTED",
      "EXPIRED",
      "CANCELED",
    ] as const) {
      const t = statusTone(s);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.className.length).toBeGreaterThan(0);
    }
  });
});

describe("row mapping and expiry", () => {
  const row: ManualPaymentRow = {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    payment_reference: "EB-PRO-20260714-ABCDE",
    requested_plan: "pro",
    billing_cycle: "monthly",
    expected_amount: 99900,
    currency: "INR",
    upi_id: "eaglebaba@upi",
    payee_name: "EagleBABA",
    utr_number: null,
    payment_date: null,
    payment_app: null,
    amount_paid: null,
    screenshot_url: null,
    user_note: null,
    admin_note: null,
    rejection_reason: null,
    status: "CREATED",
    submitted_at: null,
    verified_at: null,
    verified_by: null,
    expires_at: "2026-07-15T00:00:00Z",
    created_at: "2026-07-14T00:00:00Z",
    updated_at: "2026-07-14T00:00:00Z",
  };
  it("maps snake_case row into camelCase entity", () => {
    const m = mapRow(row);
    expect(m.paymentReference).toBe("EB-PRO-20260714-ABCDE");
    expect(m.expectedAmount).toBe(99900);
    expect(m.requestedPlan).toBe("pro");
    expect(m.billingCycle).toBe("monthly");
    expect(m.status).toBe("CREATED");
  });
  it("computes ms until expiry (positive when future)", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    expect(msUntilExpiry("2026-07-15T00:00:00Z", now)).toBeGreaterThan(0);
    expect(msUntilExpiry("2026-07-14T00:00:00Z", now)).toBeLessThan(0);
  });
});