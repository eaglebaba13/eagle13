import { describe, it, expect } from "vitest";
import { MockOptionChainProvider } from "./mock-provider";

describe("mock-provider", () => {
  it("returns bullish snapshot with strikes", async () => {
    const p = new MockOptionChainProvider({ scenario: "BULLISH" });
    const r = await p.fetchSnapshot({ underlying: "NIFTY" });
    expect(r.ok).toBe(true);
    expect(r.snapshot?.strikes.length ?? 0).toBeGreaterThanOrEqual(5);
  });
  it("PROVIDER_FAILURE returns safe error", async () => {
    const p = new MockOptionChainProvider({ scenario: "PROVIDER_FAILURE" });
    const r = await p.fetchSnapshot({ underlying: "NIFTY" });
    expect(r.ok).toBe(false);
    expect(r.snapshot).toBeNull();
    expect(r.meta.safeError).toContain("mock failure");
  });
  it("MISSING_EXPIRY yields no expiries", async () => {
    const p = new MockOptionChainProvider({ scenario: "MISSING_EXPIRY" });
    expect(await p.listExpiries()).toEqual([]);
    const r = await p.fetchSnapshot({ underlying: "NIFTY" });
    expect(r.ok).toBe(false);
  });
  it("pause/resume", async () => {
    const p = new MockOptionChainProvider({ scenario: "SIDEWAYS" });
    p.pause();
    expect((await p.fetchSnapshot({ underlying: "NIFTY" })).ok).toBe(false);
    p.resume();
    expect((await p.fetchSnapshot({ underlying: "NIFTY" })).ok).toBe(true);
  });
  it("STALE marks dataQuality", async () => {
    const p = new MockOptionChainProvider({ scenario: "STALE" });
    const r = await p.fetchSnapshot({ underlying: "BANKNIFTY" });
    expect(r.snapshot?.dataQuality).toBe("STALE");
  });
});