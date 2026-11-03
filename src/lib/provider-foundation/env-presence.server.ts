// Server-only. Redacted environment-presence diagnostic for the Upstox provider.
// NEVER return values — only PRESENT / MISSING / PLACEHOLDER / INVALID statuses.

export type EnvPresenceStatus = "PRESENT" | "MISSING" | "PLACEHOLDER" | "INVALID";
export type RuntimeEnvironment = "preview" | "production" | "development";

export interface ProviderEnvPresence {
  readonly UPSTOX_MARKET_DATA_MODE: EnvPresenceStatus;
  readonly UPSTOX_API_KEY: EnvPresenceStatus;
  readonly UPSTOX_API_SECRET: EnvPresenceStatus;
  readonly UPSTOX_ACCESS_TOKEN: EnvPresenceStatus;
  readonly UPSTOX_ANALYTICS_TOKEN: EnvPresenceStatus;
  readonly runtimeEnvironment: RuntimeEnvironment;
  readonly deploymentRestartRequired: boolean;
}

export interface ProviderEnvPresenceInput {
  readonly UPSTOX_MARKET_DATA_MODE?: string;
  readonly UPSTOX_API_KEY?: string;
  readonly UPSTOX_API_SECRET?: string;
  readonly UPSTOX_ACCESS_TOKEN?: string;
  readonly UPSTOX_ANALYTICS_TOKEN?: string;
  readonly Upstox_Analytics_Token?: string;
  readonly NODE_ENV?: string;
  readonly MODE?: string;
  readonly DEPLOYMENT_ENVIRONMENT?: string;
}

const PLACEHOLDER_PATTERNS = [
  /^changeme$/i,
  /^todo$/i,
  /^placeholder$/i,
  /^xxxx+$/i,
  /^your[-_ ]?(token|key|secret)$/i,
  /^sandbox[-_ ]?token$/i,
];

function classifySecret(v: string | undefined | null): EnvPresenceStatus {
  if (v == null) return "MISSING";
  const t = String(v).trim();
  if (!t) return "MISSING";
  if (PLACEHOLDER_PATTERNS.some((rx) => rx.test(t))) return "PLACEHOLDER";
  return "PRESENT";
}

function classifyMode(v: string | undefined | null): EnvPresenceStatus {
  if (v == null || !String(v).trim()) return "MISSING";
  const t = String(v).trim().toLowerCase();
  if (t === "live" || t === "mock" || t === "disabled" || t === "development") return "PRESENT";
  return "INVALID";
}

function detectRuntime(env: ProviderEnvPresenceInput): RuntimeEnvironment {
  const deployment = (env.DEPLOYMENT_ENVIRONMENT ?? "").toLowerCase();
  if (deployment === "preview") return "preview";
  if (deployment === "production") return "production";
  if (deployment === "development") return "development";
  const node = (env.NODE_ENV ?? env.MODE ?? "").toLowerCase();
  if (node === "development") return "development";
  if (node === "production") return "production";
  return "preview";
}

/** Redacted environment-presence snapshot for admin diagnostics. */
export function evaluateProviderEnvPresence(env: ProviderEnvPresenceInput): ProviderEnvPresence {
  const mode = classifyMode(env.UPSTOX_MARKET_DATA_MODE);
  const apiKey = classifySecret(env.UPSTOX_API_KEY);
  const apiSecret = classifySecret(env.UPSTOX_API_SECRET);
  const accessToken = classifySecret(env.UPSTOX_ACCESS_TOKEN);
  const analyticsToken = classifySecret(env.UPSTOX_ANALYTICS_TOKEN ?? env.Upstox_Analytics_Token);
  const liveToken = analyticsToken === "PRESENT" ? analyticsToken : accessToken;
  const runtimeEnvironment = detectRuntime(env);

  // Heuristic: the platform requires a redeploy/restart after secret changes.
  // Show the hint when the mode is configured for live but any credential is
  // MISSING or PLACEHOLDER — the user likely saved secrets that have not yet
  // been injected into the current running deployment.
  const modeIsLive = (env.UPSTOX_MARKET_DATA_MODE ?? "").trim().toLowerCase() === "live";
  const anyMissing = liveToken !== "PRESENT";
  const deploymentRestartRequired = modeIsLive && anyMissing;

  return {
    UPSTOX_MARKET_DATA_MODE: mode,
    UPSTOX_API_KEY: apiKey,
    UPSTOX_API_SECRET: apiSecret,
    UPSTOX_ACCESS_TOKEN: accessToken,
    UPSTOX_ANALYTICS_TOKEN: analyticsToken,
    runtimeEnvironment,
    deploymentRestartRequired,
  };
}

/** Live mode is configured when an Analytics or legacy access token is present. */
export function liveCredentialsComplete(p: ProviderEnvPresence): boolean {
  return (
    p.UPSTOX_MARKET_DATA_MODE === "PRESENT" &&
    (p.UPSTOX_ANALYTICS_TOKEN === "PRESENT" || p.UPSTOX_ACCESS_TOKEN === "PRESENT")
  );
}
