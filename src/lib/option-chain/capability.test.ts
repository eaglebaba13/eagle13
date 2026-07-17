import { describe, it, expect } from "vitest";
import { evaluateOptionChainCapability, isValidExpiryFormat, type EvaluateCapabilityInput } from "./capability";
import { assessDataQuality } from "./data-quality";
import { makeStrike, type OptionChainSnapshot } from "./types";
import type { OptionChainProviderMeta } from "./provider";

function meta(over: Partial<OptionChainProviderMeta> = {}): OptionChainProviderMeta {
  return {
    providerId: "UPSTOX",
    status: "LIVE",
    latencyMs: 42,
    fetchedAt: "2026-07-17T04:00:00.000Z",
    safeError: null,
    upstreamCode: null,
    ...over,
  };
}

function goodSnap(over: Partial<OptionChainSnapshot> = {}): OptionChainSnapshot {
  const strikes = [24000, 24100, 24200, 24300, 24400, 24500].map((s) => makeStrike(s, { oi: 1000 }, { oi: 1000 }));
  return {
    instrument: "NIFTY",
    spotPrice: 24250,
    timestamp: "2026-07-17T04:00:00.000Z",
    provider: "UPSTOX",
    expiry: "2026-07-24",
    availableExpiries: ["2026-07-24"],
    marketSession: "OPEN",
    dataQuality: "OK",
    strikes,
    ...over,
  };
}

function ev(over: Partial<EvaluateCapabilityInput>): EvaluateCapabilityInput {
  return {
    underlying: "NIFTY",
    requestedExpiry: null,
    ok: true,
    snapshot: goodSnap(),
    quality: null,
    meta: meta(),
    nowIso: "2026-07-17T04:00:05.000Z",
    ...over,
  };
}

describe("option-chain capability", () => {
  it("valid supported snapshot", () => {
    const snap = goodSnap();
    const c = evaluateOptionChainCapability(ev({ snapshot: snap, quality: assessDataQuality(snap, { nowIso: "2026-07-17T04:00:05.000Z" }) }));
    expect(c.status).toBe("SUPPORTED");
    expect(c.retryable).toBe(false);
    expect(c.failingStage).toBeNull();
    expect(c.providerAlias).toBe("Options Provider");
    expect(c.resolvedExpiry).toBe("2026-07-24");
  });

  it("auth required maps from provider status", () => {
    const c = evaluateOptionChainCapability(ev({
      ok: false, snapshot: null, quality: null,
      meta: meta({ status: "AUTH_REQUIRED", safeError: "token expired" }),
    }));
    expect(c.status).toBe("AUTH_REQUIRED");
    expect(c.failingStage).toBe("provider-fetch");
  });

  it("invalid expiry format", () => {
    const c = evaluateOptionChainCapability(ev({ requestedExpiry: "not-a-date" }));
    expect(c.status).toBe("INVALID_EXPIRY");
    expect(c.failingStage).toBe("expiry-validation");
  });

  it("zero strikes → NO_STRIKES", () => {
    const c = evaluateOptionChainCapability(ev({ snapshot: goodSnap({ strikes: [] }) }));
    expect(c.status).toBe("NO_STRIKES");
    expect(c.failingStage).toBe("snapshot-normalization");
  });

  it("insufficient strikes → PARTIAL_CHAIN", () => {
    const snap = goodSnap({ strikes: [makeStrike(24000, { oi: 1 }, { oi: 1 }), makeStrike(24100, { oi: 1 }, { oi: 1 })] });
    const c = evaluateOptionChainCapability(ev({ snapshot: snap, quality: assessDataQuality(snap, { nowIso: "2026-07-17T04:00:05.000Z" }) }));
    expect(c.status).toBe("PARTIAL_CHAIN");
    expect(c.failingStage).toBe("quality-assessment");
  });

  it("provider marked partial → PARTIAL", () => {
    const c = evaluateOptionChainCapability(ev({ snapshot: goodSnap({ dataQuality: "PARTIAL" }) }));
    expect(c.status).toBe("PARTIAL");
  });

  it("future timestamp → INVALID_RESPONSE", () => {
    const snap = goodSnap({ timestamp: "2099-01-01T00:00:00.000Z" });
    const q = assessDataQuality(snap, { nowIso: "2026-07-17T04:00:05.000Z" });
    const c = evaluateOptionChainCapability(ev({ snapshot: snap, quality: q }));
    expect(c.status).toBe("INVALID_RESPONSE");
  });

  it("missing spot flows through as SUPPORTED-with-quality-failure", () => {
    const snap = goodSnap({ spotPrice: null });
    const q = assessDataQuality(snap, { nowIso: "2026-07-17T04:00:05.000Z" });
    const c = evaluateOptionChainCapability(ev({ snapshot: snap, quality: q }));
    expect(c.status).toBe("DATA_QUALITY_FAILURE");
  });

  it("duplicate strikes → DATA_QUALITY_FAILURE", () => {
    const snap = goodSnap({ strikes: [24000, 24000, 24100, 24200, 24300, 24400].map((s) => makeStrike(s, { oi: 1 }, { oi: 1 })) });
    const q = assessDataQuality(snap, { nowIso: "2026-07-17T04:00:05.000Z" });
    const c = evaluateOptionChainCapability(ev({ snapshot: snap, quality: q }));
    expect(c.status).toBe("DATA_QUALITY_FAILURE");
  });

  it("empty option chain error → NO_DATA", () => {
    const c = evaluateOptionChainCapability(ev({
      ok: false, snapshot: null, quality: null,
      meta: meta({ status: "UNAVAILABLE", safeError: "empty option chain" }),
    }));
    expect(c.status).toBe("NO_DATA");
    expect(c.failingStage).toBe("response-validation");
  });

  it("generic provider error → PROVIDER_ERROR", () => {
    const c = evaluateOptionChainCapability(ev({
      ok: false, snapshot: null, quality: null,
      meta: meta({ status: "UNAVAILABLE", safeError: "network timeout" }),
    }));
    expect(c.status).toBe("PROVIDER_ERROR");
    expect(c.retryable).toBe(true);
  });

  it("redacts raw provider references in reason", () => {
    const c = evaluateOptionChainCapability(ev({
      ok: false, snapshot: null, quality: null,
      meta: meta({ status: "UNAVAILABLE", safeError: "fetch to www.nseindia.com failed" }),
    }));
    expect(c.reason.toLowerCase()).not.toContain("nseindia");
  });

  it("isValidExpiryFormat", () => {
    expect(isValidExpiryFormat(null)).toBe(true);
    expect(isValidExpiryFormat("2026-07-24")).toBe(true);
    expect(isValidExpiryFormat("2026-7-24")).toBe(false);
    expect(isValidExpiryFormat("garbage")).toBe(false);
  });
});
