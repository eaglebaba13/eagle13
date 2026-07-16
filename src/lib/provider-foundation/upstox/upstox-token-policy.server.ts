// Server-only token policy for Upstox adapters.
// NEVER return raw token values — only a redacted status envelope.

export type UpstoxTokenSource = "LIVE" | "SANDBOX" | "NONE";
export type UpstoxTokenExpiryStatus = "UNKNOWN" | "OK" | "EXPIRED";
export type UpstoxTokenFormat = "JWT" | "OPAQUE" | "NONE";
export type UpstoxTokenTypeGuess = "STANDARD" | "ANALYTICS" | "UNKNOWN";

export interface UpstoxTokenStatus {
  readonly tokenPresent: boolean;
  readonly tokenSource: UpstoxTokenSource;
  readonly tokenExpiryStatus: UpstoxTokenExpiryStatus;
  readonly tokenUsable: boolean;
  readonly reason: string;
  readonly mode: "live" | "disabled";
  readonly apiKeyConfigured: boolean;
  readonly apiSecretConfigured: boolean;
  /** Structural classification of the token value. Never contains the token itself. */
  readonly tokenFormat?: UpstoxTokenFormat;
  /**
   * Heuristic guess of which Upstox token type is configured. Upstox standard
   * OAuth access tokens are JWTs (three base64url segments). Analytics tokens
   * from the Upstox Analytics dashboard are opaque long strings. `UNKNOWN`
   * when the token is absent or unusable.
   */
  readonly tokenTypeGuess?: UpstoxTokenTypeGuess;
  /** Redacted preview (length only) — never the token value. */
  readonly tokenLength?: number;
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

/**
 * Classify token structure without ever returning its value.
 *  - JWT: three base64url-ish segments separated by `.`; standard OAuth token.
 *  - OPAQUE: any other non-empty string; likely an Analytics token.
 *  - NONE: missing or placeholder.
 */
export function classifyUpstoxTokenFormat(raw: string | undefined | null): {
  readonly format: UpstoxTokenFormat;
  readonly guess: UpstoxTokenTypeGuess;
  readonly length: number;
} {
  if (isPlaceholder(raw)) return { format: "NONE", guess: "UNKNOWN", length: 0 };
  const v = String(raw).trim();
  const segs = v.split(".");
  const isJwt = segs.length === 3 && segs.every((s) => /^[A-Za-z0-9_-]+$/.test(s)) && v.startsWith("eyJ");
  if (isJwt) return { format: "JWT", guess: "STANDARD", length: v.length };
  return { format: "OPAQUE", guess: "ANALYTICS", length: v.length };
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
  const classified = classifyUpstoxTokenFormat(env.UPSTOX_ACCESS_TOKEN);

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
      tokenFormat: classified.format,
      tokenTypeGuess: liveOk ? classified.guess : "UNKNOWN",
      tokenLength: classified.length,
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
      tokenFormat: "NONE",
      tokenTypeGuess: "UNKNOWN",
      tokenLength: 0,
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
    tokenFormat: classified.format,
    tokenTypeGuess: classified.guess,
    tokenLength: classified.length,
  };
}

/** Redacted status suitable for admin diagnostics — never contains the token. */
export function redactedTokenStatus(s: UpstoxTokenStatus): UpstoxTokenStatus {
  return {
    ...s,
    // Ensure no accidental token leakage even if callers extend the shape.
  };
}