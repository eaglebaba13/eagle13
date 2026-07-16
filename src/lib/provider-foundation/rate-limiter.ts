// Deterministic token-bucket rate limiter. Time is passed in as ms so the
// limiter is testable without wall-clock coupling.

export interface RateLimiterConfig {
  readonly capacity: number;
  readonly refillPerSec: number;
}

export interface RateLimiterState {
  tokens: number;
  lastRefillMs: number;
}

export class RateLimiter {
  private readonly cfg: RateLimiterConfig;
  private readonly state: RateLimiterState;

  private initialized = false;
  constructor(cfg: RateLimiterConfig, initial?: Partial<RateLimiterState>) {
    this.cfg = cfg;
    this.state = {
      tokens: initial?.tokens ?? cfg.capacity,
      lastRefillMs: initial?.lastRefillMs ?? 0,
    };
    if (initial?.lastRefillMs !== undefined) this.initialized = true;
  }

  tryConsume(nowMs: number, cost = 1): { ok: boolean; retryAfterMs: number; remaining: number } {
    this.refill(nowMs);
    if (this.state.tokens >= cost) {
      this.state.tokens -= cost;
      return { ok: true, retryAfterMs: 0, remaining: Math.floor(this.state.tokens) };
    }
    const deficit = cost - this.state.tokens;
    const retryAfterMs = Math.ceil((deficit / this.cfg.refillPerSec) * 1000);
    return { ok: false, retryAfterMs, remaining: Math.floor(this.state.tokens) };
  }

  snapshot(nowMs: number): { limit: number; remaining: number; resetAtMs: number } {
    this.refill(nowMs);
    const missing = this.cfg.capacity - this.state.tokens;
    const resetAtMs =
      missing <= 0 ? nowMs : nowMs + Math.ceil((missing / this.cfg.refillPerSec) * 1000);
    return {
      limit: this.cfg.capacity,
      remaining: Math.floor(this.state.tokens),
      resetAtMs,
    };
  }

  private refill(nowMs: number): void {
    if (!this.initialized) {
      this.state.lastRefillMs = nowMs;
      this.initialized = true;
      return;
    }
    const elapsedSec = Math.max(0, (nowMs - this.state.lastRefillMs) / 1000);
    if (elapsedSec <= 0) return;
    this.state.tokens = Math.min(
      this.cfg.capacity,
      this.state.tokens + elapsedSec * this.cfg.refillPerSec,
    );
    this.state.lastRefillMs = nowMs;
  }
}
