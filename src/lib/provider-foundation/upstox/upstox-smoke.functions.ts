import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only Upstox live-provider smoke test. Read-only. Never returns
 * API keys, secrets, tokens, or Authorization headers.
 */
export const testUpstoxProvider = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Dynamic import: server-only module MUST NOT ship to the client bundle.
    const { runUpstoxSmokeTest, buildUpstoxSmokeFailureReport, buildApplicationAuthFailureReport } =
      await import("./upstox-smoke.server");

    let isAdmin: boolean | null = null;
    try {
      const { data } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      isAdmin = data === true;
    } catch {
      isAdmin = null;
    }
    if (isAdmin !== true) {
      return buildApplicationAuthFailureReport(
        isAdmin === null ? "Admin role check failed." : "Admin role required.",
      );
    }

    try {
      return await runUpstoxSmokeTest();
    } catch (error) {
      return buildUpstoxSmokeFailureReport(error);
    }
  });