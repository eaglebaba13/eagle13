import { describe, it, expect } from "vitest";
import type { OptionChainResult } from "../option-chain/provider";
import type { OptionChainSnapshot as UpstoxSnapshot } from "../option-chain/types";
import { makeStrike } from "../option-chain/types";
import { adaptUpstoxToLegacyChain, isAdaptedChainLive } from "./live-chain-adapter";

function fullSnapshot(overrides: Partial<UpstoxSnapshot> = {}): UpstoxSnapshot {
  const spot = 24000;
  const strikes = [];
  for (let i = -6; i <= 6; i++) {
    strikes.push(
      makeStrike(spot + i * 50, { oi: 1000 + i, changeOi: 10, volume: 500, ltp: 100 }, { oi: 900 + i, changeOi: -5, volume: 400, ltp: 90 }),
    );
  }
  return {
    instrument: "NIFTY",
    spotPrice: spot,
    timestamp: new Date().toISOString(),
    provider: "UPSTOX",
    expiry: "2026-07-24",
    availableExpiries: ["2026-07-24"],
    marketSession: "OPEN",
    dataQuality: "OK",
    strikes,
    ...overrides,
  };
}

function okResult(snap: UpstoxSnapshot): OptionChainResult {
  return {
    ok: true,
    snapshot: snap,
    meta: {
      providerId: "UPSTOX",
      status: "LIVE",
      latencyMs: 120,
      fetchedAt: snap.timestamp,
      safeError: null,
      upstreamCode: null,
    },
  };
}

function failResult(overrides: Partial<OptionChainResult["meta"]> = {}): OptionChainResult {
  return {
    ok: false,
    snapshot: null,
    meta: {
      providerId: "UPSTOX",
      status: "UNAVAILABLE",
      latencyMs: 10,
      fetchedAt: new Date().toISOString(),
      safeError: null,
      upstreamCode: null,
      ...overrides,
    },
  };
}

describe("adaptUpstoxToLegacyChain", () => {
  it("SUPPORTED for a full live snapshot", () => {
    const r = adaptUpstoxToLegacyChain("NIFTY", okResult(fullSnapshot()));
    expect(r.capability).toBe("SUPPORTED");
    expect(r.chain).not.toBeNull();
    expect(r.chain?.integrity.sourceStatus).toBe("LIVE");
    expect(r.chain?.snapshot.legs.length).toBeGreaterThan(20);
    expect(isAdaptedChainLive(r)).toBe(true);
  });

  it("AUTH_REQUIRED when provider status is AUTH_REQUIRED", () => {
    const r = adaptUpstoxToLegacyChain(
      "NIFTY",
      failResult({ status: "AUTH_REQUIRED", safeError: "unauthorized" }),
    );
    expect(r.capability).toBe("AUTH_REQUIRED");
    expect(r.chain).toBeNull();
    expect(isAdaptedChainLive(r)).toBe(false);
    expect(r.explainer.suggestion).toMatch(/Upstox access token/);
  });

  it("NO_DATA when provider returned empty payload", () => {
    const r = adaptUpstoxToLegacyChain(
      "NIFTY",
      failResult({ safeError: "empty option chain" }),
    );
    expect(r.capability).toBe("NO_DATA");
  });

  it("PARTIAL_CHAIN when call legs are missing", () => {
    const snap = fullSnapshot();
    const stripped: UpstoxSnapshot = {
      ...snap,
      strikes: snap.strikes.map((s) => makeStrike(s.strike, undefined, s.put)),
    };
    const r = adaptUpstoxToLegacyChain("NIFTY", okResult(stripped));
    expect(r.capability).toBe("PARTIAL_CHAIN");
    expect(r.chain).not.toBeNull();
    expect(r.chain?.integrity.sourceStatus).toBe("PARTIAL");
  });

  it("NO_STRIKES when snapshot has no strikes", () => {
    const snap: UpstoxSnapshot = { ...fullSnapshot(), strikes: [] };
    const r = adaptUpstoxToLegacyChain("NIFTY", okResult(snap));
    expect(r.capability).toBe("NO_STRIKES");
    expect(r.chain).toBeNull();
  });

  it("STALE when snapshot timestamp is old", () => {
    const oldTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const snap: UpstoxSnapshot = { ...fullSnapshot(), timestamp: oldTs };
    const r = adaptUpstoxToLegacyChain("NIFTY", okResult(snap));
    expect(r.capability).toBe("STALE");
  });

  it("PARTIAL when data quality flagged PARTIAL", () => {
    const snap: UpstoxSnapshot = { ...fullSnapshot(), dataQuality: "PARTIAL" };
    const r = adaptUpstoxToLegacyChain("NIFTY", okResult(snap));
    expect(r.capability).toBe("PARTIAL");
    expect(r.chain?.integrity.sourceStatus).toBe("PARTIAL");
  });

  it("preserves legacy shape fields consumed by Decision engine", () => {
    const r = adaptUpstoxToLegacyChain("NIFTY", okResult(fullSnapshot()));
    const chain = r.chain!;
    // Decision engine reads chain.snapshot.legs and chain.snapshot.spot.
    expect(Array.isArray(chain.snapshot.legs)).toBe(true);
    expect(typeof chain.snapshot.spot).toBe("number");
    // And gates on chain.integrity.sourceStatus !== "UNAVAILABLE" / isTradable.
    expect(chain.integrity.isTradable).toBe(true);
  });
});