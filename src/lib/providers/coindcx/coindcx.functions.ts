// Phase 3F — CoinDCX server functions. Public-safe RPCs.
// Market-data only. No trading, no auth-required endpoints.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CoindcxSupportedInterval } from "./endpoints";

export const listCoindcxMarkets = createServerFn({ method: "GET" }).handler(async () => {
  const { getMarketSnapshots } = await import("./coindcx.server");
  const nowIso = new Date().toISOString();
  const snapshots = await getMarketSnapshots(nowIso);
  return { generatedAt: nowIso, snapshots };
});

export const getCoindcxCandles = createServerFn({ method: "GET" })
  .inputValidator((raw: { pair: string; interval: CoindcxSupportedInterval }) => {
    if (!raw || typeof raw.pair !== "string" || raw.pair.length === 0) {
      throw new Error("INVALID_PAIR");
    }
    const allowed: readonly CoindcxSupportedInterval[] = ["1m", "5m", "15m", "1h", "1d"];
    if (!allowed.includes(raw.interval)) throw new Error("INVALID_INTERVAL");
    return { pair: raw.pair, interval: raw.interval };
  })
  .handler(async ({ data }) => {
    const { getCandleSnapshot } = await import("./coindcx.server");
    return getCandleSnapshot({ pair: data.pair, interval: data.interval, nowIso: new Date().toISOString() });
  });

export const getCoindcxDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("forbidden");
    const { discoverMarkets, getLastDiscovery, getLastError } = await import("./coindcx.server");
    const { buildCoindcxDiagnostics } = await import("./diagnostics");
    const nowIso = new Date().toISOString();
    const { markets } = await discoverMarkets(nowIso);
    const last = getLastDiscovery();
    return buildCoindcxDiagnostics({
      markets,
      lastDiscoveryAt: last?.at ?? null,
      lastDiscoveryLatencyMs: last?.latencyMs ?? null,
      lastError: getLastError(),
      nowIso,
    });
  });
