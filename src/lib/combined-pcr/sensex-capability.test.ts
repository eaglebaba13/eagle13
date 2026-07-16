import { describe, it, expect } from "vitest";
import { assessSensexCapability } from "./sensex-capability";
import type { OptionChainSnapshot } from "../option-chain/types";
import { makeStrike } from "../option-chain/types";

function snap(overrides: Partial<OptionChainSnapshot> = {}): OptionChainSnapshot {
  const strikes = Array.from({ length: 15 }, (_, i) =>
    makeStrike(60_000 + i * 100,
      { oi: 100, changeOi: 10 },
      { oi: 100, changeOi: 10 }),
  );
  return {
    instrument: "NIFTY", // placeholder — SENSEX not in enum yet
    spotPrice: 60_700,
    timestamp: new Date().toISOString(),
    provider: "UPSTOX",
    expiry: "2025-01-16",
    availableExpiries: ["2025-01-16"],
    marketSession: "OPEN",
    dataQuality: "OK",
    strikes,
    ...overrides,
  } as OptionChainSnapshot;
}

describe("assessSensexCapability", () => {
  it("returns SUPPORTED when every field passes — but activate stays false", () => {
    const r = assessSensexCapability({ snapshot: snap(), providerId: "UPSTOX" });
    expect(r.status).toBe("SUPPORTED");
    expect(r.missing).toEqual([]);
    expect(r.activate).toBe(false); // hard gate
  });

  it("returns UNSUPPORTED when snapshot is missing", () => {
    const r = assessSensexCapability({ snapshot: null, providerId: "UPSTOX" });
    expect(r.status).toBe("UNSUPPORTED");
    expect(r.activate).toBe(false);
  });

  it("returns AUTH_REQUIRED when upstream requires auth", () => {
    const r = assessSensexCapability({
      snapshot: null, providerId: "UPSTOX",
      upstreamCode: "AUTH_REQUIRED",
    });
    expect(r.status).toBe("AUTH_REQUIRED");
  });

  it("returns STALE when timestamp is old", () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const r = assessSensexCapability({
      snapshot: snap({ timestamp: old }), providerId: "UPSTOX",
    });
    expect(r.status).toBe("STALE");
  });

  it("returns PARTIAL when some fields are missing", () => {
    const s = snap();
    // strip change-oi coverage
    const stripped: OptionChainSnapshot = {
      ...s,
      strikes: s.strikes.map((st) => ({
        strike: st.strike,
        call: { ...st.call, changeOi: null },
        put: st.put,
      })),
    };
    const r = assessSensexCapability({ snapshot: stripped, providerId: "UPSTOX" });
    expect(r.status).toBe("PARTIAL");
    expect(r.missing).toContain("call_change_oi");
  });

  it("returns DATA_QUALITY_FAILURE when provider marks it FAILED", () => {
    const r = assessSensexCapability({
      snapshot: snap({ dataQuality: "FAILED" }), providerId: "UPSTOX",
    });
    expect(r.status).toBe("DATA_QUALITY_FAILURE");
  });
});