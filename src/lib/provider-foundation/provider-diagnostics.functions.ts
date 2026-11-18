import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, assertAuth } from "@/integrations/supabase/auth-middleware";

export const getProviderDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAuth(context);
    let isAdmin = false;
    try {
      const res = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      isAdmin = !!res.data;
    } catch {
      isAdmin = false;
    }
    if (!isAdmin) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      const role = userRes?.user?.user_metadata?.role;
      const email = userRes?.user?.email?.toLowerCase();
      const isSuper = role === "admin" || role === "superadmin" || email === "lwillshivansh@gmail.com" || email === "dheerajnarula13@gmail.com";
      if (!isSuper) throw new Error("forbidden");
    }

    const { buildProviderDiagnosticsReport, buildProviderDiagnosticsFailureReport } =
      await import("./provider-diagnostics.server");
    try {
      return await buildProviderDiagnosticsReport();
    } catch (error) {
      return buildProviderDiagnosticsFailureReport(error);
    }
  });
