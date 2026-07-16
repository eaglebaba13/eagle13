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
import {
  evaluateProviderEnvPresence,
  liveCredentialsComplete,
  type ProviderEnvPresence,
  type ProviderEnvPresenceInput,
} from "./env-presence.server";

export interface ProviderDiagnosticsEnv extends TokenPolicyEnv {
  readonly NODE_ENV?: string;
  readonly MODE?: string;
  readonly LOVABLE_ENVIRONMENT?: string;
}

export type ProviderConfigurationStatus =
  | "LIVE_ACTIVE"
  | "LIVE_PROVIDER_CONFIGURATION_INCOMPLETE"
  | "MOCK_ACTIVE"
  | "SECRETS_SAVED_REDEPLOY_REQUIRED"
  | "NOT_CONFIGURED";

export interface ProviderDiagnosticsReport {
  readonly at: string;
  readonly providerSelected: string | null;
  readonly adapterVersion: string | null;
  readonly realProviderActive: boolean;
  readonly mockActive: boolean;
  readonly fallbackReason: string | null;
  readonly tokenStatus: ReturnType<typeof evaluateUpstoxTokenPolicy>;
  readonly envPresence: ProviderEnvPresence;
  readonly configurationStatus: ProviderConfigurationStatus;
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
    LOVABLE_ENVIRONMENT: p.LOVABLE_ENVIRONMENT,
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

/** Live/mock/development mode is only entered when the operator opts in. */
function isExplicitMockMode(env: ProviderDiagnosticsEnv): boolean {
  const raw = (env.UPSTOX_MARKET_DATA_MODE ?? "").trim().toLowerCase();
  return raw === "mock" || raw === "disabled" || raw === "development";
}

function toPresenceInput(env: ProviderDiagnosticsEnv): ProviderEnvPresenceInput {
  return {
    UPSTOX_MARKET_DATA_MODE: env.UPSTOX_MARKET_DATA_MODE,
    UPSTOX_API_KEY: env.UPSTOX_API_KEY,
    UPSTOX_API_SECRET: env.UPSTOX_API_SECRET,
    UPSTOX_ACCESS_TOKEN: env.UPSTOX_ACCESS_TOKEN,
    NODE_ENV: env.NODE_ENV,
    MODE: env.MODE,
    LOVABLE_ENVIRONMENT: env.LOVABLE_ENVIRONMENT,
  };
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
  const envPresence = evaluateProviderEnvPresence(toPresenceInput(env));
  const liveReady = tokenStatus.mode === "live" && tokenStatus.tokenUsable;
  const modeIsLive = tokenStatus.mode === "live";
  const explicitMock = isExplicitMockMode(env);
  // Never silently fall back to mock in live mode: the operator explicitly
  // requested live market-data. Mock is only allowed when development or
  // mock mode is explicitly selected.
  const mockAllowed = explicitMock || (isDevelopment(env) && !modeIsLive);

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
        envPresence,
        configurationStatus: "LIVE_ACTIVE",
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
        envPresence,
        configurationStatus: "MOCK_ACTIVE",
        supportedSymbols: UPSTOX_SUPPORTED_SYMBOLS,
        supportedIntervals: SUPPORTED_INTERVALS,
        instrumentMaster: instrumentMasterInfo(at),
        diagnostics: manager.diagnostics(),
        safeError: null,
      };
    }

    const manager = new ProviderManager({ startedAt: at, primary: "none" });
    const configurationStatus: ProviderConfigurationStatus = modeIsLive
      ? envPresence.deploymentRestartRequired && !liveCredentialsComplete(envPresence)
        ? "SECRETS_SAVED_REDEPLOY_REQUIRED"
        : "LIVE_PROVIDER_CONFIGURATION_INCOMPLETE"
      : "NOT_CONFIGURED";
    return {
      at,
      providerSelected: null,
      adapterVersion: null,
      realProviderActive: false,
      mockActive: false,
      fallbackReason: tokenStatus.reason,
      tokenStatus,
      envPresence,
      configurationStatus,
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
  const envPresence = evaluateProviderEnvPresence(toPresenceInput(env));
  const manager = new ProviderManager({ startedAt: at, primary: "none" });
  return {
    at,
    providerSelected: null,
    adapterVersion: null,
    realProviderActive: false,
    mockActive: false,
    fallbackReason: "provider diagnostics failed",
    tokenStatus,
    envPresence,
    configurationStatus: "NOT_CONFIGURED",
    supportedSymbols: UPSTOX_SUPPORTED_SYMBOLS,
    supportedIntervals: SUPPORTED_INTERVALS,
    instrumentMaster: instrumentMasterInfo(at),
    diagnostics: manager.diagnostics(),
    safeError: redactProviderError(error),
  };
}
