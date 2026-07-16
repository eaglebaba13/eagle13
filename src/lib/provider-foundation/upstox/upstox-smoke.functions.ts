import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only Upstox live-provider smoke test. Read-only. Never returns
 * API keys, secrets, tokens, or Authorization headers.
 */
export const testUpstoxProvider = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("forbidden");

    // Dynamic import: server-only module MUST NOT ship to the client bundle.
    const { runUpstoxSmokeTest } = await import("./upstox-smoke.server");
    return runUpstoxSmokeTest();
  });