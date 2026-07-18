import { describe, it, expect } from "vitest";
import type { OptionChainSnapshot } from "@/lib/option-chain/types";
import type { MarketBreadthSnapshot } from "@/lib/market-breadth/types";
import { analyzeOi } from "./oi-analysis";
import { classifyBuildUp } from "./build-up";
import { computeMaxPain } from "./max-pain";
import { computeGamma } from "./gamma";
import { buildSectorFlow } from "./sector-flow";
import { summariseFlow } from "./summary";
import { buildInstitutionalFlowReport, classifyInstitutionalFlowReadiness } from "./report";

function mkLeg(oi: number, dOi: number, gamma: number | null = null) {
  return {
    oi, changeOi: dOi, volume: oi, iv: 15, ltp: 100, bid: null, ask: null,
    greeks: gamma == null ? null : { delta: 0.5, gamma, theta: -1, vega: 1, rho: 0 },
  };
}

function mkSnapshot(): OptionChainSnapshot {
  return {
    instrument: "NIFTY",
    spotPrice: 20000,
    timestamp: new Date().toISOString(),
    provider: "MOCK",
    expiry: "2026-08-14",
    availableExpiries: ["2026-08-14"],
    marketSession: "OPEN",
    dataQuality: "OK",
    strikes: [
      { strike: 19800, call: mkLeg(300, 40, 0.01), put: mkLeg(100, -20, 0.01) },
      { strike: 19900, call: mkLeg(250, 30, 0.02), put: mkLeg(150, -10, 0.02) },
      { strike: 20000, call: mkLeg(400, 60, 0.03), put: mkLeg(200, -5, 0.03) },
      { strike: 20100, call: mkLeg(200, -10, 0.02), put: mkLeg(500, 80, 0.02) },
      { strike: 20200, call: mkLeg(150, -20, 0.01), put: mkLeg(600, 100, 0.01) },
    ],
  };
}

describe("Institutional Flow — analytics", () => {
  it("OI analysis identifies highest call/put and ATM strike", () => {
    const oi = analyzeOi(mkSnapshot());
    expect(oi.highestCallOiStrike).toBe(20000);
    expect(oi.highestPutOiStrike).toBe(20200);
    expect(oi.atmStrike).toBe(20000);
    expect(oi.availability).toBe("OK");
  });

  it("Build-up classifies both sides when inputs present", () => {
    const bu = classifyBuildUp({
      underlyingPriceChange: 50,
      totalCallChangeOi: 200,
      totalPutChangeOi: -50,
    });
    expect(bu.callSide).toBe("LONG_BUILDUP");
    expect(bu.putSide).toBe("LONG_UNWINDING");
    expect(bu.availability).toBe("OK");
  });

  it("Build-up returns UNAVAILABLE without inputs", () => {
    const bu = classifyBuildUp({
      underlyingPriceChange: null,
      totalCallChangeOi: null,
      totalPutChangeOi: null,
    });
    expect(bu.availability).toBe("UNAVAILABLE");
    expect(bu.overall).toBe("UNAVAILABLE");
  });

  it("Max Pain returns a strike within the chain", () => {
    const mp = computeMaxPain({ snapshot: mkSnapshot() });
    expect(mp.availability).toBe("OK");
    expect(mp.currentMaxPain).not.toBeNull();
    const strikes = mkSnapshot().strikes.map((s) => s.strike);
    expect(strikes).toContain(mp.currentMaxPain);
  });

  it("Gamma returns UNAVAILABLE when greeks are missing", () => {
    const snap = mkSnapshot();
    const stripped: OptionChainSnapshot = {
      ...snap,
      strikes: snap.strikes.map((s) => ({
        ...s,
        call: { ...s.call, greeks: null },
        put: { ...s.put, greeks: null },
      })),
    };
    const g = computeGamma(stripped);
    expect(g.availability).toBe("UNAVAILABLE");
    expect(g.gammaExposure).toBeNull();
  });

  it("Gamma computes exposure when greeks are present", () => {
    const g = computeGamma(mkSnapshot());
    expect(g.availability).toBe("OK");
    expect(typeof g.gammaExposure).toBe("number");
  });

  it("Sector flow handles missing sector snapshots", () => {
    const flow = buildSectorFlow({ sectors: [], registryVersion: "v1" });
    expect(flow.availability).toBe("UNAVAILABLE");
    expect(flow.rows.every((r) => r.bias === "UNAVAILABLE")).toBe(true);
  });

  it("Sector flow classifies bias from breadth snapshots", () => {
    const stub: MarketBreadthSnapshot = {
      timestamp: new Date().toISOString(),
      provider: "MOCK",
      universe: "SECTOR_BANKING",
      totalSymbols: 35,
      advances: 30,
      declines: 5,
      unchanged: 0,
      unavailable: 0,
      advanceDeclineRatio: 6,
      advancePercentage: 85,
      declinePercentage: 14,
      netBreadth: 25,
      weightedBreadth: 0.7,
      weightedAdvance: 0.85,
      weightedDecline: 0.15,
      weightedUnchanged: 0,
      totalWeight: 1,
      freshness: "FRESH",
      dataQuality: "OK",
      constituentCoverage: 1,
      snapshotId: "banking",
      registryVersion: "v1",
      warnings: [],
    };
    const flow = buildSectorFlow({ sectors: [stub], registryVersion: "v1" });
    const banking = flow.rows.find((r) => r.id === "BANKING")!;
    expect(banking.bias).toBe("BULLISH");
  });

  it("Summary reports BALANCED when neither side dominates", () => {
    const oi = analyzeOi(mkSnapshot());
    const bu = classifyBuildUp({
      underlyingPriceChange: 0,
      totalCallChangeOi: oi.totalCallChangeOi,
      totalPutChangeOi: oi.totalPutChangeOi,
    });
    const mp = computeMaxPain({ snapshot: mkSnapshot() });
    const s = summariseFlow({ oi, buildUp: bu, maxPain: mp, pcrScore: 1 });
    expect(["BALANCED", "PUT_WRITERS_ACTIVE", "CALL_WRITERS_ACTIVE"]).toContain(s.bias);
  });

  it("Full report is generated with disclaimer and version", () => {
    const snap = mkSnapshot();
    const rep = buildInstitutionalFlowReport({
      underlying: "NIFTY",
      snapshot: snap,
      underlyingPriceChange: 20,
      broadBreadth: null,
      sectorSnapshots: [],
      sectorRegistryVersion: "v1",
      pcrScore: 1.1,
      pcrState: "NEUTRAL",
      vix: 13,
      decisionAction: "MONITOR",
      decisionConfidence: 0.6,
      gtiState: "MIXED",
      gtiConfidence: 0.5,
      source: "MIXED",
    });
    expect(rep.disclaimer).toContain("RESEARCH ONLY");
    expect(rep.version).toContain("institutional-flow");
    expect(rep.oi.rows.length).toBe(snap.strikes.length);
  });

  it("Readiness classifier flags missing greeks as warning, not blocker", () => {
    const snap = mkSnapshot();
    const stripped: OptionChainSnapshot = {
      ...snap,
      strikes: snap.strikes.map((s) => ({
        ...s,
        call: { ...s.call, greeks: null },
        put: { ...s.put, greeks: null },
      })),
    };
    const rep = buildInstitutionalFlowReport({
      underlying: "NIFTY",
      snapshot: stripped,
      underlyingPriceChange: 0,
      broadBreadth: null,
      sectorSnapshots: [],
      sectorRegistryVersion: "v1",
      pcrScore: null,
      pcrState: null,
      vix: null,
      decisionAction: null,
      decisionConfidence: null,
      gtiState: null,
      gtiConfidence: null,
      source: "RESEARCH_DEMO",
    });
    const c = classifyInstitutionalFlowReadiness(rep);
    expect(c.available).toBe(true);
    expect(c.warnings.some((w) => /greek/i.test(w))).toBe(true);
  });

  it("Readiness reports blocked when no report is provided", () => {
    const c = classifyInstitutionalFlowReadiness(null);
    expect(c.available).toBe(false);
    expect(c.blockers.length).toBeGreaterThan(0);
  });
});