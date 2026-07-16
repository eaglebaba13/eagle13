import { describe, it, expect, beforeEach } from "vitest";
import { MockOptionChainProvider } from "../option-chain/mock-provider";
import { _resetSnapshotHistory, getSnapshotHistory } from "../option-chain/snapshot-history";
import { computeCombinedPcr } from "./combined-pcr";
import { DEFAULT_COMBINED_PCR_WEIGHTS } from "./types";
import type { OptionUnderlying } from "../option-chain/types";

async function snap(scenario: "BULLISH" | "BEARISH" | "SIDEWAYS", u: OptionUnderlying) {
  const p = new MockOptionChainProvider({ scenario });
  const r = await p.fetchSnapshot({ underlying: u });
  return r.snapshot!;
}

describe("computeCombinedPcr", () => {
  beforeEach(() => _resetSnapshotHistory(100));

  it("produces bullish-side score under BULLISH mock", async () => {
    const snapshots = {
      NIFTY: await snap("BULLISH", "NIFTY"),
      BANKNIFTY: await snap("BULLISH", "BANKNIFTY"),
    };
    const r = computeCombinedPcr({
      snapshots, weights: DEFAULT_COMBINED_PCR_WEIGHTS, runId: "test-1",
    });
    expect(r.combinedScore).not.toBeNull();
    expect(r.combinedScore! > 0).toBe(true);
    expect(r.instruments.length).toBe(2);
    // effective weights sum to 1 across present instruments
    const eff = r.instruments.reduce((a, b) => a + b.weight, 0);
    expect(eff).toBeCloseTo(1, 6);
  });

  it("renormalizes when one instrument is missing", async () => {
    const snapshots = {
      NIFTY: await snap("BULLISH", "NIFTY"),
      BANKNIFTY: null,
    };
    const r = computeCombinedPcr({ snapshots, runId: "test-2" });
    expect(r.instruments.length).toBe(1);
    expect(r.instruments[0].weight).toBeCloseTo(1, 6);
    expect(r.warnings.some((w) => w.includes("BANKNIFTY"))).toBe(true);
  });

  it("uses snapshot history for EMA smoothing", async () => {
    const h = getSnapshotHistory();
    for (let i = 0; i < 5; i += 1) {
      h.push(await snap("SIDEWAYS", "NIFTY"));
      h.push(await snap("SIDEWAYS", "BANKNIFTY"));
    }
    const snapshots = {
      NIFTY: await snap("BULLISH", "NIFTY"),
      BANKNIFTY: await snap("BULLISH", "BANKNIFTY"),
    };
    const r = computeCombinedPcr({ snapshots, history: h, runId: "test-3" });
    expect(r.emaFast).not.toBeNull();
    expect(r.emaSlow).not.toBeNull();
    expect(r.slope).not.toBeNull();
  });

  it("returns null combinedScore when both instruments missing", () => {
    const r = computeCombinedPcr({
      snapshots: { NIFTY: null, BANKNIFTY: null }, runId: "test-4",
    });
    expect(r.combinedScore).toBeNull();
    expect(r.direction).toBe("NEUTRAL");
  });

  it("never emits BUY / SELL and stays inside 7 research states", async () => {
    const snapshots = {
      NIFTY: await snap("BEARISH", "NIFTY"),
      BANKNIFTY: await snap("BEARISH", "BANKNIFTY"),
    };
    const r = computeCombinedPcr({ snapshots, runId: "test-5" });
    expect(r.signalState).not.toContain("BUY");
    expect(r.signalState).not.toContain("SELL");
    expect([
      "STRONG_CE_FOCUS", "CE_FOCUS", "BULLISH_WEAKENING",
      "NO_TRADE", "BEARISH_WEAKENING", "PE_FOCUS", "STRONG_PE_FOCUS",
    ]).toContain(r.signalState);
  });
});