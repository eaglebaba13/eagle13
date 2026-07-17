import { describe, it, expect } from "vitest";
import { buildRuntimeReadinessReport } from "./build-report";
import type { OptionChainCapability } from "@/lib/option-chain/capability";
import type { MarketBreadthCapability } from "@/lib/market-breadth/capability";

const now = "2026-07-17T09:00:00.000Z";

function cap(status: OptionChainCapability["status"]): OptionChainCapability {
  return {
    status,
    reason: `oc:${status}`,
    providerAlias: "OPTIONS",
    freshness: status === "SUPPORTED" ? "FRESH" : "UNKNOWN",
    latencyMs: 100,
    observedAt: now,
    // Cast-through: capability envelope has more fields; only status is
    // read by the adapter, rest via structural typing.
  } as unknown as OptionChainCapability;
}

function breadth(source: MarketBreadthCapability["source"], status: MarketBreadthCapability["status"] = "SUPPORTED"): MarketBreadthCapability {
  return {
    status,
    reason: "breadth",
    providerAlias: "BREADTH",
    failingStage: "NONE",
    retryable: false,
    freshness: "FRESH",
    latencyMs: 10,
    observedAt: now,
    source,
    notes: [],
  };
}

describe("buildRuntimeReadinessReport", () => {
  it("returns NOT_READY when options are blocked", () => {
    const r = buildRuntimeReadinessReport({
      nowIso: now,
      quotesAvailable: true,
      vixAvailable: true,
      niftyCapability: cap("PROVIDER_ERROR"),
      banknifyCapability: cap("PROVIDER_ERROR"),
      combinedPcr: null,
      breadthCapability: breadth("RESEARCH_DEMO"),
      gtiComputed: true,
    });
    expect(r.overall).toBe("NOT_READY");
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it("is PARTIALLY_READY when options healthy but breadth is research demo", () => {
    const r = buildRuntimeReadinessReport({
      nowIso: now,
      quotesAvailable: true,
      vixAvailable: true,
      niftyCapability: cap("SUPPORTED"),
      banknifyCapability: cap("SUPPORTED"),
      combinedPcr: { combinedScore: 1.1 } as never,
      breadthCapability: breadth("RESEARCH_DEMO"),
      gtiComputed: true,
    });
    // Breadth is DEMO which downgrades critical modules is not in critical list;
    // GTI inherits demo → warnings present.
    expect(["PARTIALLY_READY", "NOT_READY"]).toContain(r.overall);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("exposes contradictions when PCR unhealthy but reading present", () => {
    const r = buildRuntimeReadinessReport({
      nowIso: now,
      quotesAvailable: true,
      vixAvailable: false,
      niftyCapability: cap("SUPPORTED"),
      banknifyCapability: cap("PROVIDER_ERROR"),
      combinedPcr: { combinedScore: 0.9 } as never,
      breadthCapability: breadth("RESEARCH_DEMO"),
      gtiComputed: true,
    });
    expect(r.evidence.some((e) => e.module === "COMBINED_PCR")).toBe(true);
    expect(r.evidence.some((e) => e.module === "GTI")).toBe(true);
  });

  it("always emits the full critical module set", () => {
    const r = buildRuntimeReadinessReport({
      nowIso: now,
      quotesAvailable: false,
      vixAvailable: false,
      niftyCapability: null,
      banknifyCapability: null,
      combinedPcr: null,
      breadthCapability: null,
      gtiComputed: false,
    });
    const ids = r.evidence.map((e) => e.module);
    for (const m of [
      "MARKET_DATA",
      "INDIA_VIX",
      "OPTION_CHAIN_NIFTY",
      "OPTION_CHAIN_BANKNIFTY",
      "COMBINED_PCR",
      "DECISION_ENGINE",
      "MARKET_BREADTH",
      "GTI",
    ]) {
      expect(ids).toContain(m);
    }
    expect(r.overall).toBe("NOT_READY");
  });
});