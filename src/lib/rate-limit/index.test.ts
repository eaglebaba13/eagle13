import { describe, expect, it } from "vitest";
import { evaluateRateLimit, RATE_LIMIT_VERSION } from "./index";

describe("rate-limit", () => {
  it("allows first request", () => {
    const r = evaluateRateLimit({ nowMs: 1000, windowMs: 60_000, maxRequests: 5, recentRequestsMs: [] });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
    expect(r.nextTimestamps).toEqual([1000]);
  });
  it("blocks after hitting the max", () => {
    const r = evaluateRateLimit({
      nowMs: 10_000, windowMs: 60_000, maxRequests: 3,
      recentRequestsMs: [1_000, 2_000, 3_000],
    });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterMs).toBe(51_000);
  });
  it("expires old timestamps", () => {
    const r = evaluateRateLimit({
      nowMs: 120_000, windowMs: 60_000, maxRequests: 3,
      recentRequestsMs: [1_000, 2_000, 3_000],
    });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });
  it("version stable", () => {
    expect(RATE_LIMIT_VERSION).toBe("rate-limit@1.0.0");
  });
});