import { describe, it, expect } from "vitest";
import { classifyFreshness, isActionableFreshness, formatAge } from "./data-freshness";

const NOW = Date.parse("2026-07-16T10:00:00Z");
const iso = (ms: number) => new Date(NOW - ms).toISOString();

describe("Phase 24B · data freshness classification", () => {
  it("LIVE when age within expected interval", () => {
    const r = classifyFreshness({ providerTimestamp: iso(20_000), expectedUpdateMs: 30_000, now: NOW });
    expect(r.status).toBe("LIVE");
    expect(isActionableFreshness(r.status)).toBe(true);
  });
  it("FRESH when age within ~3x expected", () => {
    const r = classifyFreshness({ providerTimestamp: iso(60_000), expectedUpdateMs: 30_000, now: NOW });
    expect(r.status).toBe("FRESH");
    expect(isActionableFreshness(r.status)).toBe(true);
  });
  it("DELAYED when overdue by many intervals", () => {
    const r = classifyFreshness({ providerTimestamp: iso(4 * 60_000), expectedUpdateMs: 30_000, now: NOW });
    expect(r.status).toBe("DELAYED");
    expect(isActionableFreshness(r.status)).toBe(false);
  });
  it("STALE when beyond delayed threshold", () => {
    const r = classifyFreshness({ providerTimestamp: iso(60 * 60_000), expectedUpdateMs: 30_000, now: NOW });
    expect(r.status).toBe("STALE");
  });
  it("UNAVAILABLE when no timestamp", () => {
    const r = classifyFreshness({ expectedUpdateMs: 30_000, now: NOW });
    expect(r.status).toBe("UNAVAILABLE");
  });
  it("ERROR when data quality invalid", () => {
    const r = classifyFreshness({ providerTimestamp: iso(1000), dataQuality: "INVALID", expectedUpdateMs: 30_000, now: NOW });
    expect(r.status).toBe("ERROR");
  });
  it("provider DOWN → UNAVAILABLE", () => {
    const r = classifyFreshness({ providerTimestamp: iso(1000), providerStatus: "DOWN", expectedUpdateMs: 30_000, now: NOW });
    expect(r.status).toBe("UNAVAILABLE");
  });
  it("provider DEGRADED demotes LIVE → DELAYED", () => {
    const r = classifyFreshness({ providerTimestamp: iso(1000), providerStatus: "DEGRADED", expectedUpdateMs: 30_000, now: NOW });
    expect(r.status).toBe("DELAYED");
  });
  it("market closed softens STALE to DELAYED", () => {
    const r = classifyFreshness({ providerTimestamp: iso(60 * 60_000), marketSession: "CLOSED", expectedUpdateMs: 30_000, now: NOW });
    expect(r.status).toBe("DELAYED");
  });
  it("formatAge renders human-friendly units", () => {
    expect(formatAge(null)).toBe("—");
    expect(formatAge(5_000)).toBe("5s");
    expect(formatAge(120_000)).toBe("2m");
    expect(formatAge(2 * 3_600_000)).toBe("2h");
  });
});