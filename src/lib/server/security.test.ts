import { describe, it, expect, beforeEach } from "vitest";
import {
  classifyRouteTier,
  getClientIp,
  checkRateLimit,
  resetRateLimiter,
  RATE_LIMIT_TIERS,
} from "./rate-limiter.server";
import {
  applySecurityHeaders,
  ZERO_TRUST_SECURITY_HEADERS,
  MASKED_SERVER_HEADERS,
} from "./security-headers";

describe("Platform Security Hardening — Rate Limiter & Security Headers", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  describe("1. Route Tier Classification", () => {
    it("classifies auth and sensitive endpoints to AUTH tier", () => {
      expect(classifyRouteTier("/auth")).toBe("AUTH");
      expect(classifyRouteTier("/auth/callback")).toBe("AUTH");
      expect(classifyRouteTier("/login")).toBe("AUTH");
      expect(classifyRouteTier("/login/")).toBe("AUTH");
      expect(classifyRouteTier("/api/auth/session")).toBe("AUTH");
      expect(classifyRouteTier("/admin/users")).toBe("AUTH");
      expect(classifyRouteTier("/admin/payments")).toBe("AUTH");
      expect(classifyRouteTier("/admin/plans")).toBe("AUTH");
    });

    it("classifies market data and screener endpoints to MARKET_DATA tier", () => {
      expect(classifyRouteTier("/api/quotes")).toBe("MARKET_DATA");
      expect(classifyRouteTier("/chronowheel")).toBe("MARKET_DATA");
      expect(classifyRouteTier("/unicorn-radar")).toBe("MARKET_DATA");
      expect(classifyRouteTier("/live-chart")).toBe("MARKET_DATA");
      expect(classifyRouteTier("/live-levels")).toBe("MARKET_DATA");
      expect(classifyRouteTier("/options-chain")).toBe("MARKET_DATA");
      expect(classifyRouteTier("/options-analytics")).toBe("MARKET_DATA");
      expect(classifyRouteTier("/option-strategy")).toBe("MARKET_DATA");
      expect(classifyRouteTier("/market-breadth")).toBe("MARKET_DATA");
      expect(classifyRouteTier("/backtest")).toBe("MARKET_DATA");
    });

    it("bypasses static assets from rate limiting", () => {
      expect(classifyRouteTier("/_build/assets/client-abc123.js")).toBe("BYPASS");
      expect(classifyRouteTier("/assets/styles.css")).toBe("BYPASS");
      expect(classifyRouteTier("/favicon.png")).toBe("BYPASS");
      expect(classifyRouteTier("/logo.svg")).toBe("BYPASS");
      expect(classifyRouteTier("/font.woff2")).toBe("BYPASS");
    });

    it("classifies general content to GENERAL tier", () => {
      expect(classifyRouteTier("/")).toBe("GENERAL");
      expect(classifyRouteTier("/terms")).toBe("GENERAL");
      expect(classifyRouteTier("/privacy")).toBe("GENERAL");
      expect(classifyRouteTier("/release-notes")).toBe("GENERAL");
    });
  });

  describe("2. Client IP Resolution", () => {
    it("extracts client IP from x-forwarded-for header", () => {
      const headers = new Headers({ "x-forwarded-for": "203.0.113.195, 70.41.3.18" });
      expect(getClientIp(headers)).toBe("203.0.113.195");
    });

    it("extracts client IP from x-real-ip when x-forwarded-for is missing", () => {
      const headers = new Headers({ "x-real-ip": "198.51.100.22" });
      expect(getClientIp(headers)).toBe("198.51.100.22");
    });

    it("extracts client IP from cf-connecting-ip", () => {
      const headers = new Headers({ "cf-connecting-ip": "192.0.2.1" });
      expect(getClientIp(headers)).toBe("192.0.2.1");
    });

    it("falls back to 127.0.0.1 when no proxy headers exist", () => {
      const headers = new Headers();
      expect(getClientIp(headers)).toBe("127.0.0.1");
    });
  });

  describe("3. Sliding-Window Rate Limiting Enforcement", () => {
    it("enforces max 10 requests per minute on AUTH tier", () => {
      const ip = "192.168.1.50";
      const makeReq = () =>
        new Request("https://eaglebaba.lwill.in/auth", {
          headers: { "x-real-ip": ip },
        });

      // 10 requests should succeed
      for (let i = 1; i <= RATE_LIMIT_TIERS.AUTH.max; i++) {
        const result = checkRateLimit(makeReq());
        expect(result.allowed).toBe(true);
        expect(result.tier).toBe("AUTH");
        expect(result.remaining).toBe(RATE_LIMIT_TIERS.AUTH.max - i);
      }

      // 11th request must be blocked with 429 semantics
      const blocked = checkRateLimit(makeReq());
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfter).toBeGreaterThan(0);
      expect(blocked.retryAfter).toBeLessThanOrEqual(60);
    });

    it("enforces max 60 requests per minute on MARKET_DATA tier", () => {
      const ip = "10.0.0.99";
      const makeReq = () =>
        new Request("https://eaglebaba.lwill.in/chronowheel", {
          headers: { "x-real-ip": ip },
        });

      // 60 requests should succeed
      for (let i = 1; i <= RATE_LIMIT_TIERS.MARKET_DATA.max; i++) {
        const result = checkRateLimit(makeReq());
        expect(result.allowed).toBe(true);
        expect(result.tier).toBe("MARKET_DATA");
      }

      // 61st request must be rejected
      const blocked = checkRateLimit(makeReq());
      expect(blocked.allowed).toBe(false);
      expect(blocked.tier).toBe("MARKET_DATA");
      expect(blocked.retryAfter).toBeGreaterThan(0);
    });

    it("isolates quotas across distinct client IPs", () => {
      const reqIp1 = new Request("https://eaglebaba.lwill.in/auth", {
        headers: { "x-real-ip": "1.1.1.1" },
      });
      const reqIp2 = new Request("https://eaglebaba.lwill.in/auth", {
        headers: { "x-real-ip": "2.2.2.2" },
      });

      // Exhaust IP 1
      for (let i = 0; i < RATE_LIMIT_TIERS.AUTH.max; i++) {
        checkRateLimit(reqIp1);
      }
      expect(checkRateLimit(reqIp1).allowed).toBe(false);

      // IP 2 is unaffected
      const resIp2 = checkRateLimit(reqIp2);
      expect(resIp2.allowed).toBe(true);
      expect(resIp2.remaining).toBe(RATE_LIMIT_TIERS.AUTH.max - 1);
    });

    it("resets sliding-window quota once window expires", () => {
      const ip = "172.16.0.5";
      const baseTime = 1700000000000;
      const makeReq = () =>
        new Request("https://eaglebaba.lwill.in/auth", {
          headers: { "x-real-ip": ip },
        });

      // Exhaust 10 requests at baseTime
      for (let i = 0; i < 10; i++) {
        checkRateLimit(makeReq(), baseTime);
      }
      expect(checkRateLimit(makeReq(), baseTime).allowed).toBe(false);

      // 61 seconds later, new requests must be allowed
      const futureTime = baseTime + 61 * 1000;
      const futureResult = checkRateLimit(makeReq(), futureTime);
      expect(futureResult.allowed).toBe(true);
      expect(futureResult.remaining).toBe(9);
    });
  });

  describe("4. Zero-Trust Security Headers & Masking", () => {
    it("injects all mandatory institutional security headers", () => {
      const headers = new Headers();
      applySecurityHeaders(headers);

      expect(headers.get("Strict-Transport-Security")).toBe(
        ZERO_TRUST_SECURITY_HEADERS["Strict-Transport-Security"],
      );
      expect(headers.get("X-Frame-Options")).toBe("DENY");
      expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(headers.get("Permissions-Policy")).toBe(
        "camera=(), microphone=(), geolocation=(), payment=()",
      );
      expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
      expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
      expect(headers.get("Content-Security-Policy")).toContain("https://s3.tradingview.com");
    });

    it("strips fingerprinting headers completely", () => {
      const headers = new Headers({
        "x-powered-by": "Express / Vite / TanStack Start",
        server: "nginx/1.24.0",
        "x-nitro-cache": "HIT",
        "x-nitro-version": "2.9.0",
        "content-type": "text/html",
      });

      applySecurityHeaders(headers);

      for (const name of MASKED_SERVER_HEADERS) {
        expect(headers.has(name)).toBe(false);
      }
      expect(headers.get("content-type")).toBe("text/html");
    });
  });
});
