// Phase 29 · Stage 1 — LIVE NIFTY50 breadth provider (Upstox-backed).
//
// Consumes a per-symbol quote resolver (injected) so this module stays
// unit-testable and provider-neutral. When the resolver returns null
// for a constituent, that constituent is recorded as UNAVAILABLE.
// Data is NEVER fabricated.
//
// Server-only: intended to be called from server functions.

import { computeBreadth } from "./breadth-calc";
import {
  NIFTY50_CONSTITUENTS,
  NIFTY50_REGISTRY_VERSION,
  nifty50WeightMap,
} from "./nifty50-registry";
import type { MarketBreadthSnapshot, SymbolTick, BreadthDirection } from "./types";

export interface LiveQuoteSample {
  readonly symbol: string;
  readonly changePercent: number | null;
}

export type LiveQuoteResolver = (
  symbols: readonly string[],
  nowIso: string,
) => Promise<ReadonlyMap<string, LiveQuoteSample | null>>;

function directionFromChange(change: number | null): BreadthDirection {
  if (change == null || !Number.isFinite(change)) return "UNAVAILABLE";
  if (change > 0.05) return "ADVANCE";
  if (change < -0.05) return "DECLINE";
  return "UNCHANGED";
}

export interface LiveBreadthResult {
  readonly ok: boolean;
  readonly snapshot: MarketBreadthSnapshot | null;
  readonly providerLatencyMs: number;
  readonly safeError: string | null;
}

export async function fetchLiveNifty50Breadth(
  resolve: LiveQuoteResolver,
  nowIso: string = new Date().toISOString(),
  providerId = "UPSTOX_LIVE",
): Promise<LiveBreadthResult> {
  const t0 = Date.now();
  const symbols = NIFTY50_CONSTITUENTS.map((c) => c.symbol);
  try {
    const quotes = await resolve(symbols, nowIso);
    const ticks: SymbolTick[] = symbols.map((sym) => {
      const q = quotes.get(sym);
      if (!q) return { symbol: sym, direction: "UNAVAILABLE", changePercent: null };
      return {
        symbol: sym,
        direction: directionFromChange(q.changePercent),
        changePercent: q.changePercent,
      };
    });
    const snapshot = computeBreadth({
      universe: "NIFTY50",
      provider: providerId,
      timestamp: nowIso,
      expectedSymbols: symbols,
      weights: nifty50WeightMap(),
      ticks,
      registryVersion: NIFTY50_REGISTRY_VERSION,
      freshnessMs: 30_000,
      snapshotId: `nifty50-live-${nowIso}`,
    });
    return {
      ok: true,
      snapshot,
      providerLatencyMs: Date.now() - t0,
      safeError: null,
    };
  } catch (err) {
    return {
      ok: false,
      snapshot: null,
      providerLatencyMs: Date.now() - t0,
      safeError: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Adapter that treats an unmapped constituent as UNAVAILABLE — used when
 * the runtime has no Upstox instrument mapping for a symbol. Callers
 * should PREFER a real mapping; this helper exists only so the live
 * pipeline can degrade honestly instead of fabricating quotes.
 */
export function unavailableResolver(): LiveQuoteResolver {
  return async (symbols) => {
    const m = new Map<string, LiveQuoteSample | null>();
    for (const s of symbols) m.set(s, null);
    return m;
  };
}