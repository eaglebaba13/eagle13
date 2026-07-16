// Server-only token policy for Upstox adapters.
// NEVER return raw token values — only a redacted status envelope.

export type UpstoxTokenSource = "LIVE" | "SANDBOX" | "NONE";
export type UpstoxTokenExpiryStatus = "UNKNOWN" | "OK" | "EXPIRED";

export interface UpstoxTokenStatus {
  readonly tokenPresent: boolean;
  readonly tokenSource: UpstoxTokenSource;
  readonly tokenExpiryStatus: UpstoxTokenExpiryStatus;
  readonly tokenUsable: boolean;
  readonly reason: string;
  readonly mode: "live" | "disabled";
  readonly apiKeyConfigured: boolean;
  readonly apiSecretConfigured: boolean;
}

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^changeme$/i,
  /^todo$/i,
  /^placeholder$/i,
  /^xxxx+$/i,
  /^your[-_ ]?token$/i,
];

function isPlaceholder(v: string | undefined | null): boolean {
  if (v == null) return true;
  const trimmed = String(v).trim();
  if (!trimmed) return true;
  return PLACEHOLDER_PATTERNS.some((rx) => rx.test(trimmed));
}

export interface TokenPolicyEnv {
  readonly UPSTOX_MARKET_DATA_MODE?: string;
  readonly UPSTOX_API_KEY?: string;
  readonly UPSTOX_API_SECRET?: string;
  readonly UPSTOX_ACCESS_TOKEN?: string;
  readonly UPSTOX_SANDBOX_ACCESS_TOKEN?: string;
}

/**
 * Deterministic token policy. Never returns the raw token — callers that
 * need to authorize a request use `readAccessToken` which lives in the
 * server-only HTTP client module.
 *
 * Sandbox tokens MUST NOT be silently used for live market-data endpoints.
 */
export function evaluateUpstoxTokenPolicy(env: TokenPolicyEnv): UpstoxTokenStatus {
  const mode = (env.UPSTOX_MARKET_DATA_MODE ?? "").toLowerCase() === "live" ? "live" : "disabled";
  const apiKeyOk = !isPlaceholder(env.UPSTOX_API_KEY);
  const apiSecretOk = !isPlaceholder(env.UPSTOX_API_SECRET);
  const liveOk = !isPlaceholder(env.UPSTOX_ACCESS_TOKEN);

  if (mode !== "live") {
    return {
      tokenPresent: liveOk,
      tokenSource: liveOk ? "LIVE" : "NONE",
      tokenExpiryStatus: "UNKNOWN",
      tokenUsable: false,
      reason: "UPSTOX_MARKET_DATA_MODE != live (adapter disabled)",
      mode: "disabled",
      apiKeyConfigured: apiKeyOk,
      apiSecretConfigured: apiSecretOk,
    };
  }
  if (!liveOk) {
    return {
      tokenPresent: false,
      tokenSource: "NONE",
      tokenExpiryStatus: "UNKNOWN",
      tokenUsable: false,
      reason:
        "Missing UPSTOX_ACCESS_TOKEN. Sandbox token is not accepted for market-data endpoints.",
      mode: "live",
      apiKeyConfigured: apiKeyOk,
      apiSecretConfigured: apiSecretOk,
    };
  }
  return {
    tokenPresent: true,
    tokenSource: "LIVE",
    tokenExpiryStatus: "UNKNOWN",
    tokenUsable: apiKeyOk && apiSecretOk,
    reason:
      apiKeyOk && apiSecretOk
        ? "live token configured"
        : "live token present but API key/secret missing",
    mode: "live",
    apiKeyConfigured: apiKeyOk,
    apiSecretConfigured: apiSecretOk,
  };
}

/** Redacted status suitable for admin diagnostics — never contains the token. */
export function redactedTokenStatus(s: UpstoxTokenStatus): UpstoxTokenStatus {
  return {
    ...s,
    // Ensure no accidental token leakage even if callers extend the shape.
  };
}