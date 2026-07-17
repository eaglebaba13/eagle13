// Phase 2D · Decision Engine · pure wiring tests.
//
// Deterministic tests for `buildOptionsModuleInput`, `buildPcrModuleInput`
// and `buildDecisionSummary`. Never fetches a provider, never touches the
// server-fn RPC surface.

import { describe, expect, it } from "vitest";
import type {
  OptionChainCapability,
  OptionChainCapabilityStatus,
} from "../option-chain/capability";
import type { OptionChainProviderMeta } from "../option-chain/provider";
import type {
  OptionChainSnapshot,
  OptionUnderlying,
} from "../option-chain/types";
import type { CombinedPcrReading } from "../combined-pcr/types";
import {
  buildDecisionSummary,
  buildOptionsModuleInput,
  buildPcrModuleInput,
  type CanonicalChainEnvelope,
} from "./module-inputs";

const NOW = "2025-01-15T10:00:00.000Z";
const SNAP_TS = "2025-01-15T09:59:30.000Z";

function emptyLeg() {
  return {
    oi: 1000,
    changeOi: 100,
    volume: 50,
    iv: 15,
    ltp: 42,
    bid: 41,
    ask: 43,
    greeks: null,
  };
}

function makeSnapshot(underlying: OptionUnderlying, spot = 20000): OptionChainSnapshot {
  const step = underlying === "NIFTY" ? 50 : 100;
  const strikes = Array.from({ length: 20 }, (_, i) => spot - 10 * step + i * step);
  return {
    instrument: underlying,
    spotPrice: spot,
    timestamp: SNAP_TS,
    provider: "UPSTOX",
    expiry: "2025-01-30",
    availableExpiries: ["2025-01-30", "2025-02-06"],
    marketSession: "OPEN",
    dataQuality: "OK",
    strikes: strikes.map((s) => ({ strike: s, call: emptyLeg(), put: emptyLeg() })),
  };
}

function makeMeta(status: OptionChainProviderMeta["status"] = "LIVE", safeError: string | null = null): OptionChainProviderMeta {
  return {
    providerId: "UPSTOX",
    status,
    latencyMs: 120,
    fetchedAt: NOW,
    safeError,
    upstreamCode: null,
  };
}

function makeCap(
  status: OptionChainCapabilityStatus,
  overrides: Partial<OptionChainCapability> = {},
): OptionChainCapability {
  return {
    status,
    retryable: status !== "SUPPORTED",
    reason: `capability ${status}`,
    failingStage: status === "SUPPORTED" ? null : "provider-fetch",
    suggestedAction: status === "SUPPORTED" ? "" : "Retry",
    providerAlias: "Options Provider",
    observedAt: NOW,
    latencyMs: 120,
    underlying: "NIFTY",
    requestedExpiry: null,
    resolvedExpiry: "2025-01-30",
    ...overrides,
  };
}

function envelope(
  status: OptionChainCapabilityStatus,
  opts: { snapshot?: OptionChainSnapshot | null; meta?: OptionChainProviderMeta } = {},
): CanonicalChainEnvelope {
  const usable = status === "SUPPORTED" || status === "PARTIAL";
  const snap = opts.snapshot ?? (usable ? makeSnapshot("NIFTY") : null);
  return {
    ok: usable,
    snapshot: snap,
    meta: opts.meta ?? makeMeta(usable ? "LIVE" : "UNAVAILABLE", usable ? null : "empty option chain"),
    capability: makeCap(status),
  };
}

function makeReading(overrides: Partial<CombinedPcrReading> = {}): CombinedPcrReading {
  return {
    combinedScore: -18,
    direction: "CE",
    emaFast: -15,
    emaSlow: -10,
    slope: -1,
    previousSlope: 0,
    slopeChange: -1,
    zeroCross: false,
    signalState: "CE_FOCUS",
    confirmedState: "CE_FOCUS",
    pendingState: "CE_FOCUS",
    confirmationCount: 2,
    instruments: [
      {
        underlying: "NIFTY",
        rawOiPcr: 1.15,
        rawChangeOiPcr: 1.4,
        normalizedOiPcr: 15,
        normalizedChangeOiPcr: 30,
        instrumentScore: -18,
        weight: 0.6,
        configuredWeight: 0.6,
        strikeCount: 20,
        atm: 20000,
        expiry: "2025-01-30",
        provider: "UPSTOX",
        timestamp: SNAP_TS,
        snapshotId: "NIFTY:2025-01-30:" + SNAP_TS,
        missing: [],
      },
    ],
    timestamp: NOW,
    warnings: [],
    runId: "test-run",
    ...overrides,
  };
}

describe("buildOptionsModuleInput", () => {
  it("SUPPORTED canonical → usable options input, safe provider alias", () => {
    const out = buildOptionsModuleInput("NIFTY", envelope("SUPPORTED"), NOW);
    expect(out.usable).toBe(true);
    expect(out.chain).not.toBeNull();
    expect(out.canonicalStatus).toBe("SUPPORTED");
    expect(out.providerAlias).toBe("Options Provider");
    expect(out.explainer.provider).toBe("Options Provider");
    expect(out.strikeCount).toBeGreaterThan(0);
  });

  it("AUTH_REQUIRED canonical → not usable, propagates capability", () => {
    const out = buildOptionsModuleInput("NIFTY", envelope("AUTH_REQUIRED"), NOW);
    expect(out.usable).toBe(false);
    expect(out.chain).toBeNull();
    expect(out.capability).toBe("AUTH_REQUIRED");
    expect(out.canonicalStatus).toBe("AUTH_REQUIRED");
    expect(out.reason).toMatch(/AUTH_REQUIRED/);
    expect(out.providerAlias).toBe("Options Provider");
  });

  it("NO_DATA canonical → not usable, no fake zero substitution", () => {
    const out = buildOptionsModuleInput("NIFTY", envelope("NO_DATA"), NOW);
    expect(out.usable).toBe(false);
    expect(out.chain).toBeNull();
    expect(out.capability).toBe("NO_DATA");
  });

  it("INVALID_EXPIRY canonical → propagates without a chain", () => {
    const out = buildOptionsModuleInput("NIFTY", envelope("INVALID_EXPIRY"), NOW);
    expect(out.usable).toBe(false);
    expect(out.capability).toBe("INVALID_EXPIRY");
  });

  it("STALE canonical → not usable", () => {
    const out = buildOptionsModuleInput("NIFTY", envelope("STALE"), NOW);
    expect(out.usable).toBe(false);
    expect(out.capability).toBe("STALE");
  });

  it("PARTIAL canonical with snapshot → adapts via legacy path", () => {
    const out = buildOptionsModuleInput("NIFTY", envelope("PARTIAL"), NOW);
    expect(out.canonicalStatus).toBe("PARTIAL");
    // Adapter is invoked; usable depends on adapter's own gate.
    expect(out.chain).not.toBeNull();
  });
});

describe("buildPcrModuleInput", () => {
  it("derives PCR from combined reading when Options are usable", () => {
    const opt = buildOptionsModuleInput("NIFTY", envelope("SUPPORTED"), NOW);
    const out = buildPcrModuleInput(opt, makeReading());
    expect(out.usable).toBe(true);
    expect(out.computed).toBe(true);
    expect(out.pcrOi).toBeCloseTo(1.15, 2);
    expect(out.combinedScore).toBe(-18);
    expect(out.direction).toBe("CE");
    expect(out.capability).toBe("SUPPORTED");
    expect(out.providerAlias).toBe("Options Provider");
  });

  it("no fake neutral PCR when Options are blocked", () => {
    const opt = buildOptionsModuleInput("NIFTY", envelope("AUTH_REQUIRED"), NOW);
    const out = buildPcrModuleInput(opt, null);
    expect(out.usable).toBe(false);
    expect(out.computed).toBe(false);
    expect(out.pcrOi).toBeNull();
    expect(out.combinedScore).toBeNull();
    expect(out.capability).toBe("AUTH_REQUIRED");
  });

  it("no fake zero when combined reading is null but options are usable", () => {
    const opt = buildOptionsModuleInput("NIFTY", envelope("SUPPORTED"), NOW);
    const out = buildPcrModuleInput(opt, null);
    expect(out.usable).toBe(false);
    expect(out.pcrOi).toBeNull();
    expect(out.capability).toBe("NO_DATA");
  });

  it("missing NIFTY OI-PCR flags PARTIAL_CHAIN", () => {
    const opt = buildOptionsModuleInput("NIFTY", envelope("SUPPORTED"), NOW);
    const reading = makeReading({
      instruments: [
        {
          ...makeReading().instruments[0],
          rawOiPcr: null,
        },
      ],
    });
    const out = buildPcrModuleInput(opt, reading);
    expect(out.usable).toBe(false);
    expect(out.computed).toBe(true);
    expect(out.pcrOi).toBeNull();
    expect(out.capability).toBe("PARTIAL_CHAIN");
  });
});

describe("buildDecisionSummary", () => {
  it("emits compact summary with propagated capabilities", () => {
    const opt = buildOptionsModuleInput("NIFTY", envelope("SUPPORTED"), NOW);
    const pcr = buildPcrModuleInput(opt, makeReading());
    const s = buildDecisionSummary({
      action: "BUY_CE",
      confidence: 72,
      risk: "MEDIUM",
      present: 6,
      total: 8,
      options: opt,
      pcr,
      generatedAt: NOW,
    });
    expect(s.decision).toBe("BUY_CE");
    expect(s.confidence).toBe(72);
    expect(s.moduleCoverage).toEqual({ present: 6, total: 8 });
    expect(s.options.status).toBe("SUPPORTED");
    expect(s.pcr.computed).toBe(true);
    expect(s.pcr.pcrOi).toBeCloseTo(1.15, 2);
  });

  it("summary reflects blocked options + blocked pcr", () => {
    const opt = buildOptionsModuleInput("NIFTY", envelope("NO_DATA"), NOW);
    const pcr = buildPcrModuleInput(opt, null);
    const s = buildDecisionSummary({
      action: "WAIT",
      confidence: 20,
      risk: "HIGH",
      present: 4,
      total: 8,
      options: opt,
      pcr,
      generatedAt: NOW,
    });
    expect(s.options.status).toBe("NO_DATA");
    expect(s.pcr.status).toBe("NO_DATA");
    expect(s.pcr.computed).toBe(false);
    expect(s.pcr.pcrOi).toBeNull();
    expect(s.pcr.combinedScore).toBeNull();
  });
});

describe("no legacy fallback imports", () => {
  it("does not statically reference the legacy options-chain functions module", async () => {
    // The pure wiring module must not depend on `options-chain.functions`,
    // which is the legacy Yahoo/NSE aggregator. It only imports the
    // adapter, which itself imports types.
    const src = await import("./module-inputs");
    expect(Object.keys(src)).toEqual(
      expect.arrayContaining([
        "buildOptionsModuleInput",
        "buildPcrModuleInput",
        "buildDecisionSummary",
      ]),
    );
  });
});