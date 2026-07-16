import {
  ALL_QUOTE_SYMBOLS,
  ProviderManager,
  createFactoryAdapter,
  type ManagerDiagnostics,
} from "./index";
import {
  UPSTOX_ADAPTER_ID,
  UPSTOX_ADAPTER_VERSION,
  buildUpstoxProviderAdapter,
  evaluateUpstoxTokenPolicy,
  instrumentMasterInfo,
  UPSTOX_SUPPORTED_SYMBOLS,
  type TokenPolicyEnv,
} from "./upstox";

export interface ProviderDiagnosticsEnv extends TokenPolicyEnv {
  readonly NODE_ENV?: string;
  readonly MODE?: string;
}

export interface ProviderDiagnosticsReport {
  readonly at: string;
  readonly providerSelected: string | null;
  readonly adapterVersion: string | null;
  readonly realProviderActive: boolean;
  readonly mockActive: boolean;
  readonly fallbackReason: string | null;
  readonly tokenStatus: ReturnType<typeof evaluateUpstoxTokenPolicy>;
  readonly supportedSymbols: readonly string[];
  readonly supportedIntervals: readonly string[];
  readonly instrumentMaster: ReturnType<typeof instrumentMasterInfo>;
  readonly diagnostics: ManagerDiagnostics;
  readonly safeError: string | null;
}

const SUPPORTED_INTERVALS = ["1m", "3m", "5m", "15m", "1h", "1d"] as const;

function readEnv(): ProviderDiagnosticsEnv {
  const p = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  return {
    UPSTOX_MARKET_DATA_MODE: p.UPSTOX_MARKET_DATA_MODE,
    UPSTOX_API_KEY: p.UPSTOX_API_KEY,
    UPSTOX_API_SECRET: p.UPSTOX_API_SECRET,
    UPSTOX_ACCESS_TOKEN: p.UPSTOX_ACCESS_TOKEN,
    UPSTOX_SANDBOX_ACCESS_TOKEN: p.UPSTOX_SANDBOX_ACCESS_TOKEN,
    NODE_ENV: p.NODE_ENV,
    MODE: p.MODE,
  };
}

function redactProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "provider diagnostics failed");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/access_token=[^&\s"']+/gi, "access_token=[REDACTED]")
    .replace(/UPSTOX_(API_KEY|API_SECRET|ACCESS_TOKEN)=[^\s"']+/gi, "UPSTOX_$1=[REDACTED]")
    .slice(0, 240);
}

function isDevelopment(env: ProviderDiagnosticsEnv): boolean {
  return env.NODE_ENV === "development" || env.MODE === "development";
}

export function buildMockProviderManager(startedAt: string): ProviderManager {
  const primary = createFactoryAdapter({
    id: "primary-mock",
    label: "Primary Mock",
    role: "PRIMARY",
    capability: { domain: "QUOTES", quotes: [...ALL_QUOTE_SYMBOLS] },
    quotes: {
      NIFTY50: { last: 25000, prevClose: 24900, ageSec: 5 },
      BANKNIFTY: { last: 55000, prevClose: 54800, ageSec: 5 },
      INDIA_VIX: { last: 12.5, prevClose: 12.9, ageSec: 5 },
      GOLD: { last: 71000, prevClose: 70900, ageSec: 10 },
      SILVER: { last: 91000, prevClose: 90900, ageSec: 10 },
      XAUUSD: { last: 2400, prevClose: 2395, currency: "USD", ageSec: 5 },
      BTC: { last: 68000, prevClose: 67500, currency: "USD", ageSec: 5 },
      CRUDEOIL: { last: 6800, prevClose: 6750, ageSec: 30 },
      NATURAL_GAS: { last: 260, prevClose: 258, ageSec: 30 },
      USDINR: { last: 83.5, prevClose: 83.4, ageSec: 20 },
    },
    latencyMs: 45,
  });
  const secondary = createFactoryAdapter({
    id: "secondary-mock",
    label: "Secondary Mock",
    role: "SECONDARY",
    capability: { domain: "QUOTES", quotes: [...ALL_QUOTE_SYMBOLS] },
    quotes: {
      NIFTY50: { last: 24990, prevClose: 24900, ageSec: 20 },
      BANKNIFTY: { last: 54990, prevClose: 54800, ageSec: 20 },
    },
    latencyMs: 120,
  });
  const manager = new ProviderManager({
    startedAt,
    primary: primary.id,
    secondary: secondary.id,
  });
  manager.register(primary);
  manager.register(secondary);
  manager.wire({
    domain: "QUOTES",
    primaryId: primary.id,
    secondaryId: secondary.id,
    rateLimit: { capacity: 60, refillPerSec: 5 },
  });
  return manager;
}

export function buildLiveUpstoxProviderManager(startedAt: string, env: TokenPolicyEnv): ProviderManager {
  const adapter = buildUpstoxProviderAdapter({ env });
  const manager = new ProviderManager({ startedAt, primary: adapter.id });
  manager.register(adapter);
  manager.wire({
    domain: "QUOTES",
    primaryId: adapter.id,
    secondaryId: null,
    rateLimit: { capacity: 30, refillPerSec: 2 },
  });
  manager.wire({
    domain: "HISTORICAL",
    primaryId: adapter.id,
    secondaryId: null,
    rateLimit: { capacity: 30, refillPerSec: 1 },
  });
  return manager;
}

export async function buildProviderDiagnosticsReport(opts: {
  readonly env?: ProviderDiagnosticsEnv;
  readonly nowIso?: string;
} = {}): Promise<ProviderDiagnosticsReport> {
  const at = opts.nowIso ?? new Date().toISOString();
  const env = opts.env ?? readEnv();
  const tokenStatus = evaluateUpstoxTokenPolicy(env);
  const liveReady = tokenStatus.mode === "live" && tokenStatus.tokenUsable;
  const credentialsMissing =
    !tokenStatus.tokenPresent || !tokenStatus.apiKeyConfigured || !tokenStatus.apiSecretConfigured;
  const mockAllowed = isDevelopment(env) || credentialsMissing;

  try {
    if (liveReady) {
      const manager = buildLiveUpstoxProviderManager(at, env);
      return {
        at,
        providerSelected: UPSTOX_ADAPTER_ID,
        adapterVersion: UPSTOX_ADAPTER_VERSION,
        realProviderActive: true,
        mockActive: false,
        fallbackReason: null,
        tokenStatus,
        supportedSymbols: UPSTOX_SUPPORTED_SYMBOLS,
        supportedIntervals: SUPPORTED_INTERVALS,
        instrumentMaster: instrumentMasterInfo(at),
        diagnostics: manager.diagnostics(),
        safeError: null,
      };
    }

    if (mockAllowed) {
      const manager = buildMockProviderManager(at);
      const nowMs = Date.parse(at);
      for (const symbol of ALL_QUOTE_SYMBOLS) {
        await manager.getQuote(symbol, { nowIso: at, nowMs, bypassCache: true });
      }
      return {
        at,
        providerSelected: "primary-mock",
        adapterVersion: null,
        realProviderActive: false,
        mockActive: true,
        fallbackReason: tokenStatus.tokenUsable ? "development mode" : tokenStatus.reason,
        tokenStatus,
        supportedSymbols: UPSTOX_SUPPORTED_SYMBOLS,
        supportedIntervals: SUPPORTED_INTERVALS,
        instrumentMaster: instrumentMasterInfo(at),
        diagnostics: manager.diagnostics(),
        safeError: null,
      };
    }

    const manager = new ProviderManager({ startedAt: at, primary: "none" });
    return {
      at,
      providerSelected: null,
      adapterVersion: null,
      realProviderActive: false,
      mockActive: false,
      fallbackReason: tokenStatus.reason,
      tokenStatus,
      supportedSymbols: UPSTOX_SUPPORTED_SYMBOLS,
      supportedIntervals: SUPPORTED_INTERVALS,
      instrumentMaster: instrumentMasterInfo(at),
      diagnostics: manager.diagnostics(),
      safeError: null,
    };
  } catch (error) {
    return buildProviderDiagnosticsFailureReport(error, { env, nowIso: at });
  }
}

export function buildProviderDiagnosticsFailureReport(
  error: unknown,
  opts: { readonly env?: ProviderDiagnosticsEnv; readonly nowIso?: string } = {},
): ProviderDiagnosticsReport {
  const at = opts.nowIso ?? new Date().toISOString();
  const env = opts.env ?? readEnv();
  const tokenStatus = evaluateUpstoxTokenPolicy(env);
  const manager = new ProviderManager({ startedAt: at, primary: "none" });
  return {
    at,
    providerSelected: null,
    adapterVersion: null,
    realProviderActive: false,
    mockActive: false,
    fallbackReason: "provider diagnostics failed",
    tokenStatus,
    supportedSymbols: UPSTOX_SUPPORTED_SYMBOLS,
    supportedIntervals: SUPPORTED_INTERVALS,
    instrumentMaster: instrumentMasterInfo(at),
    diagnostics: manager.diagnostics(),
    safeError: redactProviderError(error),
  };
}
