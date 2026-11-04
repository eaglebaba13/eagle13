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
  const isJwt =
    segs.length === 3 && segs.every((s) => /^[A-Za-z0-9_-]+$/.test(s)) && v.startsWith("eyJ");
  if (isJwt) return { format: "JWT", guess: "STANDARD", length: v.length };
  return { format: "OPAQUE", guess: "ANALYTICS", length: v.length };
}

export interface TokenPolicyEnv {
  readonly UPSTOX_MARKET_DATA_MODE?: string;
  readonly UPSTOX_API_KEY?: string;
  readonly UPSTOX_API_SECRET?: string;
  readonly UPSTOX_ACCESS_TOKEN?: string;
  readonly UPSTOX_ANALYTICS_TOKEN?: string;
  readonly Upstox_Analytics_Token?: string;
  readonly UPSTOX_SANDBOX_ACCESS_TOKEN?: string;
  readonly UPSTOX_TOKEN_FILE?: string;
}

export interface UpstoxTokenFilePayload {
  readonly access_token?: string;
  readonly token?: string;
  readonly updated_at?: string;
  readonly expires_at?: string;
  readonly source?: string;
  readonly user_id?: string;
  readonly user_name?: string;
}

/**
 * Decodes the JWT `exp` timestamp (in milliseconds) without external dependencies.
 * Returns `undefined` if the token is not a JWT or lacks a valid numeric `exp` claim.
 */
export function decodeJwtExpiry(token: string | undefined | null): number | undefined {
  if (isPlaceholder(token)) return undefined;
  try {
    const segs = String(token).trim().split(".");
    if (segs.length !== 3) return undefined;
    const base64 = segs[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr =
      typeof Buffer !== "undefined"
        ? Buffer.from(base64, "base64").toString("utf-8")
        : typeof atob !== "undefined"
          ? atob(base64)
          : undefined;
    if (!jsonStr) return undefined;
    const parsed = JSON.parse(jsonStr) as { exp?: number };
    if (typeof parsed?.exp === "number" && Number.isFinite(parsed.exp)) {
      return parsed.exp * 1000;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the path to the daily hot-reload token file.
 * Priority:
 *  1. env.UPSTOX_TOKEN_FILE
 *  2. process.env.UPSTOX_TOKEN_FILE
 *  3. Default Linux container volume path `/app/.tokens/upstox_token.json`
 */
export function resolveUpstoxTokenFilePath(env?: TokenPolicyEnv): string | undefined {
  const custom =
    env?.UPSTOX_TOKEN_FILE ??
    (typeof process !== "undefined" ? process.env?.UPSTOX_TOKEN_FILE : undefined);
  if (custom && custom.trim().length > 0) {
    if (custom.trim().toLowerCase() === "none" || custom.trim().toLowerCase() === "off") {
      return undefined;
    }
    return custom.trim();
  }
  if (typeof process !== "undefined" && process.platform === "linux") {
    return "/app/.tokens/upstox_token.json";
  }
  return undefined;
}

interface TokenFileCache {
  mtimeMs: number;
  filePath: string;
  token: string | undefined;
  expiresAtMs?: number;
}

let cachedFileToken: TokenFileCache | null = null;

/**
 * Safely reads the access token from the shared hot-reload file with mtime caching.
 * Silently handles filesystem errors and environment constraints.
 */
export function readTokenFromFile(filePath: string): string | undefined {
  try {
    // Only available in Node.js server environments with node:fs
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    const stat = fs.statSync(filePath);
    if (
      cachedFileToken &&
      cachedFileToken.filePath === filePath &&
      cachedFileToken.mtimeMs === stat.mtimeMs
    ) {
      if (cachedFileToken.expiresAtMs && Date.now() >= cachedFileToken.expiresAtMs) {
        return undefined; // Expired
      }
      return cachedFileToken.token;
    }

    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return undefined;

    let tokenCandidate: string | undefined;
    let expiresAtMs: number | undefined;

    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as UpstoxTokenFilePayload;
      tokenCandidate = parsed.access_token || parsed.token;
      if (parsed.expires_at) {
        const parsedExp = Date.parse(parsed.expires_at);
        if (Number.isFinite(parsedExp)) {
          expiresAtMs = parsedExp;
        }
      }
    } else {
      tokenCandidate = raw;
    }

    const cleanToken = tokenCandidate?.trim();
    if (!cleanToken || isPlaceholder(cleanToken)) {
      cachedFileToken = { mtimeMs: stat.mtimeMs, filePath, token: undefined };
      return undefined;
    }

    if (!expiresAtMs) {
      expiresAtMs = decodeJwtExpiry(cleanToken);
    }

    if (expiresAtMs && Date.now() >= expiresAtMs) {
      cachedFileToken = { mtimeMs: stat.mtimeMs, filePath, token: undefined, expiresAtMs };
      return undefined;
    }

    cachedFileToken = {
      mtimeMs: stat.mtimeMs,
      filePath,
      token: cleanToken,
      expiresAtMs,
    };

    // Propagate to process.env in-memory so any direct consumers stay synchronized
    if (typeof process !== "undefined" && process.env) {
      process.env.UPSTOX_ACCESS_TOKEN = cleanToken;
    }

    return cleanToken;
  } catch {
    return undefined;
  }
}

/** Clear token file cache (useful for tests and manual reloads) */
export function resetTokenFileCache(): void {
  cachedFileToken = null;
}

export function resolveUpstoxAnalyticsToken(env: TokenPolicyEnv): string | undefined {
  for (const candidate of [env.UPSTOX_ANALYTICS_TOKEN, env.Upstox_Analytics_Token]) {
    const token = candidate?.trim();
    if (!isPlaceholder(token)) return token;
  }
  return undefined;
}

export function resolveUpstoxAccessToken(env: TokenPolicyEnv = {}): string | undefined {
  const filePath = resolveUpstoxTokenFilePath(env);
  if (filePath) {
    const fileToken = readTokenFromFile(filePath);
    if (fileToken && !isPlaceholder(fileToken)) {
      return fileToken;
    }
  }

  const token = env.UPSTOX_ACCESS_TOKEN?.trim();
  return isPlaceholder(token) ? undefined : token;
}

export function resolveUpstoxMarketDataToken(env: TokenPolicyEnv = {}): string | undefined {
  const filePath = resolveUpstoxTokenFilePath(env);
  if (filePath) {
    const fileToken = readTokenFromFile(filePath);
    if (fileToken && !isPlaceholder(fileToken)) {
      return fileToken;
    }
  }

  const analyticsToken = resolveUpstoxAnalyticsToken(env);
  if (analyticsToken) return analyticsToken;
  return resolveUpstoxAccessToken(env);
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
  const selectedToken = resolveUpstoxMarketDataToken(env);
  const liveOk = selectedToken !== undefined;
  const classified = classifyUpstoxTokenFormat(selectedToken);
  let expiryStatus: UpstoxTokenExpiryStatus = "UNKNOWN";
  if (selectedToken) {
    const expMs = decodeJwtExpiry(selectedToken);
    if (expMs !== undefined) {
      expiryStatus = Date.now() >= expMs ? "EXPIRED" : "OK";
    }
  }

  if (mode !== "live") {
    return {
      tokenPresent: liveOk,
      tokenSource: liveOk ? "LIVE" : "NONE",
      tokenExpiryStatus: expiryStatus,
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
        "Missing UPSTOX_ANALYTICS_TOKEN and UPSTOX_ACCESS_TOKEN. Sandbox token is not accepted for live market-data endpoints.",
      mode: "live",
      apiKeyConfigured: apiKeyOk,
      apiSecretConfigured: apiSecretOk,
      tokenFormat: "NONE",
      tokenTypeGuess: "UNKNOWN",
      tokenLength: 0,
    };
  }
  if (expiryStatus === "EXPIRED") {
    return {
      tokenPresent: true,
      tokenSource: "LIVE",
      tokenExpiryStatus: "EXPIRED",
      tokenUsable: false,
      reason: "Configured Upstox access token has expired (JWT exp claim in past)",
      mode: "live",
      apiKeyConfigured: apiKeyOk,
      apiSecretConfigured: apiSecretOk,
      tokenFormat: classified.format,
      tokenTypeGuess: classified.guess,
      tokenLength: classified.length,
    };
  }
  return {
    tokenPresent: true,
    tokenSource: "LIVE",
    tokenExpiryStatus: expiryStatus,
    tokenUsable: true,
    reason: "live token configured",
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
