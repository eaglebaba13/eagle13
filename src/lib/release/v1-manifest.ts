// Phase 4B — v1.0.0 deployment manifest (machine-readable, deterministic).
//
// Pure data. No secrets. Consumed by tests, status page, and admin
// launch-readiness. Bump VERSION only via a release event.

export const V1_VERSION = "1.0.0" as const;
export const V1_RELEASE_CHANNEL = "stable" as const;
export const V1_BUILD_TIMESTAMP = "2026-07-18T00:00:00Z" as const;

export interface V1Manifest {
  readonly version: typeof V1_VERSION;
  readonly channel: typeof V1_RELEASE_CHANNEL;
  readonly buildTimestamp: string;
  readonly commitSha: string | null;
  readonly buildId: string | null;
  readonly environment: "production" | "staging" | "development" | "unknown";
  readonly formulaVersions: Readonly<Record<string, string>>;
  readonly providers: readonly string[];
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly tradingFlags: Readonly<Record<string, false>>;
  readonly healthEndpoints: readonly string[];
  readonly legalRoutes: readonly string[];
  readonly knownLimitations: readonly string[];
  readonly requiredMigrations: readonly string[];
}

export const V1_MANIFEST: V1Manifest = {
  version: V1_VERSION,
  channel: V1_RELEASE_CHANNEL,
  buildTimestamp: V1_BUILD_TIMESTAMP,
  commitSha: null,
  buildId: null,
  environment: "unknown",
  formulaVersions: {
    astro: "astro@1.0.0",
    gann: "gann@1.0.0",
    gti: "gti@1.0.0",
    decision: "decision@1.0.0",
  },
  providers: ["upstox", "coindcx-marketdata"],
  featureFlags: {
    dashboard: true,
    optionsChain: true,
    institutionalFlow: true,
    researchLab: true,
    backtestLab: true,
    coindcxMarketData: true,
    smartAlerts: true,
    aiMarketAssistant: true,
    pricing: true,
    billingManualVerification: true,
    adminDiagnostics: true,
  },
  tradingFlags: {
    LIVE_ORDER_ENABLED: false,
    BROKER_ORDER_EXECUTION_ENABLED: false,
    COINDCX_TRADING_ENABLED: false,
  },
  healthEndpoints: ["/status", "/admin/launch-readiness", "/admin/system-status"],
  legalRoutes: ["/privacy", "/terms", "/risk", "/release-notes", "/status"],
  knownLimitations: [
    "Research-only platform; no live order execution",
    "No broker order routing",
    "CoinDCX integration is public market-data only",
    "Tokenized metals are not physical spot gold/silver",
    "Historical results do not guarantee future outcomes",
    "Billing/license requires manual admin verification",
    "Provider outages may cause stale/unavailable states",
  ],
  requiredMigrations: [],
};

export function manifestContainsSecrets(m: V1Manifest = V1_MANIFEST): boolean {
  const s = JSON.stringify(m).toLowerCase();
  return /("|_)(secret|password|service_role|api[_-]?key|token)("|_)/.test(s);
}

export function manifestTradingSafe(m: V1Manifest = V1_MANIFEST): boolean {
  return Object.values(m.tradingFlags).every((v) => v === false);
}