import { describe, it, expect } from "vitest";
import {
  evidenceFromOptionChain,
  evidenceFromCombinedPcr,
  evidenceFromMarketBreadth,
  evidenceFromGti,
  evidenceFromSimple,
  type RuntimeEvidence,
} from "./runtime-evidence";
import { aggregateRuntimeReadiness } from "./runtime-readiness";
import { detectContradictions } from "./contradictions";
import type { OptionChainCapability } from "@/lib/option-chain/capability";
import type { MarketBreadthCapability } from "@/lib/market-breadth/capability";
import type { CombinedPcrReading } from "@/lib/combined-pcr/types";

const NOW = "2026-07-17T09:15:00.000Z";

function ocCap(overrides: Partial<OptionChainCapability> = {}): OptionChainCapability {
  return {
    status: "SUPPORTED",
    retryable: false,
    reason: "ok",
    failingStage: null,
    suggestedAction: "",
    providerAlias: "OPTIONS",
    observedAt: NOW,
    latencyMs: 42,
    underlying: "NIFTY",
    requestedExpiry: null,
    resolvedExpiry: null,
    ...overrides,
  } as OptionChainCapability;
}

function mbCap(overrides: Partial<MarketBreadthCapability> = {}): MarketBreadthCapability {
  return {
    status: "SUPPORTED",
    reason: "ok",
    providerAlias: "BREADTH",
    failingStage: "NONE",
    retryable: false,
    freshness: "FRESH",
    latencyMs: 10,
    observedAt: NOW,
    source: "RESEARCH_DEMO",
    notes: [],
    ...overrides,
  } as MarketBreadthCapability;
}

describe("runtime-evidence adapters", () => {
  it("healthy option chain becomes HEALTHY / READY / LIVE", () => {
    const e = evidenceFromOptionChain("OPTION_CHAIN_NIFTY", ocCap());
    expect(e.status).toBe("HEALTHY");
    expect(e.readiness).toBe("READY");
    expect(e.source).toBe("LIVE");
  });

  it("auth-required option chain is BLOCKED / NOT_READY", () => {
    const e = evidenceFromOptionChain(
      "OPTION_CHAIN_NIFTY",
      ocCap({ status: "AUTH_REQUIRED", reason: "token missing" }),
    );
    expect(e.status).toBe("BLOCKED");
    expect(e.readiness).toBe("NOT_READY");
    expect(e.blockers.length).toBeGreaterThan(0);
  });

  it("stale option chain is DEGRADED", () => {
    const e = evidenceFromOptionChain("OPTION_CHAIN_NIFTY", ocCap({ status: "STALE" }));
    expect(e.status).toBe("DEGRADED");
    expect(e.readiness).toBe("PARTIALLY_READY");
  });

  it("combined pcr not computed → BLOCKED", () => {
    const e = evidenceFromCombinedPcr({
      reading: null,
      niftyCap: ocCap(),
      banknifyCap: ocCap({ underlying: "BANKNIFTY" }),
      observedAt: NOW,
    });
    expect(e.status).toBe("BLOCKED");
    expect(e.readiness).toBe("NOT_READY");
  });

  it("combined pcr computed with both instruments → HEALTHY", () => {
    const reading = { combinedScore: 1.1 } as CombinedPcrReading;
    const e = evidenceFromCombinedPcr({
      reading,
      niftyCap: ocCap(),
      banknifyCap: ocCap({ underlying: "BANKNIFTY" }),
      observedAt: NOW,
    });
    expect(e.status).toBe("HEALTHY");
    expect(e.source).toBe("LIVE");
  });

  it("combined pcr computed but partial coverage → DEGRADED", () => {
    const reading = { combinedScore: 0.9 } as CombinedPcrReading;
    const e = evidenceFromCombinedPcr({
      reading,
      niftyCap: ocCap(),
      banknifyCap: ocCap({ underlying: "BANKNIFTY", status: "AUTH_REQUIRED" }),
      observedAt: NOW,
    });
    expect(e.status).toBe("DEGRADED");
    expect(e.readiness).toBe("PARTIALLY_READY");
  });

  it("breadth RESEARCH_DEMO surfaces as DEMO / NOT_READY", () => {
    const e = evidenceFromMarketBreadth(mbCap());
    expect(e.status).toBe("DEMO");
    expect(e.readiness).toBe("NOT_READY");
    expect(e.source).toBe("RESEARCH_DEMO");
  });

  it("breadth SUPPORTED + LIVE → HEALTHY", () => {
    const e = evidenceFromMarketBreadth(mbCap({ source: "LIVE" }));
    expect(e.status).toBe("HEALTHY");
    expect(e.readiness).toBe("READY");
  });

  it("GTI inherits breadth source (never more live than breadth)", () => {
    const breadth = evidenceFromMarketBreadth(mbCap());
    const gti = evidenceFromGti(breadth, true, NOW);
    expect(gti.source).toBe("RESEARCH_DEMO");
    expect(gti.readiness).not.toBe("READY");
  });

  it("GTI blocked when not computed", () => {
    const breadth = evidenceFromMarketBreadth(mbCap({ source: "LIVE" }));
    const gti = evidenceFromGti(breadth, false, NOW);
    expect(gti.status).toBe("BLOCKED");
  });

  it("simple placeholder billing → NOT_READY", () => {
    const e = evidenceFromSimple({
      module: "BILLING",
      available: false,
      reason: "no production billing flow",
      observedAt: NOW,
    });
    expect(e.readiness).toBe("NOT_READY");
    expect(e.blockers.length).toBeGreaterThan(0);
  });

  it("simple empty historical store → NOT_READY", () => {
    const e = evidenceFromSimple({
      module: "HISTORICAL_DATA",
      available: false,
      reason: "store empty",
      observedAt: NOW,
    });
    expect(e.readiness).toBe("NOT_READY");
  });
});

describe("contradiction detector", () => {
  it("flags GTI LIVE while breadth demo", () => {
    const evs: RuntimeEvidence[] = [
      evidenceFromMarketBreadth(mbCap()),
      {
        ...evidenceFromGti(evidenceFromMarketBreadth(mbCap({ source: "LIVE" })), true, NOW),
        source: "LIVE",
      },
    ];
    const cs = detectContradictions(evs);
    expect(cs.some((c) => c.code === "GTI_LIVE_WHILE_BREADTH_NOT_LIVE")).toBe(true);
  });

  it("flags PCR HEALTHY while options blocked", () => {
    const nifty = evidenceFromOptionChain(
      "OPTION_CHAIN_NIFTY",
      ocCap({ status: "AUTH_REQUIRED" }),
    );
    const bnk = evidenceFromOptionChain(
      "OPTION_CHAIN_BANKNIFTY",
      ocCap({ status: "AUTH_REQUIRED", underlying: "BANKNIFTY" }),
    );
    const fakePcr: RuntimeEvidence = {
      ...evidenceFromCombinedPcr({
        reading: { combinedScore: 1 } as CombinedPcrReading,
        niftyCap: ocCap(),
        banknifyCap: ocCap({ underlying: "BANKNIFTY" }),
        observedAt: NOW,
      }),
    };
    const cs = detectContradictions([nifty, bnk, fakePcr]);
    expect(cs.some((c) => c.code === "PCR_HEALTHY_WHILE_OPTIONS_BLOCKED")).toBe(true);
  });

  it("flags READY with blockers", () => {
    const bad: RuntimeEvidence = {
      module: "BILLING",
      status: "HEALTHY",
      readiness: "READY",
      source: "CONFIGURATION",
      capability: "CONFIGURED",
      freshness: "UNKNOWN",
      quality: "OK",
      observedAt: NOW,
      latencyMs: null,
      reason: "",
      blockers: ["placeholder page"],
      warnings: [],
      provenance: "APP",
      diagnosticsPath: null,
    };
    const cs = detectContradictions([bad]);
    expect(cs.some((c) => c.code === "READY_WITH_BLOCKERS")).toBe(true);
  });

  it("aligned states produce no contradictions", () => {
    const evs = [
      evidenceFromOptionChain("OPTION_CHAIN_NIFTY", ocCap()),
      evidenceFromOptionChain("OPTION_CHAIN_BANKNIFTY", ocCap({ underlying: "BANKNIFTY" })),
      evidenceFromCombinedPcr({
        reading: { combinedScore: 1 } as CombinedPcrReading,
        niftyCap: ocCap(),
        banknifyCap: ocCap({ underlying: "BANKNIFTY" }),
        observedAt: NOW,
      }),
    ];
    expect(detectContradictions(evs)).toEqual([]);
  });
});

describe("aggregateRuntimeReadiness", () => {
  it("critical option chain blocked → NOT_READY", () => {
    const evs = [
      evidenceFromOptionChain("OPTION_CHAIN_NIFTY", ocCap({ status: "AUTH_REQUIRED" })),
      evidenceFromOptionChain("OPTION_CHAIN_BANKNIFTY", ocCap({ underlying: "BANKNIFTY" })),
    ];
    const r = aggregateRuntimeReadiness(evs, { generatedAt: NOW });
    expect(r.overall).toBe("NOT_READY");
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it("all healthy critical modules → READY", () => {
    const reading = { combinedScore: 1 } as CombinedPcrReading;
    const evs: RuntimeEvidence[] = [
      evidenceFromSimple({ module: "MARKET_DATA", available: true, reason: "live", observedAt: NOW }),
      evidenceFromSimple({ module: "INDIA_VIX", available: true, reason: "live", observedAt: NOW }),
      evidenceFromOptionChain("OPTION_CHAIN_NIFTY", ocCap()),
      evidenceFromOptionChain("OPTION_CHAIN_BANKNIFTY", ocCap({ underlying: "BANKNIFTY" })),
      evidenceFromCombinedPcr({ reading, niftyCap: ocCap(), banknifyCap: ocCap({ underlying: "BANKNIFTY" }), observedAt: NOW }),
      evidenceFromSimple({ module: "DECISION_ENGINE", available: true, reason: "computed", observedAt: NOW }),
    ];
    const r = aggregateRuntimeReadiness(evs, { generatedAt: NOW });
    expect(r.overall).toBe("READY");
  });

  it("demo breadth alone → PARTIALLY_READY (non-critical demo)", () => {
    const reading = { combinedScore: 1 } as CombinedPcrReading;
    const evs: RuntimeEvidence[] = [
      evidenceFromSimple({ module: "MARKET_DATA", available: true, reason: "live", observedAt: NOW }),
      evidenceFromSimple({ module: "INDIA_VIX", available: true, reason: "live", observedAt: NOW }),
      evidenceFromOptionChain("OPTION_CHAIN_NIFTY", ocCap()),
      evidenceFromOptionChain("OPTION_CHAIN_BANKNIFTY", ocCap({ underlying: "BANKNIFTY" })),
      evidenceFromCombinedPcr({ reading, niftyCap: ocCap(), banknifyCap: ocCap({ underlying: "BANKNIFTY" }), observedAt: NOW }),
      evidenceFromSimple({ module: "DECISION_ENGINE", available: true, reason: "computed", observedAt: NOW }),
      evidenceFromMarketBreadth(mbCap()),
    ];
    const r = aggregateRuntimeReadiness(evs, { generatedAt: NOW });
    expect(r.overall).toBe("PARTIALLY_READY");
  });

  it("critical contradiction forces NOT_READY", () => {
    const nifty = evidenceFromOptionChain("OPTION_CHAIN_NIFTY", ocCap({ status: "AUTH_REQUIRED" }));
    const bnk = evidenceFromOptionChain("OPTION_CHAIN_BANKNIFTY", ocCap({ underlying: "BANKNIFTY", status: "AUTH_REQUIRED" }));
    const fakePcr = evidenceFromCombinedPcr({
      reading: { combinedScore: 1 } as CombinedPcrReading,
      niftyCap: ocCap(),
      banknifyCap: ocCap({ underlying: "BANKNIFTY" }),
      observedAt: NOW,
    });
    const r = aggregateRuntimeReadiness([nifty, bnk, fakePcr], { generatedAt: NOW });
    expect(r.overall).toBe("NOT_READY");
    expect(r.contradictions.length).toBeGreaterThan(0);
  });
});
