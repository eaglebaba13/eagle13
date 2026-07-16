// Phase 27 · Stage 3 — Deterministic mock breadth provider for
// research/testing. NOT a broker connection.

import { NIFTY50_CONSTITUENTS, NIFTY50_REGISTRY_VERSION, nifty50WeightMap, topWeightedBasket } from "./nifty50-registry";
import { SECTOR_REGISTRY, SECTOR_REGISTRY_VERSION, findSector, type SectorId } from "./sector-registry";
import { computeBreadth } from "./breadth-calc";
import type { MarketBreadthSnapshot, SymbolTick, BreadthDirection } from "./types";

export type MockScenario = "BULLISH" | "BEARISH" | "MIXED" | "PARTIAL" | "STALE";

function directionForScenario(sc: MockScenario, seed: number): BreadthDirection {
  const r = Math.abs(Math.sin(seed * 12.9898)) % 1;
  if (sc === "BULLISH") return r < 0.72 ? "ADVANCE" : r < 0.9 ? "DECLINE" : "UNCHANGED";
  if (sc === "BEARISH") return r < 0.72 ? "DECLINE" : r < 0.9 ? "ADVANCE" : "UNCHANGED";
  if (sc === "MIXED")   return r < 0.45 ? "ADVANCE" : r < 0.90 ? "DECLINE" : "UNCHANGED";
  if (sc === "PARTIAL") return r < 0.30 ? "UNAVAILABLE" : r < 0.65 ? "ADVANCE" : "DECLINE";
  return "UNAVAILABLE"; // STALE — most missing
}

function tickFor(symbol: string, sc: MockScenario, i: number): SymbolTick {
  const d = directionForScenario(sc, i + 1);
  const cp = d === "ADVANCE" ? 0.8 : d === "DECLINE" ? -0.8 : d === "UNCHANGED" ? 0 : null;
  return { symbol, direction: d, changePercent: cp };
}

export interface MockBreadthOptions {
  readonly scenario: MockScenario;
  readonly broadUniverseSize?: number;
  readonly timestamp?: string;
  readonly now?: number;
}

function nowIso(opts: MockBreadthOptions): string {
  return opts.timestamp ?? new Date(opts.now ?? Date.now()).toISOString();
}

function buildBroad(opts: MockBreadthOptions): MarketBreadthSnapshot {
  const size = opts.broadUniverseSize ?? 2100;
  const symbols = Array.from({ length: size }, (_, i) => `NSE_SYM_${i + 1}`);
  const ticks = symbols.map((s, i) => tickFor(s, opts.scenario, i));
  const freshnessMs = opts.scenario === "STALE" ? 20 * 60 * 1000 : 30_000;
  return computeBreadth({
    universe: "BROAD_NSE",
    provider: "MOCK_BREADTH",
    timestamp: nowIso(opts),
    expectedSymbols: symbols,
    ticks,
    freshnessMs,
    snapshotId: `broad-${size}-${opts.scenario}`,
  });
}

function buildNifty50(opts: MockBreadthOptions): MarketBreadthSnapshot {
  const symbols = NIFTY50_CONSTITUENTS.map((c) => c.symbol);
  const ticks = symbols.map((s, i) => tickFor(s, opts.scenario, i));
  return computeBreadth({
    universe: "NIFTY50",
    provider: "MOCK_BREADTH",
    timestamp: nowIso(opts),
    expectedSymbols: symbols,
    weights: nifty50WeightMap(),
    ticks,
    registryVersion: NIFTY50_REGISTRY_VERSION,
    freshnessMs: opts.scenario === "STALE" ? 20 * 60 * 1000 : 30_000,
    snapshotId: `nifty50-${opts.scenario}`,
  });
}

function buildTopWeighted(opts: MockBreadthOptions, size = 10): MarketBreadthSnapshot {
  const basket = topWeightedBasket(size);
  const symbols = basket.map((c) => c.symbol);
  const weights = new Map(basket.map((c) => [c.symbol, c.weight]));
  const ticks = symbols.map((s, i) => tickFor(s, opts.scenario, i));
  return computeBreadth({
    universe: "NIFTY_TOP_WEIGHTED",
    provider: "MOCK_BREADTH",
    timestamp: nowIso(opts),
    expectedSymbols: symbols,
    weights,
    ticks,
    registryVersion: NIFTY50_REGISTRY_VERSION,
    freshnessMs: opts.scenario === "STALE" ? 20 * 60 * 1000 : 30_000,
    snapshotId: `top-${size}-${opts.scenario}`,
  });
}

const SECTOR_UNIVERSE: Record<SectorId, "SECTOR_BANKING" | "SECTOR_IT" | "SECTOR_OIL_GAS" | "SECTOR_AUTO"> = {
  BANKING: "SECTOR_BANKING",
  IT: "SECTOR_IT",
  OIL_GAS: "SECTOR_OIL_GAS",
  AUTO: "SECTOR_AUTO",
};

function buildSector(id: SectorId, opts: MockBreadthOptions): MarketBreadthSnapshot {
  const sec = findSector(id);
  const symbols = sec.constituents.map((c) => c.symbol);
  const weights = new Map(sec.constituents.map((c) => [c.symbol, c.weight]));
  const ticks = symbols.map((s, i) => tickFor(s, opts.scenario, i));
  return computeBreadth({
    universe: SECTOR_UNIVERSE[id],
    provider: "MOCK_BREADTH",
    timestamp: nowIso(opts),
    expectedSymbols: symbols,
    weights,
    ticks,
    registryVersion: SECTOR_REGISTRY_VERSION,
    freshnessMs: opts.scenario === "STALE" ? 20 * 60 * 1000 : 30_000,
    snapshotId: `${id}-${opts.scenario}`,
  });
}

export interface MockBreadthBundle {
  readonly broad: MarketBreadthSnapshot;
  readonly nifty50: MarketBreadthSnapshot;
  readonly topWeighted: MarketBreadthSnapshot;
  readonly banking: MarketBreadthSnapshot;
  readonly it: MarketBreadthSnapshot;
  readonly oilGas: MarketBreadthSnapshot;
  readonly auto: MarketBreadthSnapshot;
}

export function buildMockBreadthBundle(opts: MockBreadthOptions): MockBreadthBundle {
  return {
    broad: buildBroad(opts),
    nifty50: buildNifty50(opts),
    topWeighted: buildTopWeighted(opts),
    banking: buildSector("BANKING", opts),
    it: buildSector("IT", opts),
    oilGas: buildSector("OIL_GAS", opts),
    auto: buildSector("AUTO", opts),
  };
}

// Silence unused constants when this file is imported for testing only.
void SECTOR_REGISTRY;
