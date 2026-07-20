// Phase 3F.2B — TradingView provider spike. SERVER-ONLY (Node runtime).
// This file is intentionally suffixed `.server.ts` so it is stripped from
// client bundles. It uses `@mathieuc/tradingview`, which depends on `ws` and
// Node built-ins and does NOT run on Cloudflare workerd.
//
// It is loaded via a runtime dynamic import guarded by `/* @vite-ignore */`
// so bundlers do not statically pull the CommonJS chain into the Worker SSR
// graph. On Cloudflare the dynamic import fails and diagnostics surface the
// error — production build stays green.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TradingViewRatioSnapshot {
  readonly symbol: string;
  readonly value: number | null;
  readonly timestamp: string | null;
  readonly source: {
    readonly provider: "TradingView";
    readonly transport: "websocket";
    readonly anonymous: true;
    readonly description: string | null;
    readonly exchange: string | null;
    readonly currency: string | null;
  };
  readonly freshness: "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";
  readonly error: string | null;
}

let client: any = null;
let quoteSession: any = null;
let market: any = null;
let latest: TradingViewRatioSnapshot | null = null;
let importOk = false;
let importError: string | null = null;
let wsConnected = false;

const SYMBOL = "TVC:GOLDSILVER";

async function loadModule(): Promise<any> {
  // Variable indirection prevents Vite/Rollup from statically analysing.
  const modName = "@mathieuc/tradingview";
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const dyn = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    const mod = await dyn(modName);
    importOk = true;
    importError = null;
    return mod?.default ?? mod;
  } catch (err) {
    importOk = false;
    importError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

export async function connect(): Promise<void> {
  if (client) return;
  const TV = await loadModule();
  client = new TV.Client();
  wsConnected = true;
  client.onError?.((...args: unknown[]) => {
    importError = args.map(String).join(" ");
  });
  client.onDisconnected?.(() => {
    wsConnected = false;
  });
  quoteSession = new client.Session.Quote({ fields: "all" });
  market = new quoteSession.Market(SYMBOL);
  market.onData((data: any) => {
    const lp = typeof data?.lp === "number" ? data.lp : null;
    const lpTime = typeof data?.lp_time === "number" ? data.lp_time * 1000 : Date.now();
    latest = {
      symbol: SYMBOL,
      value: lp,
      timestamp: new Date(lpTime).toISOString(),
      source: {
        provider: "TradingView",
        transport: "websocket",
        anonymous: true,
        description: data?.description ?? data?.short_name ?? null,
        exchange: data?.exchange ?? null,
        currency: data?.currency_code ?? null,
      },
      freshness: lp == null ? "UNAVAILABLE" : "LIVE",
      error: null,
    };
  });
  market.onError?.((...err: unknown[]) => {
    importError = err.map(String).join(" ");
  });
}

export async function disconnect(): Promise<void> {
  try {
    market?.close?.();
    quoteSession?.delete?.();
    client?.end?.();
  } catch {
    /* noop */
  }
  market = null;
  quoteSession = null;
  client = null;
  wsConnected = false;
}

export async function getLatestGoldSilverRatio(
  timeoutMs = 5000,
): Promise<TradingViewRatioSnapshot> {
  await connect();
  if (latest?.value != null) return latest;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
    if (latest?.value != null) return latest;
  }
  return (
    latest ?? {
      symbol: SYMBOL,
      value: null,
      timestamp: null,
      source: {
        provider: "TradingView",
        transport: "websocket",
        anonymous: true,
        description: null,
        exchange: null,
        currency: null,
      },
      freshness: "UNAVAILABLE",
      error: "No data received within timeout",
    }
  );
}

export function getSpikeDiagnostics(): {
  importStatus: "OK" | "FAILED" | "NOT_ATTEMPTED";
  importError: string | null;
  websocketConnected: boolean;
  symbolResolved: boolean;
  latest: TradingViewRatioSnapshot | null;
} {
  const status: "OK" | "FAILED" | "NOT_ATTEMPTED" = importOk
    ? "OK"
    : importError
      ? "FAILED"
      : "NOT_ATTEMPTED";
  return {
    importStatus: status,
    importError,
    websocketConnected: wsConnected,
    symbolResolved: latest?.value != null,
    latest,
  };
}