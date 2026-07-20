// Phase 3F.2B — Admin-only server function that probes the TradingView spike.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTradingViewDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("forbidden");

    const startedAt = new Date().toISOString();
    try {
      const mod = await import("./provider.server");
      let latest = mod.getSpikeDiagnostics().latest;
      let attemptError: string | null = null;
      try {
        latest = await mod.getLatestGoldSilverRatio(4000);
      } catch (err) {
        attemptError = err instanceof Error ? err.message : String(err);
      }
      const diag = mod.getSpikeDiagnostics();
      return {
        startedAt,
        checkedAt: new Date().toISOString(),
        symbol: "TVC:GOLDSILVER",
        importStatus: diag.importStatus,
        importError: diag.importError,
        websocketConnected: diag.websocketConnected,
        symbolResolved: diag.symbolResolved,
        latest: latest ?? diag.latest,
        attemptError,
        runtimeCompatible: true as const,
      };
    } catch (err) {
      return {
        startedAt,
        checkedAt: new Date().toISOString(),
        symbol: "TVC:GOLDSILVER",
        importStatus: "FAILED" as const,
        importError: err instanceof Error ? err.message : String(err),
        websocketConnected: false,
        symbolResolved: false,
        latest: null,
        attemptError: err instanceof Error ? err.message : String(err),
        runtimeCompatible: false as const,
      };
    }
  });
