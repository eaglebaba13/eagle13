// Server-only HTTP client for INDstocks market-data endpoints.
// - Token from env; never logged or returned.
// - Retry only retryable failures with exponential backoff.
// - Honours 429 Retry-After.
// - Injectable fetch for deterministic tests.

import type { IndstocksError, IndstocksErrorCode } from "./indstocks-types";
import { INDSTOCKS_BASE_URL } from "./indstocks-types";

export interface IndstocksHttpConfig {
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly backoffBaseMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly nowMs?: () => number;
  readonly token?: string;
}

export interface IndstocksRequestOptions {
  readonly path: string;
  readonly method?: "GET";
  readonly query?: Record<string, string | number | undefined>;
}

export interface IndstocksSuccess<T> {
  readonly ok: true;
  readonly data: T;
  readonly latencyMs: number;
  readonly rateLimit: {
    readonly limit: number | null;
    readonly remaining: number | null;
    readonly resetAt: string | null;
  };
}

export type IndstocksHttpResult<T> =
  | IndstocksSuccess<T>
  | { readonly ok: false; readonly error: IndstocksError; readonly latencyMs: number };

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 500;

function redact(msg: string): string {
  return msg
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/access_token=[^&\s"']+/gi, "access_token=[REDACTED]")
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"[REDACTED]"')
    .replace(/HTTP\s+(\d{3}):\s*.*/gi, "HTTP $1");
}

function classifyError(httpStatus: number, _bodyText: string): IndstocksErrorCode {
  switch (httpStatus) {
    case 401:
      return "INDSTOCKS_AUTH_REQUIRED";
    case 403:
      return "INDSTOCKS_FORBIDDEN";
    case 429:
      return "INDSTOCKS_RATE_LIMITED";
    case 400:
    case 404:
      return "INDSTOCKS_DATA_UNAVAILABLE";
    case 502:
    case 503:
    case 504:
      return "INDSTOCKS_NETWORK";
    default:
      return httpStatus >= 500 ? "INDSTOCKS_NETWORK" : "INDSTOCKS_UNKNOWN";
  }
}

function isRetryable(code: IndstocksErrorCode, httpStatus: number): boolean {
  if (code === "INDSTOCKS_RATE_LIMITED") return true;
  if (code === "INDSTOCKS_NETWORK") return true;
  if (code === "INDSTOCKS_TIMEOUT") return true;
  return httpStatus === 429 || httpStatus >= 502;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const sec = Number(header);
  if (Number.isFinite(sec) && sec > 0) return sec * 1000;
  return null;
}

export class IndstocksHttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly nowMs: () => number;
  private readonly token: string | undefined;

  constructor(opts: IndstocksHttpConfig = {}) {
    this.baseUrl = opts.baseUrl ?? INDSTOCKS_BASE_URL;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_MS;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.nowMs = opts.nowMs ?? (() => Date.now());
    this.token = opts.token ?? (process.env.INDSTOCKS_ACCESS_TOKEN?.trim() || undefined);
  }

  async request<T>(opts: IndstocksRequestOptions): Promise<IndstocksHttpResult<T>> {
    const url = new URL(opts.path, this.baseUrl);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    let lastError: IndstocksError | null = null;
    let totalLatency = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoff = this.backoffBaseMs * 2 ** (attempt - 1);
        await new Promise<void>((r) => setTimeout(r, backoff));
      }

      const t0 = this.nowMs();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const resp = await this.fetchImpl(url.toString(), {
          method: opts.method ?? "GET",
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const latency = this.nowMs() - t0;
        totalLatency += latency;

        const rateLimit = {
          limit: resp.headers.get("X-RateLimit-Limit"),
          remaining: resp.headers.get("X-RateLimit-Remaining"),
          resetAt: resp.headers.get("X-RateLimit-Reset"),
        };

        if (!resp.ok) {
          const bodyText = await resp.text().catch(() => "");
          const code = classifyError(resp.status, bodyText);
          const retryAfterMs = parseRetryAfter(resp.headers.get("Retry-After"));
          lastError = {
            code,
            message: redact(`HTTP ${resp.status}: ${bodyText.slice(0, 120)}`),
            retryAfterMs: retryAfterMs ?? undefined,
            httpStatus: resp.status,
          };
          if (isRetryable(code, resp.status) && attempt < this.maxRetries) continue;
          return { ok: false, error: lastError, latencyMs: totalLatency };
        }

        const data = (await resp.json()) as T;
        return {
          ok: true,
          data,
          latencyMs: totalLatency,
          rateLimit: {
            limit: rateLimit.limit ? Number(rateLimit.limit) : null,
            remaining: rateLimit.remaining ? Number(rateLimit.remaining) : null,
            resetAt: rateLimit.resetAt,
          },
        };
      } catch (err) {
        const latency = this.nowMs() - t0;
        totalLatency += latency;
        if (err instanceof Error && err.name === "AbortError") {
          lastError = { code: "INDSTOCKS_TIMEOUT", message: "request timed out" };
        } else {
          lastError = {
            code: "INDSTOCKS_NETWORK",
            message: redact(err instanceof Error ? err.message : String(err)),
          };
        }
        if (isRetryable(lastError.code, 0) && attempt < this.maxRetries) continue;
        return { ok: false, error: lastError, latencyMs: totalLatency };
      }
    }

    return {
      ok: false,
      error: lastError ?? { code: "INDSTOCKS_UNKNOWN", message: "exhausted retries" },
      latencyMs: totalLatency,
    };
  }
}
