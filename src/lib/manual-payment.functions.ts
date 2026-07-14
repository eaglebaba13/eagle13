/**
 * Phase 20.3C — Trusted server functions for the manual UPI payment flow.
 *
 * ALL amounts, UPI IDs, payment references and status transitions are
 * decided server-side. The browser can only send:
 *   - requested plan
 *   - billing cycle
 *   - (later) UTR / screenshot path / user note for a request it already owns.
 *
 * `supabaseAdmin` is loaded inside handlers only (never at module scope)
 * because this file is reachable from the client module graph.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getManualPaymentConfig,
  resolveAmountPaise,
  type BillingCycle,
  type PaidPlanId,
} from "./manual-payment-config";
import {
  generatePaymentReference,
  mapRow,
  validateUtr,
  type ManualPaymentRequest,
  type ManualPaymentRow,
} from "./manual-payment";

const planCycleSchema = z.object({
  plan: z.enum(["pro", "professional"]),
  cycle: z.enum(["monthly", "annual"]),
});

const utrSchema = z.object({
  id: z.string().uuid(),
  utr: z.string().min(6).max(24).regex(/^[A-Za-z0-9]+$/),
  paymentDate: z.string().datetime().optional().nullable(),
  amountPaidPaise: z.number().int().positive().max(100000000),
  paymentApp: z.string().max(40).optional().nullable(),
  screenshotPath: z.string().max(512).optional().nullable(),
  userNote: z.string().max(500).optional().nullable(),
});

const idOnly = z.object({ id: z.string().uuid() });

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("forbidden");
}

export const createManualPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => planCycleSchema.parse(v))
  .handler(async ({ data, context }): Promise<ManualPaymentRequest> => {
    const cfg = getManualPaymentConfig();
    const plan = data.plan as PaidPlanId;
    const cycle = data.cycle as BillingCycle;
    const amountPaise = resolveAmountPaise(plan, cycle, cfg);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const active = await supabaseAdmin
      .from("manual_payment_requests")
      .select("id,status")
      .eq("user_id", context.userId)
      .eq("requested_plan", plan)
      .eq("billing_cycle", cycle)
      .in("status", ["CREATED", "SUBMITTED", "UNDER_REVIEW"])
      .maybeSingle();
    if (active.data) throw new Error("duplicate_active_request");

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const reference = generatePaymentReference(plan);
      const { data: row, error } = await supabaseAdmin.rpc("create_manual_payment_request", {
        _plan: plan,
        _cycle: cycle,
        _amount: amountPaise,
        _currency: cfg.currency,
        _upi_id: cfg.upiId,
        _payee_name: cfg.payeeName,
        _reference: reference,
      });
      if (!error && row) return mapRow(row as unknown as ManualPaymentRow);
      lastErr = error;
      if (error && !`${error.message}`.includes("payment_reference")) break;
    }
    throw new Error(
      `create_failed:${(lastErr as { message?: string } | null)?.message ?? "unknown"}`,
    );
  });

export const submitManualPaymentUtr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => utrSchema.parse(v))
  .handler(async ({ data, context }): Promise<ManualPaymentRequest> => {
    const check = validateUtr(data.utr);
    if (!check.ok) throw new Error(`invalid_utr:${check.reason}`);
    const { data: row, error } = await context.supabase.rpc(
      "submit_manual_payment_utr",
      {
        _id: data.id,
        _utr: data.utr,
        _payment_date: (data.paymentDate ?? null) as unknown as string,
        _amount_paid: data.amountPaidPaise,
        _payment_app: (data.paymentApp ?? null) as unknown as string,
        _screenshot_url: (data.screenshotPath ?? null) as unknown as string,
        _user_note: (data.userNote ?? null) as unknown as string,
      },
    );
    if (error) throw new Error(error.message);
    return mapRow(row as unknown as ManualPaymentRow);
  });

export const cancelManualPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => idOnly.parse(v))
  .handler(async ({ data, context }): Promise<ManualPaymentRequest> => {
    const { data: row, error } = await context.supabase.rpc("cancel_manual_payment_request", {
      _id: data.id,
    });
    if (error) throw new Error(error.message);
    return mapRow(row as unknown as ManualPaymentRow);
  });

export const listMyManualPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManualPaymentRequest[]> => {
    const { data, error } = await context.supabase
      .from("manual_payment_requests")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => mapRow(r as unknown as ManualPaymentRow));
  });

export const getManualPaymentEnvelope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => planCycleSchema.parse(v))
  .handler(async ({ data }) => {
    const cfg = getManualPaymentConfig();
    const plan = data.plan as PaidPlanId;
    const cycle = data.cycle as BillingCycle;
    return {
      plan,
      cycle,
      amountPaise: resolveAmountPaise(plan, cycle, cfg),
      currency: cfg.currency,
      upiId: cfg.upiId,
      payeeName: cfg.payeeName,
      bankName: cfg.bankName,
      supportEmail: cfg.supportEmail,
      supportPhone: cfg.supportPhone,
      instructions: cfg.instructions,
      requestTtlHours: cfg.requestTtlHours,
      approvalSlaHours: cfg.approvalSlaHours,
      qrImageOverride: cfg.qrImageOverride,
    };
  });

export const adminListManualPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z.object({ status: z.string().optional() }).partial().parse(v ?? {}),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ rows: ManualPaymentRequest[]; duplicateUtrs: string[] }> => {
      await assertAdmin(context.supabase, context.userId);
      let q = context.supabase
        .from("manual_payment_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (data.status) q = q.eq("status", data.status as never);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      const mapped = (rows ?? []).map((r) => mapRow(r as unknown as ManualPaymentRow));
      const counts = new Map<string, number>();
      for (const r of mapped) {
        if (!r.utrNumber) continue;
        counts.set(r.utrNumber, (counts.get(r.utrNumber) ?? 0) + 1);
      }
      const duplicateUtrs = Array.from(counts.entries())
        .filter(([, n]) => n > 1)
        .map(([utr]) => utr);
      return { rows: mapped, duplicateUtrs };
    },
  );

export const adminMarkManualPaymentUnderReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => idOnly.parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc(
      "admin_mark_manual_payment_under_review",
      { _id: data.id },
    );
    if (error) throw new Error(error.message);
    return mapRow(row as unknown as ManualPaymentRow);
  });

export const adminApproveManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({ id: z.string().uuid(), adminNote: z.string().max(500).optional().nullable() })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("admin_approve_manual_payment", {
      _id: data.id,
      _admin_note: (data.adminNote ?? null) as unknown as string,
    });
    if (error) throw new Error(error.message);
    return mapRow(row as unknown as ManualPaymentRow);
  });

export const adminRejectManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z.object({ id: z.string().uuid(), reason: z.string().min(3).max(500) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("admin_reject_manual_payment", {
      _id: data.id,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return mapRow(row as unknown as ManualPaymentRow);
  });

export const adminSignScreenshotUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ path: z.string().min(3).max(512) }).parse(v))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("payment-proofs")
      .createSignedUrl(data.path, 60 * 10);
    if (error || !signed) throw new Error(error?.message ?? "sign_failed");
    return { url: signed.signedUrl };
  });
