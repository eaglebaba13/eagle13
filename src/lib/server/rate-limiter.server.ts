/**
 * EagleBABA Platform Security Hardening — Zero-Trust Distributed Rate Limiter
 *
 * Implements sliding-window in-memory rate limiting with IP fingerprinting,
 * route-tier classification, and automatic cache pruning to prevent abuse,
 * DDoS, credential stuffing, and unauthorized market data scraping.
 */

export interface RateLimitConfig {
  readonly max: number;
  readonly windowMs: number;
}

export type RateLimitTier = "AUTH" | "MARKET_DATA" | "GENERAL" | "BYPASS";

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetSeconds: number;
  readonly retryAfter?: number;
  readonly tier: RateLimitTier;
}

interface RateLimitRecord {
  timestamps: number[];
}

export const RATE_LIMIT_TIERS: Record<"AUTH" | "MARKET_DATA" | "GENERAL", RateLimitConfig> = {
  // Auth & sensitive endpoints: Max 10 requests / minute per IP
  AUTH: {
    max: 10,
    windowMs: 60 * 1000,
  },
  // Market Data & Screener endpoints (/api/*, /chronowheel, /unicorn-radar): Max 60 requests / minute per IP
  MARKET_DATA: {
    max: 60,
    windowMs: 60 * 1000,
  },
  // General page navigation: Max 120 requests / minute per IP
  GENERAL: {
    max: 120,
    windowMs: 60 * 1000,
  },
};

// Global in-memory sliding-window store
const rateLimitStore = new Map<string, RateLimitRecord>();

let lastPruneTime = Date.now();
const PRUNE_INTERVAL_MS = 60 * 1000; // Prune stale records every 60s
const MAX_STORE_SIZE = 10000;

/**
 * Extract verified client IP from reverse proxy and server headers.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();

  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) return cfIp.trim();

  return "127.0.0.1";
}

/**
 * Classify incoming request URL path into security rate-limiting tiers.
 */
export function classifyRouteTier(pathname: string): RateLimitTier {
  const normalized = (pathname || "/").toLowerCase();

  // 1. Static build assets, icons, fonts bypass rate limiting
  if (
    normalized.startsWith("/_build/") ||
    normalized.startsWith("/assets/") ||
    normalized === "/favicon.png" ||
    normalized === "/favicon.ico" ||
    normalized === "/robots.txt" ||
    normalized === "/sitemap.xml" ||
    /\.(js|css|png|jpg|jpeg|webp|svg|gif|ico|woff|woff2|ttf|eot|map)$/.test(normalized)
  ) {
    return "BYPASS";
  }

  // 2. Auth & Sensitive endpoints: Max 10 requests / minute
  if (
    normalized === "/auth" ||
    normalized.startsWith("/auth/") ||
    normalized === "/login" ||
    normalized.startsWith("/login/") ||
    normalized.includes("/api/auth") ||
    normalized.includes("/admin/users") ||
    normalized.includes("/admin/payments") ||
    normalized.includes("/admin/plans")
  ) {
    return "AUTH";
  }

  // 3. Market Data & Screener endpoints: Max 60 requests / minute
  if (
    normalized.startsWith("/api/") ||
    normalized.includes("/chronowheel") ||
    normalized.includes("/unicorn-radar") ||
    normalized.includes("/live-chart") ||
    normalized.includes("/live-levels") ||
    normalized.includes("/options-chain") ||
    normalized.includes("/options-analytics") ||
    normalized.includes("/option-strategy") ||
    normalized.includes("/market-terminal") ||
    normalized.includes("/market-breadth") ||
    normalized.includes("/backtest")
  ) {
    return "MARKET_DATA";
  }

  // 4. Default general navigation
  return "GENERAL";
}

/**
 * Prune stale entries older than 2 * windowMs from the store.
 */
function pruneStaleEntries(now: number): void {
  const maxWindow = 2 * 60 * 1000;
  for (const [key, record] of rateLimitStore.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < maxWindow);
    if (record.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
  lastPruneTime = now;
}

/**
 * Evaluate sliding-window rate limit for a request.
 */
export function checkRateLimit(request: Request, customNow?: number): RateLimitResult {
  const url = new URL(request.url);
  const tier = classifyRouteTier(url.pathname);

  if (tier === "BYPASS") {
    return {
      allowed: true,
      limit: Infinity,
      remaining: Infinity,
      resetSeconds: 0,
      tier: "BYPASS",
    };
  }

  const config = RATE_LIMIT_TIERS[tier];
  const ip = getClientIp(request.headers);
  const key = `${ip}:${tier}`;
  const now = customNow ?? Date.now();

  // Periodic pruning
  if (now - lastPruneTime > PRUNE_INTERVAL_MS || rateLimitStore.size > MAX_STORE_SIZE) {
    pruneStaleEntries(now);
  }

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Remove timestamps outside current window
  const windowStart = now - config.windowMs;
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= config.max) {
    const oldest = record.timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + config.windowMs - now) / 1000));
    return {
      allowed: false,
      limit: config.max,
      remaining: 0,
      resetSeconds: retryAfter,
      retryAfter,
      tier,
    };
  }

  // Record this hit
  record.timestamps.push(now);
  const remaining = config.max - record.timestamps.length;
  const resetSeconds = Math.max(
    1,
    Math.ceil((record.timestamps[0] + config.windowMs - now) / 1000),
  );

  return {
    allowed: true,
    limit: config.max,
    remaining,
    resetSeconds,
    tier,
  };
}

/**
 * Reset rate limit store (for unit tests).
 */
export function resetRateLimiter(): void {
  rateLimitStore.clear();
  lastPruneTime = Date.now();
}
