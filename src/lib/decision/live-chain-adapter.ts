// Phase 31 (Decision wiring) · Live Option Chain adapter.
//
// PURE: converts an Upstox-shape `OptionChainResult`
// (`@/lib/option-chain/types`) into the legacy `OptionsChainResponse`
// shape (`@/lib/options-chain.functions`) that the Decision engine already
// consumes. This is a wiring adapter only — no formula changes.
//
// Also emits a `ModuleCapability` for the Options / PCR modules and a
// failure explainer, replacing the generic "MISSING" placeholder.

import type {
  OptionChainResult as UpstoxChainResult,
  OptionChainProviderStatus,
} from "../option-chain/provider";
import type {
  OptionChainSnapshot as UpstoxSnapshot,
  OptionUnderlying,
} from "../option-chain/types";
import type {
  OptionChainSnapshot as LegacySnapshot,
  OptionLeg as LegacyLeg,
} from "../options-analytics";
import { categorizeExpiries } from "../options-analytics";
import { classifyFreshness, type OptionsIntegrityMeta } from "../options-integrity";
import type { OptionsChainResponse } from "../options-chain.functions";
import {
  explainCapability,
  isCapabilityLive,
  type CapabilityExplainer,
  type ModuleCapability,
} from "./capability";

export type LiveChainAdapterResult = {
  chain: OptionsChainResponse | null;
  capability: ModuleCapability;
  explainer: CapabilityExplainer;
  provider: string;
  latencyMs: number;
  fetchedAt: string;
  safeError: string | null;
};

const STEPS: Record<OptionUnderlying, number> = { NIFTY: 50, BANKNIFTY: 100 };
const MIN_ATM_COVERAGE = 5;

/** Map upstream provider status → capability when the fetch failed. */
function failureCapability(status: OptionChainProviderStatus, safeError: string | null): ModuleCapability {
  if (status === "AUTH_REQUIRED") return "AUTH_REQUIRED";
  if (status === "STALE") return "STALE";
  if (status === "DELAYED") return "PARTIAL";
  if (safeError && /empty option chain/i.test(safeError)) return "NO_DATA";
  if (safeError && /schema|zod|parse/i.test(safeError)) return "INVALID_RESPONSE";
  return "NO_DATA";
}

function toLegacyLegs(snap: UpstoxSnapshot): { legs: LegacyLeg[]; strikes: number[] } {
  const legs: LegacyLeg[] = [];
  const strikes: number[] = [];
  for (const s of snap.strikes) {
    strikes.push(s.strike);
    const call = s.call;
    const put = s.put;
    legs.push({
      strike: s.strike,
      side: "CE",
      oi: call.oi ?? 0,
      changeOi: call.changeOi ?? 0,
      volume: call.volume ?? 0,
      ltp: call.ltp ?? 0,
      changePct: 0,
      iv: call.iv,
      bid: call.bid,
      ask: call.ask,
    });
    legs.push({
      strike: s.strike,
      side: "PE",
      oi: put.oi ?? 0,
      changeOi: put.changeOi ?? 0,
      volume: put.volume ?? 0,
      ltp: put.ltp ?? 0,
      changePct: 0,
      iv: put.iv,
      bid: put.bid,
      ask: put.ask,
    });
  }
  return { legs, strikes };
}

function atmCoverage(strikes: number[], spot: number): { below: number; above: number } {
  if (!strikes.length || !Number.isFinite(spot)) return { below: 0, above: 0 };
  const atm = strikes.reduce((b, s) => (Math.abs(s - spot) < Math.abs(b - spot) ? s : b));
  let below = 0;
  let above = 0;
  for (const s of strikes) {
    if (s < atm) below++;
    else if (s > atm) above++;
  }
  return { below, above };
}

/**
 * Pure adapter. Given an Upstox `OptionChainResult` and the underlying id,
 * returns a legacy-shaped `OptionsChainResponse` plus an explicit
 * capability + explainer describing the wiring outcome.
 */
export function adaptUpstoxToLegacyChain(
  underlying: OptionUnderlying,
  result: UpstoxChainResult,
  now: Date = new Date(),
): LiveChainAdapterResult {
  const step = STEPS[underlying];
  const fetchedAt = result.meta.fetchedAt;
  const provider = result.meta.providerId;
  const latencyMs = result.meta.latencyMs;
  const safeError = result.meta.safeError;

  // Hard failure path -------------------------------------------------------
  if (!result.ok || !result.snapshot) {
    const capability = failureCapability(result.meta.status, safeError);
    return {
      chain: null,
      capability,
      explainer: explainCapability(capability, {
        module: "options",
        stage: "provider-fetch",
        provider,
      }),
      provider,
      latencyMs,
      fetchedAt,
      safeError,
    };
  }

  const snap = result.snapshot;
  const spot = snap.spotPrice ?? 0;
  const { legs, strikes } = toLegacyLegs(snap);

  if (strikes.length === 0) {
    const capability: ModuleCapability = "NO_STRIKES";
    return {
      chain: null,
      capability,
      explainer: explainCapability(capability, {
        module: "options",
        stage: "normalization",
        provider,
      }),
      provider,
      latencyMs,
      fetchedAt,
      safeError,
    };
  }

  // An empty leg (from `makeStrike` with no call/put override) yields
  // `oi = 0` here because `EMPTY_LEG.oi === null` falls through the
  // `null ?? 0` in `toLegacyLegs`. Detect real presence by requiring at
  // least one leg with non-zero oi or ltp on each side.
  const hasCall = legs.some((l) => l.side === "CE" && ((l.oi ?? 0) > 0 || (l.ltp ?? 0) > 0));
  const hasPut = legs.some((l) => l.side === "PE" && ((l.oi ?? 0) > 0 || (l.ltp ?? 0) > 0));
  const cov = atmCoverage(strikes, spot);
  const dq = snap.dataQuality;

  // Freshness — snapshot timestamp vs. now (server clock).
  const ageSec = Math.max(
    0,
    Math.round((now.getTime() - new Date(snap.timestamp).getTime()) / 1000),
  );
  const freshness = classifyFreshness(ageSec);

  // Capability roll-up ------------------------------------------------------
  let capability: ModuleCapability;
  let stage = "integrity";
  if (!hasCall || !hasPut) {
    capability = "PARTIAL_CHAIN";
  } else if (cov.below < MIN_ATM_COVERAGE || cov.above < MIN_ATM_COVERAGE) {
    capability = "PARTIAL_CHAIN";
  } else if (dq === "FAILED") {
    capability = "DATA_QUALITY_FAILURE";
  } else if (freshness === "STALE") {
    capability = "STALE";
  } else if (dq === "PARTIAL" || freshness === "DELAYED") {
    capability = "PARTIAL";
  } else {
    capability = "SUPPORTED";
    stage = "delivery";
  }

  const legacySnap: LegacySnapshot = {
    symbol: underlying,
    spot,
    expiry: snap.expiry,
    fetchedAt: snap.timestamp,
    strikes,
    legs,
    provider,
    source: "PROVIDER",
  };

  // Compute an OptionsIntegrityMeta so the Decision engine's existing gate
  // (`chain.integrity.sourceStatus !== "UNAVAILABLE"`) keeps working
  // unchanged. We only classify — we do not change the formula.
  const missingFields = legs.filter(
    (l) => l.oi == null || !Number.isFinite(l.oi),
  ).length;
  const sourceStatus =
    capability === "SUPPORTED"
      ? "LIVE"
      : capability === "PARTIAL" || capability === "PARTIAL_CHAIN"
      ? "PARTIAL"
      : capability === "STALE"
      ? "STALE"
      : "UNAVAILABLE";
  const integrity: OptionsIntegrityMeta = {
    sourceStatus,
    provider,
    fetchedAt: snap.timestamp,
    providerTimestamp: snap.timestamp,
    receivedAt: now.toISOString(),
    dataAgeSeconds: ageSec,
    expiry: snap.expiry || null,
    underlying: spot || null,
    strikeCount: strikes.length,
    validStrikeCount: strikes.length - Math.floor(missingFields / 2),
    missingFieldCount: missingFields,
    isTradable: capability === "SUPPORTED",
    lastLiveFetchAt: snap.timestamp,
    cacheStatus: "LIVE",
    spotDivergence: null,
  };

  const chain: OptionsChainResponse = {
    snapshot: legacySnap,
    expiries: categorizeExpiries([snap.expiry].filter(Boolean) as string[]),
    selectedExpiry: snap.expiry,
    step,
    degraded: capability !== "SUPPORTED",
    errorMessage: null,
    integrity,
    yahooSpot: null,
  };

  return {
    chain,
    capability,
    explainer: explainCapability(capability, {
      module: "options",
      stage,
      provider,
    }),
    provider,
    latencyMs,
    fetchedAt,
    safeError,
  };
}

/** Convenience: returns true iff the adapter output is usable by formulas. */
export function isAdaptedChainLive(r: LiveChainAdapterResult): boolean {
  return r.chain !== null && isCapabilityLive(r.capability);
}