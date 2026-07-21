// Phase 43 — Server functions for the INDmoney referral workflow.
// All privileged writes go through SECURITY DEFINER RPCs that
// re-check `has_role(auth.uid(),'admin')` server-side.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ReferralBroker, ReferralRequestRow } from "./types";

// --------- User: submit a claim ---------
export interface SubmitReferralInput {
  readonly broker: ReferralBroker;
  readonly referralCode: string;
  readonly brokerClientIdMasked: string;
  readonly screenshotUrl: string | null;
  readonly userNote: string | null;
  readonly declarationAccepted: boolean;
}

export const submitReferralRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SubmitReferralInput) => data)
  .handler(async ({ data, context }): Promise<ReferralRequestRow> => {
    if (!data.declarationAccepted) throw new Error("declaration_required");
    const code = (data.referralCode ?? "").trim();
    const clientId = (data.brokerClientIdMasked ?? "").trim();
    if (code.length < 3) throw new Error("invalid_code");
    if (clientId.length < 3) throw new Error("invalid_client_id");

    const { data: row, error } = await context.supabase.rpc(
      "submit_referral_request",
      {
        _broker: data.broker,
        _referral_code: code,
        _client_id_masked: clientId,
        // The RPC accepts nulls even though the generated types widen to string.
        _screenshot_url: (data.screenshotUrl ?? null) as unknown as string,
        _user_note: (data.userNote ?? null) as unknown as string,
        _declaration: true,
      },
    );
    if (error) throw new Error(error.message);

    // Notify admin via Telegram (fire and forget, never blocks the user).
    try {
      const { notifyAdminOfReferral } = await import("./telegram-notify.server");
      const created = row as unknown as ReferralRequestRow;
      await notifyAdminOfReferral({
        requestId: created.id,
        userId: created.user_id,
        userEmail: (context.claims.email as string | undefined) ?? null,
        broker: created.broker,
        referralCode: created.referral_code,
        clientIdMasked: created.broker_client_id_masked,
        hasScreenshot: Boolean(created.screenshot_url),
      });
    } catch (err) {
      console.error("[referrals] telegram notify wrapper failed:", err);
    }

    return row as unknown as ReferralRequestRow;
  });

// --------- User: list own history ---------
export const listMyReferralRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly ReferralRequestRow[]> => {
    const { data, error } = await context.supabase
      .from("referral_requests")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ReferralRequestRow[];
  });

// --------- User: cancel a pending request ---------
export const cancelReferralRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<ReferralRequestRow> => {
    const { data: row, error } = await context.supabase.rpc(
      "cancel_referral_request",
      { _id: data.id },
    );
    if (error) throw new Error(error.message);
    return row as unknown as ReferralRequestRow;
  });

// --------- Admin: list all ---------
export const listAdminReferralRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly ReferralRequestRow[]> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "admin" },
    );
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("forbidden");
    const { data, error } = await context.supabase
      .from("referral_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as ReferralRequestRow[];
  });

// --------- Admin: mark under review ---------
export const adminMarkReferralUnderReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<ReferralRequestRow> => {
    const { data: row, error } = await context.supabase.rpc(
      "admin_mark_referral_under_review",
      { _id: data.id },
    );
    if (error) throw new Error(error.message);
    return row as unknown as ReferralRequestRow;
  });

// --------- Admin: approve ---------
export const adminApproveReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; adminNote?: string | null }) => data)
  .handler(async ({ data, context }): Promise<ReferralRequestRow> => {
    const { data: row, error } = await context.supabase.rpc(
      "admin_approve_referral",
      {
        _id: data.id,
        _admin_note: (data.adminNote ?? null) as unknown as string,
      },
    );
    if (error) throw new Error(error.message);
    return row as unknown as ReferralRequestRow;
  });

// --------- Admin: reject ---------
export const adminRejectReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; reason: string }) => data)
  .handler(async ({ data, context }): Promise<ReferralRequestRow> => {
    if (!data.reason || data.reason.trim().length < 3) {
      throw new Error("reason_required");
    }
    const { data: row, error } = await context.supabase.rpc(
      "admin_reject_referral",
      { _id: data.id, _reason: data.reason.trim() },
    );
    if (error) throw new Error(error.message);
    return row as unknown as ReferralRequestRow;
  });