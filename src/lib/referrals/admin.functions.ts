// Phase 44 — Admin server functions for referrals.
// Uses supabaseAdmin to sign private bucket URLs so admins can preview
// the screenshot proof uploaded under `{user_id}/referrals/...`.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "payment-proofs";
const EXPIRES_IN = 5 * 60; // 5 minutes

export const adminReferralScreenshotUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { path: string }) => data)
  .handler(async ({ data, context }): Promise<{ url: string; expiresIn: number }> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "admin" },
    );
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("forbidden");
    const path = data.path?.trim();
    if (!path) throw new Error("invalid_path");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, EXPIRES_IN);
    if (error) throw new Error(error.message);
    if (!signed?.signedUrl) throw new Error("sign_failed");
    return { url: signed.signedUrl, expiresIn: EXPIRES_IN };
  });