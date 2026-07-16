// Server-only HTTP client for Upstox market-data endpoints.
// - Bearer auth from env; token never logged or returned.
// - Retry only retryable failures with exponential backoff.
// - Honours 429 Retry-After.
// - Typed error envelopes (see upstox-types.ts).
//
// The client accepts an injectable fetch so tests can drive it
// deterministically without hitting the network.

import type { UpstoxError, UpstoxErrorCode } from "./upstox-types";
import { evaluateUpstoxTokenPolicy, type TokenPolicyEnv } from "./upstox-token-policy.server";

export interface UpstoxHttpConfig {
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly backoffBaseMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly nowMs?: () => number;
  readonly env?: TokenPolicyEnv;
}

export interface UpstoxRequestOptions {
  readonly path: string;
  readonly method?: "GET" | "POST";
  readonly query?: Record<string, string | number | undefined>;
  readonly requestId?: string;
}

export interface UpstoxSuccess<T> {
  readonly ok: true;
  readonly data: T;
  readonly latencyMs: number;
  readonly requestId: string;
  readonly rateLimit: {
    readonly limit: number | null;
    readonly remaining: number | null;
    readonly resetAt: string | null;
  };
}

export type UpstoxHttpResult<T> = UpstoxSuccess<T> | { readonly ok: false; readonly error: UpstoxError; readonly latencyMs: number };

const DEFAULT_BASE_URL = "https://api.upstox.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 250;

// Never include these keys in serialized errors.
const SENSITIVE_KEYS = new Set(["authorization", "access_token", "api_key", "api_secret", "token"]);

function redact(msg: string): string {
  // Strip bearer tokens / long alphanumeric secrets from messages.
  return msg
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/access_token=[^&\s"']+/gi, "access_token=[REDACTED]")
    .replace(/"api[_-]?(key|secret)"\s*:\s*"[^"]+"/gi, '"api_$1":"[REDACTED]"');
}

function classifyStatus(status: number): { code: UpstoxErrorCode; retryable: boolean } {
  if (status === 401) return { code: "UPSTOX_AUTH_REQUIRED", retryable: false };
  if (status === 403) return { code: "UPSTOX_FORBIDDEN", retryable: false };
  if (status === 429) return { code: "UPSTOX_RATE_LIMITED", retryable: true };
  if (status === 400 || status === 404) return { code: "UPSTOX_DATA_UNAVAILABLE", retryable: false };
  if (status === 422) return { code: "UPSTOX_UNSUPPORTED_RANGE", retryable: false };
  if (status >= 500) return { code: "UPSTOX_UNKNOWN", retryable: true };
  return { code: "UPSTOX_UNKNOWN", retryable: false };
}

function parseRateLimit(h: Headers) {
  const limit = h.get("x-ratelimit-limit");
  const remaining = h.get("x-ratelimit-remaining");
  const resetAt = h.get("x-ratelimit-reset");
  return {
    limit: limit ? Number(limit) : null,
    remaining: remaining ? Number(remaining) : null,
    resetAt: resetAt ?? null,
  };
}

function parseRetryAfter(h: Headers): number | undefined {
  const raw = h.get("retry-after");
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function envOf(cfg: UpstoxHttpConfig): TokenPolicyEnv {
  if (cfg.env) return cfg.env;
  const p = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  return {
    UPSTOX_MARKET_DATA_MODE: p.UPSTOX_MARKET_DATA_MODE,
    UPSTOX_API_KEY: p.UPSTOX_API_KEY,
    UPSTOX_API_SECRET: p.UPSTOX_API_SECRET,
    UPSTOX_ACCESS_TOKEN: p.UPSTOX_ACCESS_TOKEN,
    UPSTOX_SANDBOX_ACCESS_TOKEN: p.UPSTOX_SANDBOX_ACCESS_TOKEN,
  };
}

function buildUrl(base: string, path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, base.endsWith("/") ? base : base + "/");
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v == null) continue;
      if (SENSITIVE_KEYS.has(k.toLowerCase())) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function nextRequestId(): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1e9).toString(36);
  return `upx-${t}-${r}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export class UpstoxHttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly env: TokenPolicyEnv;

  constructor(cfg: UpstoxHttpConfig = {}) {
    this.baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = cfg.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = cfg.backoffBaseMs ?? DEFAULT_BACKOFF_MS;
    this.fetchImpl = cfg.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.env = envOf(cfg);
  }

  tokenStatus() {
    return evaluateUpstoxTokenPolicy(this.env);
  }

  async request<T>(opts: UpstoxRequestOptions): Promise<UpstoxHttpResult<T>> {
    const status = this.tokenStatus();
    if (!status.tokenUsable) {
      return {
        ok: false,
        latencyMs: 0,
        error: {
          code: "UPSTOX_AUTH_REQUIRED",
          message: redact(status.reason),
          requestId: opts.requestId,
        },
      };
    }
    const token = this.env.UPSTOX_ACCESS_TOKEN!;
    const url = buildUrl(this.baseUrl, opts.path, opts.query);
    const requestId = opts.requestId ?? nextRequestId();

    let attempt = 0;
    let lastErr: UpstoxError = { code: "UPSTOX_UNKNOWN", message: "no attempts" };
    const started = Date.now();

    while (attempt <= this.maxRetries) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      const t0 = Date.now();
      try {
        const res = await this.fetchImpl(url, {
          method: opts.method ?? "GET",
          signal: ac.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "X-Request-Id": requestId,
          },
        });
        clearTimeout(timer);
        const latency = Date.now() - t0;

        if (res.ok) {
          let body: unknown;
          try {
            body = await res.json();
          } catch (e) {
            return {
              ok: false,
              latencyMs: latency,
              error: {
                code: "UPSTOX_SCHEMA_ERROR",
                message: redact(`malformed JSON: ${(e as Error).message}`),
                requestId,
              },
            };
          }
          return {
            ok: true,
            data: body as T,
            latencyMs: latency,
            requestId,
            rateLimit: parseRateLimit(res.headers),
          };
        }

        const cls = classifyStatus(res.status);
        const retryAfterMs = parseRetryAfter(res.headers);
        let bodyText = "";
        try {
          bodyText = await res.text();
        } catch {
          /* ignore */
        }
        lastErr = {
          code: cls.code,
          message: redact(`HTTP ${res.status}: ${bodyText.slice(0, 240)}`),
          retryAfterMs,
          requestId,
          httpStatus: res.status,
        };
        if (!cls.retryable || attempt === this.maxRetries) {
          return { ok: false, latencyMs: Date.now() - started, error: lastErr };
        }
      } catch (err) {
        clearTimeout(timer);
        const aborted = (err as { name?: string }).name === "AbortError";
        lastErr = {
          code: aborted ? "UPSTOX_TIMEOUT" : "UPSTOX_NETWORK",
          message: redact(aborted ? "request timed out" : (err as Error).message),
          requestId,
        };
        if (attempt === this.maxRetries) {
          return { ok: false, latencyMs: Date.now() - started, error: lastErr };
        }
      }
      const backoff = this.backoffBaseMs * Math.pow(2, attempt) + (lastErr.retryAfterMs ?? 0);
      await sleep(backoff);
      attempt += 1;
    }
    return { ok: false, latencyMs: Date.now() - started, error: lastErr };
  }
}

export { redact as redactUpstoxMessage };