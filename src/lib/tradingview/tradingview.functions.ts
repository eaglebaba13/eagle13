// Phase 3F.2C — Admin-only diagnostics + public snapshot server functions
// backed by the isolated Node TradingView collector service.
//
// The Cloudflare app NEVER imports @mathieuc/tradingview. All Node-only work
// happens in `services/tradingview-ratio-collector/`.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CollectorSnapshot } from "./snapshot-contract";
import { buildSnapshot } from "./snapshot-contract";

/** Authenticated snapshot read for dashboard widgets. */
export const getCollectorGoldSilverRatio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<CollectorSnapshot> => {
    const mod = await import("./collector-client.server");
    return mod.getGoldSilverRatioSnapshot();
  });

/** Admin-only detailed diagnostics for /admin/tradingview. */
export const getTradingViewDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("forbidden");

    const startedAt = new Date().toISOString();
    const client = await import("./collector-client.server");
    const cfg = client.readCollectorConfig();

    let snapshot: CollectorSnapshot;
    let health: unknown = null;
    let healthError: string | null = null;

    if (!cfg.enabled || !cfg.urlConfigured || !cfg.tokenConfigured) {
      snapshot = buildSnapshot({
        symbol: "TVC:GOLDSILVER",
        ratio: null,
        marketTimestamp: null,
        receivedAtMs: null,
        now: Date.now(),
        connectionStatus: "DISABLED",
        reason: !cfg.enabled
          ? "Collector disabled"
          : "Collector URL or API token missing",
      });
    } else {
      snapshot = await client.getGoldSilverRatioSnapshot();
      try {
        const res = await fetch(cfg.baseUrl!.replace(/\/$/, "") + "/health", {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(3_000),
        });
        if (res.ok) health = await res.json();
        else healthError = `HTTP ${res.status}`;
      } catch (err) {
        healthError = err instanceof Error ? err.message : String(err);
      }
    }

    const diag = client.getCollectorDiagnostics();

    return {
      startedAt,
      checkedAt: new Date().toISOString(),
      symbol: "TVC:GOLDSILVER" as const,
      collector: {
        enabled: cfg.enabled,
        urlConfigured: cfg.urlConfigured,
        tokenConfigured: cfg.tokenConfigured,
        tokenMasked: cfg.tokenMasked,
        baseUrl: cfg.baseUrl,
      },
      snapshot,
      health,
      healthError,
      lastFetchAt: diag.lastFetchAt,
      lastSuccessAt: diag.lastSuccessAt,
      lastFailureReason: diag.lastFailureReason,
      cacheAgeMs: diag.cacheAgeMs,
    };
  });