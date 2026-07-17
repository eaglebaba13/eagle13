import { describe, expect, it } from "vitest";
import {
  fetchLiveNifty50Breadth,
  unavailableResolver,
  type LiveQuoteResolver,
  type LiveQuoteSample,
} from "./live-provider.server";
import { NIFTY50_CONSTITUENTS } from "./nifty50-registry";

describe("live-provider (breadth)", () => {
  it("returns a snapshot with full coverage when every symbol resolves", async () => {
    const resolver: LiveQuoteResolver = async (symbols) => {
      const m = new Map<string, LiveQuoteSample | null>();
      symbols.forEach((s, i) => m.set(s, { symbol: s, changePercent: i % 2 ? 0.5 : -0.5 }));
      return m;
    };
    const r = await fetchLiveNifty50Breadth(resolver, "2025-06-01T09:00:00Z");
    expect(r.ok).toBe(true);
    expect(r.snapshot).not.toBeNull();
    expect(r.snapshot!.totalSymbols).toBe(NIFTY50_CONSTITUENTS.length);
    expect(r.snapshot!.unavailable).toBe(0);
    expect(r.snapshot!.constituentCoverage).toBeCloseTo(1);
    expect(r.snapshot!.provider).toBe("UPSTOX_LIVE");
  });

  it("marks missing constituents as UNAVAILABLE — never fabricates", async () => {
    const resolver: LiveQuoteResolver = async (symbols) => {
      const m = new Map<string, LiveQuoteSample | null>();
      symbols.forEach((s, i) => {
        if (i < 25) m.set(s, { symbol: s, changePercent: 0.3 });
        else m.set(s, null);
      });
      return m;
    };
    const r = await fetchLiveNifty50Breadth(resolver);
    expect(r.snapshot!.unavailable).toBe(NIFTY50_CONSTITUENTS.length - 25);
    expect(r.snapshot!.constituentCoverage).toBeLessThan(1);
  });

  it("returns ok:false on resolver throw", async () => {
    const r = await fetchLiveNifty50Breadth(async () => {
      throw new Error("upstox timeout");
    });
    expect(r.ok).toBe(false);
    expect(r.safeError).toBe("upstox timeout");
    expect(r.snapshot).toBeNull();
  });

  it("unavailableResolver marks every symbol as UNAVAILABLE", async () => {
    const r = await fetchLiveNifty50Breadth(unavailableResolver());
    expect(r.snapshot!.unavailable).toBe(NIFTY50_CONSTITUENTS.length);
    expect(r.snapshot!.advances).toBe(0);
    expect(r.snapshot!.declines).toBe(0);
  });

  it("classifies direction from change% deterministically", async () => {
    const resolver: LiveQuoteResolver = async (symbols) => {
      const m = new Map<string, LiveQuoteSample | null>();
      symbols.forEach((s, i) => {
        const cp = i === 0 ? 1.2 : i === 1 ? -1.5 : i === 2 ? 0 : 0.01;
        m.set(s, { symbol: s, changePercent: cp });
      });
      return m;
    };
    const r = await fetchLiveNifty50Breadth(resolver);
    expect(r.snapshot!.advances).toBeGreaterThanOrEqual(1);
    expect(r.snapshot!.declines).toBeGreaterThanOrEqual(1);
    expect(r.snapshot!.unchanged).toBeGreaterThanOrEqual(1);
  });
});