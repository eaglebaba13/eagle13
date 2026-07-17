// Phase 30 — Deterministic sliding-window rate limiter.
//
// Pure. Callers pass in the current window's request timestamps; the
// limiter decides whether the new request is within budget. Suitable
// for embedding inside a server function that persists timestamps in
// a per-user store (DB, KV, cache). No I/O in this module.

export interface RateLimitInput {
  readonly nowMs: number;
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly recentRequestsMs: readonly number[];
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMs: number;
  readonly windowStartMs: number;
  readonly nextTimestamps: readonly number[];
  readonly formulaVersion: string;
}

export const RATE_LIMIT_VERSION = "rate-limit@1.0.0";

export function evaluateRateLimit(inp: RateLimitInput): RateLimitResult {
  const windowStart = inp.nowMs - inp.windowMs;
  const trimmed = inp.recentRequestsMs.filter((t) => t > windowStart);
  if (trimmed.length >= inp.maxRequests) {
    const oldest = trimmed[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + inp.windowMs - inp.nowMs),
      windowStartMs: windowStart,
      nextTimestamps: trimmed,
      formulaVersion: RATE_LIMIT_VERSION,
    };
  }
  const next = [...trimmed, inp.nowMs];
  return {
    allowed: true,
    remaining: inp.maxRequests - next.length,
    retryAfterMs: 0,
    windowStartMs: windowStart,
    nextTimestamps: next,
    formulaVersion: RATE_LIMIT_VERSION,
  };
}