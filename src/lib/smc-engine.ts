// Phase 21.4 · Stage 1 — SMC Historical Engine.
//
// Pure, deterministic detector composing the existing 21.1 primitives
// (market-structure, liquidity, order-block, fvg) into a single observable
// SMC event surface. NO trading rules, NO entries, NO exits, NO scoring.
// Only structural detection with strict no-lookahead guarantees.

import { analyzeStructure, type LabeledSwing, type StructureEvent } from "./market-structure";
import { detectFvgs, type FairValueGap } from "./fvg-engine";
import { analyzeLiquidity, type LiquidityEvent, type LiquidityLevel } from "./liquidity-engine";
import { detectOrderBlocks, type OrderBlock } from "./order-block-engine";
import type { Candle } from "./smc-types";
import { validateCandles } from "./smc-types";

export type SmcBias = "bullish" | "bearish" | "neutral";

export type DisplacementCandle = {
  index: number;
  t: number;
  direction: "bull" | "bear";
  range: number;
  ratio: number;
};

export type PremiumDiscountZone = {
  highIndex: number;
  lowIndex: number;
  high: number;
  low: number;
  equilibrium: number;
  currentZone: "premium" | "discount" | "equilibrium";
};

export type BiasSample = {
  index: number;
  t: number;
  bias: SmcBias;
  fast: number;
  slow: number;
};

export type VwapSample = {
  index: number;
  t: number;
  bias: SmcBias;
  vwap: number;
};

export type SmcEngineOptions = {
  lookback?: number;
  emaFast?: number;
  emaSlow?: number;
  displacementMultiple?: number;
  displacementWindow?: number;
  fvg?: Parameters<typeof detectFvgs>[1];
  liquidity?: Parameters<typeof analyzeLiquidity>[1];
  orderBlock?: Parameters<typeof detectOrderBlocks>[1];
};

export type SmcEngineResult = {
  swings: LabeledSwing[];
  structureEvents: StructureEvent[];
  finalBias: SmcBias;
  fvgs: FairValueGap[];
  liquidityLevels: LiquidityLevel[];
  liquidityEvents: LiquidityEvent[];
  orderBlocks: OrderBlock[];
  displacementCandles: DisplacementCandle[];
  premiumDiscount: PremiumDiscountZone | null;
  emaBias: BiasSample[];
  vwapBias: VwapSample[];
  meta: {
    lookback: number;
    emaFast: number;
    emaSlow: number;
    displacementMultiple: number;
    displacementWindow: number;
    candleCount: number;
  };
};

function emaSeries(values: number[], period: number): number[] {
  const out: number[] = [];
  if (values.length === 0 || period < 1) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function biasFrom(fast: number, slow: number): SmcBias {
  if (fast > slow) return "bullish";
  if (fast < slow) return "bearish";
  return "neutral";
}

function computeDisplacement(
  candles: Candle[],
  multiple: number,
  window: number,
): DisplacementCandle[] {
  const out: DisplacementCandle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const win = candles.slice(Math.max(0, i - window), i);
    if (win.length === 0) continue;
    const avg = win.reduce((a, x) => a + (x.h - x.l), 0) / win.length;
    if (avg <= 0) continue;
    const range = c.h - c.l;
    const ratio = range / avg;
    if (ratio >= multiple) {
      out.push({
        index: i,
        t: c.t,
        direction: c.c >= c.o ? "bull" : "bear",
        range,
        ratio,
      });
    }
  }
  return out;
}

function computePremiumDiscount(
  candles: Candle[],
  swings: LabeledSwing[],
): PremiumDiscountZone | null {
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  if (highs.length === 0 || lows.length === 0) return null;
  const hi = highs.reduce((m, s) => (s.price > m.price ? s : m), highs[0]);
  const lo = lows.reduce((m, s) => (s.price < m.price ? s : m), lows[0]);
  if (hi.price <= lo.price) return null;
  const eq = (hi.price + lo.price) / 2;
  const last = candles[candles.length - 1];
  const range = hi.price - lo.price;
  const bandEq = range * 0.02;
  let zone: PremiumDiscountZone["currentZone"];
  if (Math.abs(last.c - eq) <= bandEq) zone = "equilibrium";
  else zone = last.c > eq ? "premium" : "discount";
  return {
    highIndex: hi.index,
    lowIndex: lo.index,
    high: hi.price,
    low: lo.price,
    equilibrium: eq,
    currentZone: zone,
  };
}

function computeVwapSeries(candles: Candle[]): VwapSample[] {
  const out: VwapSample[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typical = (c.h + c.l + c.c) / 3;
    const v = Math.max(c.v, 0);
    cumPV += typical * v;
    cumV += v;
    const vwap = cumV > 0 ? cumPV / cumV : typical;
    out.push({
      index: i,
      t: c.t,
      vwap,
      bias: c.c > vwap ? "bullish" : c.c < vwap ? "bearish" : "neutral",
    });
  }
  return out;
}

export function analyzeSmc(
  candles: Candle[],
  opts: SmcEngineOptions = {},
): SmcEngineResult {
  validateCandles(candles);
  const lookback = opts.lookback ?? 2;
  const emaFast = opts.emaFast ?? 13;
  const emaSlow = opts.emaSlow ?? 50;
  const displacementMultiple = opts.displacementMultiple ?? 1.5;
  const displacementWindow = opts.displacementWindow ?? 10;

  const structure = analyzeStructure(candles, lookback);
  const fvgs = detectFvgs(candles, opts.fvg);
  const liquidity = analyzeLiquidity(candles, { lookback, ...opts.liquidity });
  const orderBlocks = detectOrderBlocks(candles, { lookback, ...opts.orderBlock });
  const displacementCandles = computeDisplacement(
    candles,
    displacementMultiple,
    displacementWindow,
  );
  const premiumDiscount = computePremiumDiscount(candles, structure.swings);

  const closes = candles.map((c) => c.c);
  const fast = emaSeries(closes, emaFast);
  const slow = emaSeries(closes, emaSlow);
  const emaBias: BiasSample[] = candles.map((c, i) => ({
    index: i,
    t: c.t,
    fast: fast[i],
    slow: slow[i],
    bias: biasFrom(fast[i], slow[i]),
  }));
  const vwapBias = computeVwapSeries(candles);

  return {
    swings: structure.swings,
    structureEvents: structure.events,
    finalBias: structure.bias,
    fvgs,
    liquidityLevels: liquidity.levels,
    liquidityEvents: liquidity.events,
    orderBlocks,
    displacementCandles,
    premiumDiscount,
    emaBias,
    vwapBias,
    meta: {
      lookback,
      emaFast,
      emaSlow,
      displacementMultiple,
      displacementWindow,
      candleCount: candles.length,
    },
  };
}

export const SMC_STRATEGY_NOT_IMPLEMENTED = "NOT_IMPLEMENTED" as const;
export type SmcStrategyNotImplemented = typeof SMC_STRATEGY_NOT_IMPLEMENTED;

export const smcHistoricalEnginePlaceholder = {
  status: SMC_STRATEGY_NOT_IMPLEMENTED,
  analyze: analyzeSmc,
} as const;
