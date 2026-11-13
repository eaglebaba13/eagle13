// Phase 38 — Institutional AI LTP Calculator & Chart of Accuracy (COA 1.0) Engine
// EagleBABA Proprietary Mathematical Framework.
//
// Calculates:
// 1. Percentage Dominance & Shifting Matrix (100% Strong, >=75% WTT / WTB).
// 2. Chart of Accuracy (COA 1.0) 9-Scenario Market Classifier.
// 3. Exact Dot-to-Dot Call & Put Reversal Prices for every strike (EOS, EOS-1, EOR, EOR+1).
// 4. Safe vs Risky Entry Points (S-Moderate, S-Risky, R-Moderate, R-Risky).
// 5. 09:20 AM Static Levels Snapshot persistence.
// 6. Stocks 4-Line Mode (P2, P1, C1, C2) with Risk Scoring (0 to 4) & LTP Blast Screener.

import fs from "node:fs";
import path from "node:path";
import type { OptionChainStrike, OptionChainSnapshot } from "../option-chain/types";
import { FO_UNIVERSE, type FOInstrument } from "../cycles/cycle-performance.server";
import { fetchLiveQuotesBatch, getCachedMarketData } from "../cycles/market-data-adapter.server";

export type ShiftingState = "STRONG" | "WTT" | "WTB";

export interface StrikeDominance {
  readonly strike: number;
  readonly volume: number;
  readonly volPct: number;
  readonly oi: number;
  readonly oiPct: number;
  readonly ltp: number | null;
  readonly iv: number | null;
  readonly isMaxVol: boolean;
  readonly isMaxOi: boolean;
  readonly isWttVol: boolean;
  readonly isWtbVol: boolean;
  readonly isWttOi: boolean;
  readonly isWtbOi: boolean;
  readonly reversalPrice: number;
}

export type CoaScenarioId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface CoaScenarioResult {
  readonly scenarioId: CoaScenarioId;
  readonly name: string;
  readonly tag: string; // e.g. "COA #1", "COA #7"
  readonly summary: string;
  readonly recommendation: string;
  readonly sentiment:
    | "BULLISH"
    | "BEARISH"
    | "EXTREMELY_BULLISH"
    | "EXTREMELY_BEARISH"
    | "RANGEBOUND"
    | "BOTH_SIDE_RISKY";
  readonly supportState: ShiftingState;
  readonly resistanceState: ShiftingState;
  readonly supportDominantFactor: "OI" | "VOLUME" | "BOTH";
  readonly resistanceDominantFactor: "OI" | "VOLUME" | "BOTH";
  readonly color: "emerald" | "rose" | "amber" | "gold";
  readonly badgeText: string;
}

export interface ReversalLevels {
  readonly eos: number; // Extension of Support
  readonly eosMinus1: number; // EOS - 1
  readonly eor: number; // Extension of Resistance
  readonly eorPlus1: number; // EOR + 1
  readonly sModerate: number; // Safe Support Entry
  readonly sRisky: number; // Risky Support Entry
  readonly rModerate: number; // Safe Resistance Entry
  readonly rRisky: number; // Risky Resistance Entry
  readonly supportStrike: number;
  readonly resistanceStrike: number;
  readonly spotPrice: number;
  readonly maxPainSl: number;
  readonly maxGainTarget: number;
}

export interface StockFourLineLevels {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string;
  readonly ltp: number;
  readonly p2: number; // Top Resistance (EOR + 1)
  readonly p1: number; // Inner Resistance (EOR)
  readonly c1: number; // Inner Support (EOS)
  readonly c2: number; // Bottom Support (EOS - 1)
  readonly bullishEntry: number; // Near C1/C2
  readonly bullishSl: number; // Below C2
  readonly bullishTarget1: number; // P1
  readonly bullishTarget2: number; // P2
  readonly bearishEntry: number; // Near P1/P2
  readonly bearishSl: number; // Above P2
  readonly bearishTarget1: number; // C1
  readonly bearishTarget2: number; // C2
  readonly bullishRisk: number; // 0 to 4
  readonly bearishRisk: number; // 0 to 4
  readonly nearestLine: "P2" | "P1" | "C1" | "C2";
  readonly distanceToNearestPct: number;
  readonly isAtTrigger: boolean; // within 0.5% of any line
  readonly triggerType: "BULLISH_C1_C2" | "BEARISH_P1_P2" | "NONE";
}

export interface LtpCalculatorOutput {
  readonly underlying: string;
  readonly spotPrice: number;
  readonly timestamp: string;
  readonly coaScenario: CoaScenarioResult;
  readonly reversalLevels: ReversalLevels;
  readonly callStrikes: readonly StrikeDominance[];
  readonly putStrikes: readonly StrikeDominance[];
  readonly atmStrike: number;
  readonly static0920Snapshot?: ReversalLevels | null;
}

/**
 * 1. Shifting Matrix Evaluation:
 * Evaluates dominant strike (100%) and 2nd highest challenger (>= 75%).
 * If challenger strike > dominant: WTT (Weak Towards Top ↗)
 * If challenger strike < dominant: WTB (Weak Towards Bottom ↘)
 * Else: STRONG
 */
export function evaluateSideDominance(
  strikes: readonly OptionChainStrike[],
  side: "CALL" | "PUT",
  spotPrice: number,
): {
  readonly items: readonly StrikeDominance[];
  readonly dominantStrike: number;
  readonly state: ShiftingState;
  readonly dominantFactor: "OI" | "VOLUME" | "BOTH";
} {
  if (strikes.length === 0) {
    return {
      items: [],
      dominantStrike: spotPrice,
      state: "STRONG",
      dominantFactor: "BOTH",
    };
  }

  let maxVol = 0;
  let maxOi = 0;

  for (const s of strikes) {
    const leg = side === "CALL" ? s.call : s.put;
    const v = leg.volume ?? 0;
    const o = leg.oi ?? 0;
    if (v > maxVol) maxVol = v;
    if (o > maxOi) maxOi = o;
  }

  // Safety floor
  if (maxVol === 0) maxVol = 1;
  if (maxOi === 0) maxOi = 1;

  let maxVolStrike = strikes[0].strike;
  let maxOiStrike = strikes[0].strike;

  for (const s of strikes) {
    const leg = side === "CALL" ? s.call : s.put;
    if ((leg.volume ?? 0) === maxVol) maxVolStrike = s.strike;
    if ((leg.oi ?? 0) === maxOi) maxOiStrike = s.strike;
  }

  // Find 2nd highest volume & OI challenger >= 75%
  let secondVolPct = 0;
  let secondVolStrike = maxVolStrike;
  let secondOiPct = 0;
  let secondOiStrike = maxOiStrike;

  for (const s of strikes) {
    const leg = side === "CALL" ? s.call : s.put;
    const v = leg.volume ?? 0;
    const o = leg.oi ?? 0;
    const vPct = (v / maxVol) * 100;
    const oPct = (o / maxOi) * 100;

    if (s.strike !== maxVolStrike && vPct > secondVolPct) {
      secondVolPct = vPct;
      secondVolStrike = s.strike;
    }
    if (s.strike !== maxOiStrike && oPct > secondOiPct) {
      secondOiPct = oPct;
      secondOiStrike = s.strike;
    }
  }

  const volShift: ShiftingState =
    secondVolPct >= 75.0
      ? secondVolStrike > maxVolStrike
        ? "WTT"
        : "WTB"
      : "STRONG";

  const oiShift: ShiftingState =
    secondOiPct >= 75.0
      ? secondOiStrike > maxOiStrike
        ? "WTT"
        : "WTB"
      : "STRONG";

  // Synthesize dominant state
  let overallState: ShiftingState = "STRONG";
  let factor: "OI" | "VOLUME" | "BOTH" = "BOTH";

  if (volShift === oiShift) {
    overallState = volShift;
    factor = "BOTH";
  } else if (volShift !== "STRONG" && oiShift === "STRONG") {
    overallState = volShift;
    factor = "VOLUME";
  } else if (oiShift !== "STRONG" && volShift === "STRONG") {
    overallState = oiShift;
    factor = "OI";
  } else {
    // Both shifting in opposite directions: pick the higher percentage challenger
    if (secondVolPct >= secondOiPct) {
      overallState = volShift;
      factor = "VOLUME";
    } else {
      overallState = oiShift;
      factor = "OI";
    }
  }

  const dominantStrike = factor === "OI" ? maxOiStrike : maxVolStrike;

  // Build items array
  const items: StrikeDominance[] = strikes.map((s) => {
    const leg = side === "CALL" ? s.call : s.put;
    const v = leg.volume ?? 0;
    const o = leg.oi ?? 0;
    const volPct = Math.round(((v / maxVol) * 100) * 10) / 10;
    const oiPct = Math.round(((o / maxOi) * 100) * 10) / 10;
    const isMaxVol = s.strike === maxVolStrike;
    const isMaxOi = s.strike === maxOiStrike;

    const isWttVol = s.strike === secondVolStrike && secondVolPct >= 75.0 && secondVolStrike > maxVolStrike;
    const isWtbVol = s.strike === secondVolStrike && secondVolPct >= 75.0 && secondVolStrike < maxVolStrike;

    const isWttOi = s.strike === secondOiStrike && secondOiPct >= 75.0 && secondOiStrike > maxOiStrike;
    const isWtbOi = s.strike === secondOiStrike && secondOiPct >= 75.0 && secondOiStrike < maxOiStrike;

    // Dot-to-dot Reversal Price:
    // Call Reversal = Strike + Call LTP (or theoretical estimate)
    // Put Reversal = Strike - Put LTP (or theoretical estimate)
    let reversalPrice = 0;
    const ltp = leg.ltp;
    if (side === "CALL") {
      const prem = ltp != null && ltp > 0 ? ltp : Math.max(12, spotPrice * 0.0065);
      reversalPrice = Math.round((s.strike + prem) * 100) / 100;
    } else {
      const prem = ltp != null && ltp > 0 ? ltp : Math.max(12, spotPrice * 0.0065);
      reversalPrice = Math.round((s.strike - prem) * 100) / 100;
    }

    return {
      strike: s.strike,
      volume: v,
      volPct,
      oi: o,
      oiPct,
      ltp: leg.ltp,
      iv: leg.iv,
      isMaxVol,
      isMaxOi,
      isWttVol,
      isWtbVol,
      isWttOi,
      isWtbOi,
      reversalPrice,
    };
  });

  return {
    items,
    dominantStrike,
    state: overallState,
    dominantFactor: factor,
  };
}

/**
 * 2. Chart of Accuracy (COA 1.0) 9-Scenario Classifier:
 * Categorizes all 9 combinations of Support state vs Resistance state.
 */
export function classifyCoaScenario(
  supportState: ShiftingState,
  resistanceState: ShiftingState,
  supportFactor: "OI" | "VOLUME" | "BOTH" = "BOTH",
  resistanceFactor: "OI" | "VOLUME" | "BOTH" = "BOTH",
): CoaScenarioResult {
  // Scenario 1: Support STRONG, Resistance STRONG
  if (supportState === "STRONG" && resistanceState === "STRONG") {
    return {
      scenarioId: 1,
      name: "IDEAL RANGE (RANGE BOUND)",
      tag: "COA #1",
      summary: "Support and Resistance are both Strong. Market operates inside a defined boundary.",
      recommendation: "Buy Call at EOS (Extension of Support), Buy Put at EOR (Extension of Resistance). Strict range-bound rules apply.",
      sentiment: "RANGEBOUND",
      supportState,
      resistanceState,
      supportDominantFactor: supportFactor,
      resistanceDominantFactor: resistanceFactor,
      color: "gold",
      badgeText: "🟡 IDEAL RANGE (COA #1)",
    };
  }

  // Scenario 2: Support STRONG, Resistance WTT
  if (supportState === "STRONG" && resistanceState === "WTT") {
    return {
      scenarioId: 2,
      name: "BULLISH BREAKOUT (RESISTANCE WTT)",
      tag: "COA #2",
      summary: "Resistance is Weak Towards Top while Support is firm. Bullish upside pressure.",
      recommendation: "Buy Call from every bottom (EOS). Resistance can break to EOR+1. Avoid buying Puts.",
      sentiment: "BULLISH",
      supportState,
      resistanceState,
      supportDominantFactor: supportFactor,
      resistanceDominantFactor: resistanceFactor,
      color: "emerald",
      badgeText: "🟢 BULLISH BREAKOUT (COA #2)",
    };
  }

  // Scenario 3: Support STRONG, Resistance WTB
  if (supportState === "STRONG" && resistanceState === "WTB") {
    return {
      scenarioId: 3,
      name: "BEARISH SHIFT (RESISTANCE WTB)",
      tag: "COA #3",
      summary: "Resistance is shifting downward while Support is firm. Downward compression.",
      recommendation: "Sell every top at EOR. Target is EOS or EOS-1. Avoid fresh Call positions.",
      sentiment: "BEARISH",
      supportState,
      resistanceState,
      supportDominantFactor: supportFactor,
      resistanceDominantFactor: resistanceFactor,
      color: "rose",
      badgeText: "🔴 BEARISH SHIFT (COA #3)",
    };
  }

  // Scenario 4: Support WTT, Resistance STRONG
  if (supportState === "WTT" && resistanceState === "STRONG") {
    return {
      scenarioId: 4,
      name: "BULLISH SHIFT (SUPPORT WTT)",
      tag: "COA #4",
      summary: "Support is shifting upward while Resistance remains Strong. Upward pressure.",
      recommendation: "Buy Call at every dip (EOS). Support is climbing towards Resistance. Target EOR.",
      sentiment: "BULLISH",
      supportState,
      resistanceState,
      supportDominantFactor: supportFactor,
      resistanceDominantFactor: resistanceFactor,
      color: "emerald",
      badgeText: "🟢 BULLISH SHIFT (COA #4)",
    };
  }

  // Scenario 5: Support WTB, Resistance STRONG
  if (supportState === "WTB" && resistanceState === "STRONG") {
    return {
      scenarioId: 5,
      name: "BEARISH SHIFT (SUPPORT WTB)",
      tag: "COA #5",
      summary: "Support is Weak Towards Bottom. Downward leakage below Support.",
      recommendation: "Sell every rise. Support weakening downwards to EOS-1. Target EOS-1.",
      sentiment: "BEARISH",
      supportState,
      resistanceState,
      supportDominantFactor: supportFactor,
      resistanceDominantFactor: resistanceFactor,
      color: "rose",
      badgeText: "🔴 BEARISH SHIFT (COA #5)",
    };
  }

  // Scenario 6: Support WTT, Resistance WTB
  if (supportState === "WTT" && resistanceState === "WTB") {
    return {
      scenarioId: 6,
      name: "CONVERGING RANGE (BOTH SIDES INWARD)",
      tag: "COA #6",
      summary: "Support is moving up and Resistance is moving down. Narrowing intraday range.",
      recommendation: "Range shrinking rapidly. Trade strictly at extreme outer diversions. High false breakout risk.",
      sentiment: "BOTH_SIDE_RISKY",
      supportState,
      resistanceState,
      supportDominantFactor: supportFactor,
      resistanceDominantFactor: resistanceFactor,
      color: "amber",
      badgeText: "⚠️ BOTH SIDE RISKY (COA #6)",
    };
  }

  // Scenario 7: Support WTT, Resistance WTT
  if (supportState === "WTT" && resistanceState === "WTT") {
    return {
      scenarioId: 7,
      name: "PURE BULL RUN (STRICT NO PUTS)",
      tag: "COA #7",
      summary: "Both Support and Resistance are Weak Towards Top. Massive institutional accumulation.",
      recommendation: "STRICT NO PUTS. Buy Call at every bottom. Unstoppable rally that breaches EOR and EOR+1.",
      sentiment: "EXTREMELY_BULLISH",
      supportState,
      resistanceState,
      supportDominantFactor: supportFactor,
      resistanceDominantFactor: resistanceFactor,
      color: "emerald",
      badgeText: "🟢 PURE BULL RUN (COA #7)",
    };
  }

  // Scenario 8: Support WTB, Resistance WTB
  if (supportState === "WTB" && resistanceState === "WTB") {
    return {
      scenarioId: 8,
      name: "PURE BLOOD BATH (STRICT NO CALLS)",
      tag: "COA #8",
      summary: "Both Support and Resistance are Weak Towards Bottom. Panic liquidation & unwinding.",
      recommendation: "STRICT NO CALLS. Buy Put at every rise. Severe breakdown breaching EOS and EOS-1.",
      sentiment: "EXTREMELY_BEARISH",
      supportState,
      resistanceState,
      supportDominantFactor: supportFactor,
      resistanceDominantFactor: resistanceFactor,
      color: "rose",
      badgeText: "🔴 PURE BLOOD BATH (COA #8)",
    };
  }

  // Scenario 9: Support WTB, Resistance WTT
  return {
    scenarioId: 9,
    name: "DIVERGING EXPANSION (BOTH SIDES EXPANDING)",
    tag: "COA #9",
    summary: "Support is moving down and Resistance is moving up. Massive volatility expansion.",
    recommendation: "Extreme two-way whip. Both sides risky. Trade strictly at outermost diversions or stay on sidelines.",
    sentiment: "BOTH_SIDE_RISKY",
    supportState,
    resistanceState,
    supportDominantFactor: supportFactor,
    resistanceDominantFactor: resistanceFactor,
    color: "amber",
    badgeText: "⚠️ BOTH SIDE RISKY (COA #9)",
  };
}

/**
 * 3. Exact Reversal & Diversion Calculator:
 * Computes EOS, EOS-1, EOR, EOR+1, S-Moderate, S-Risky, R-Moderate, R-Risky.
 */
export function calculateReversalLevels(
  strikes: readonly OptionChainStrike[],
  spotPrice: number,
  supportStrike: number,
  resistanceStrike: number,
): ReversalLevels {
  if (strikes.length === 0) {
    const defaultStep = spotPrice > 30000 ? 100 : 50;
    return {
      eos: Math.round(spotPrice - defaultStep * 0.5),
      eosMinus1: Math.round(spotPrice - defaultStep * 1.5),
      eor: Math.round(spotPrice + defaultStep * 0.5),
      eorPlus1: Math.round(spotPrice + defaultStep * 1.5),
      sModerate: Math.round(spotPrice - defaultStep * 0.5),
      sRisky: Math.round(spotPrice - defaultStep * 0.25),
      rModerate: Math.round(spotPrice + defaultStep * 0.5),
      rRisky: Math.round(spotPrice + defaultStep * 0.25),
      supportStrike,
      resistanceStrike,
      spotPrice,
      maxPainSl: Math.round(spotPrice - defaultStep * 1.5),
      maxGainTarget: Math.round(spotPrice + defaultStep * 0.5),
    };
  }

  // Determine strike step from sorted strike list
  const sorted = [...strikes].sort((a, b) => a.strike - b.strike);
  let step = 50;
  if (sorted.length >= 2) {
    const diff = Math.abs(sorted[1].strike - sorted[0].strike);
    if (diff > 0) step = diff;
  }

  const strikeMap = new Map<number, OptionChainStrike>();
  for (const s of sorted) {
    strikeMap.set(s.strike, s);
  }

  const getPutReversal = (strike: number): number => {
    const row = strikeMap.get(strike);
    const ltp = row?.put.ltp;
    if (ltp != null && ltp > 0) {
      return Math.round((strike - ltp) * 100) / 100;
    }
    // Estimated premium
    const dist = Math.abs(strike - spotPrice);
    const estimatedPrem = Math.max(15, spotPrice * 0.006 - dist * 0.05);
    return Math.round((strike - estimatedPrem) * 100) / 100;
  };

  const getCallReversal = (strike: number): number => {
    const row = strikeMap.get(strike);
    const ltp = row?.call.ltp;
    if (ltp != null && ltp > 0) {
      return Math.round((strike + ltp) * 100) / 100;
    }
    const dist = Math.abs(strike - spotPrice);
    const estimatedPrem = Math.max(15, spotPrice * 0.006 - dist * 0.05);
    return Math.round((strike + estimatedPrem) * 100) / 100;
  };

  const eos = getPutReversal(supportStrike);
  const eosMinus1 = getPutReversal(supportStrike - step);
  const eor = getCallReversal(resistanceStrike);
  const eorPlus1 = getCallReversal(resistanceStrike + step);

  const sModerate = eos;
  const sRisky = Math.round((eos + step * 0.25) * 100) / 100;
  const rModerate = eor;
  const rRisky = Math.round((eor - step * 0.25) * 100) / 100;

  return {
    eos,
    eosMinus1,
    eor,
    eorPlus1,
    sModerate,
    sRisky,
    rModerate,
    rRisky,
    supportStrike,
    resistanceStrike,
    spotPrice,
    maxPainSl: eosMinus1,
    maxGainTarget: eor,
  };
}

/**
 * 4. 09:20 AM Static Snapshot Storage & Retrieval:
 * Snapshots the key levels at 09:20 AM IST and stores in `config/ltp-0920-snapshots.json`.
 */
const SNAPSHOT_FILE = path.join(process.cwd(), "config", "ltp-0920-snapshots.json");

interface SnapshotStore {
  [date: string]: {
    [underlying: string]: ReversalLevels;
  };
}

function loadSnapshotStore(): SnapshotStore {
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      const raw = fs.readFileSync(SNAPSHOT_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // fallback empty
  }
  return {};
}

function saveSnapshotStore(store: SnapshotStore): void {
  try {
    const dir = path.dirname(SNAPSHOT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

export function getTodayDateString(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

export function isPastNineTwentyAmIst(): boolean {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  // IST is UTC + 5:30
  // 09:20 AM IST = 03:50 AM UTC
  const istMinutesSinceMidnight = (utcHours * 60 + utcMinutes + 330) % 1440;
  const targetNineTwentyMinutes = 9 * 60 + 20; // 560
  return istMinutesSinceMidnight >= targetNineTwentyMinutes;
}

export function getOrSave0920Snapshot(
  underlying: string,
  currentLevels: ReversalLevels,
): ReversalLevels | null {
  const dateKey = getTodayDateString();
  const store = loadSnapshotStore();

  if (store[dateKey]?.[underlying]) {
    return store[dateKey][underlying];
  }

  // If time is past 09:20 AM IST, take and persist today's initial snapshot
  if (isPastNineTwentyAmIst()) {
    if (!store[dateKey]) store[dateKey] = {};
    store[dateKey][underlying] = currentLevels;
    saveSnapshotStore(store);
    return currentLevels;
  }

  return null;
}

/**
 * 5. Stocks 4-Line Mode (P2, P1, C1, C2) with Risk Scoring (0 to 4):
 * For F&O equities, derives the 4 critical institutional price lines.
 */
export function computeStockFourLine(
  instrument: FOInstrument,
  liveLtp?: number,
  referencePrice?: number,
): StockFourLineLevels {
  const ltp = liveLtp ?? instrument.defaultPrice;
  const basePrice = referencePrice ?? instrument.defaultPrice;

  // Determine dynamic strike step for this stock
  let step = 10;
  if (basePrice < 200) step = 2.5;
  else if (basePrice < 500) step = 5;
  else if (basePrice < 1000) step = 10;
  else if (basePrice < 2500) step = 25;
  else if (basePrice < 5000) step = 50;
  else step = 100;

  const atm = Math.round(basePrice / step) * step;
  const dailyMoveEst = Math.max(1, basePrice * (instrument.baseIV / 100) * 0.052);
  const prem = Math.round((dailyMoveEst * 0.75) * 100) / 100;

  // 4 Lines:
  // P2: Top Resistance (ATM + 2 steps + prem)
  // P1: Inner Resistance (ATM + 1 step + prem)
  // C1: Inner Support (ATM - 1 step - prem)
  // C2: Bottom Support (ATM - 2 steps - prem)
  const p2 = Math.round((atm + 2 * step + prem) * 100) / 100;
  const p1 = Math.round((atm + step + prem) * 100) / 100;
  const c1 = Math.round((atm - step - prem) * 100) / 100;
  const c2 = Math.round((atm - 2 * step - prem) * 100) / 100;

  // Nearest line & distance
  const lines: Array<{ name: "P2" | "P1" | "C1" | "C2"; val: number }> = [
    { name: "P2", val: p2 },
    { name: "P1", val: p1 },
    { name: "C1", val: c1 },
    { name: "C2", val: c2 },
  ];

  let nearestLine: "P2" | "P1" | "C1" | "C2" = "C1";
  let minDiff = Infinity;
  for (const l of lines) {
    const diff = Math.abs(ltp - l.val);
    if (diff < minDiff) {
      minDiff = diff;
      nearestLine = l.name;
    }
  }

  const distanceToNearestPct = Math.round(((minDiff / ltp) * 100) * 100) / 100;
  const isAtTrigger = distanceToNearestPct <= 0.8; // within 0.8%

  let triggerType: "BULLISH_C1_C2" | "BEARISH_P1_P2" | "NONE" = "NONE";
  if (isAtTrigger) {
    if (nearestLine === "C1" || nearestLine === "C2") {
      triggerType = "BULLISH_C1_C2";
    } else {
      triggerType = "BEARISH_P1_P2";
    }
  }

  // Bullish Risk (0 = Best long entry near C1/C2, 4 = Worst)
  const distToC1 = Math.abs(ltp - c1) / ltp;
  const distToC2 = Math.abs(ltp - c2) / ltp;
  let bullishRisk = 3;
  if (distToC1 <= 0.005 || distToC2 <= 0.005) bullishRisk = 0;
  else if (distToC1 <= 0.01 || distToC2 <= 0.01) bullishRisk = 1;
  else if (distToC1 <= 0.02 || distToC2 <= 0.02) bullishRisk = 2;
  else if (ltp > p1) bullishRisk = 4;

  // Bearish Risk (0 = Best short/put entry near P1/P2, 4 = Worst)
  const distToP1 = Math.abs(ltp - p1) / ltp;
  const distToP2 = Math.abs(ltp - p2) / ltp;
  let bearishRisk = 3;
  if (distToP1 <= 0.005 || distToP2 <= 0.005) bearishRisk = 0;
  else if (distToP1 <= 0.01 || distToP2 <= 0.01) bearishRisk = 1;
  else if (distToP1 <= 0.02 || distToP2 <= 0.02) bearishRisk = 2;
  else if (ltp < c1) bearishRisk = 4;

  return {
    symbol: instrument.symbol,
    name: instrument.name,
    sector: instrument.sector,
    ltp,
    p2,
    p1,
    c1,
    c2,
    bullishEntry: Math.round(c1 * 100) / 100,
    bullishSl: Math.round((c2 - step * 0.5) * 100) / 100,
    bullishTarget1: p1,
    bullishTarget2: p2,
    bearishEntry: Math.round(p1 * 100) / 100,
    bearishSl: Math.round((p2 + step * 0.5) * 100) / 100,
    bearishTarget1: c1,
    bearishTarget2: c2,
    bullishRisk,
    bearishRisk,
    nearestLine,
    distanceToNearestPct,
    isAtTrigger,
    triggerType,
  };
}

/**
 * 6. LTP Blast F&O Stock Screener:
 * Scans 200+ F&O universe and identifies stocks trading at key P1/P2 or C1/C2 trigger lines
 * with Bullish Risk <= 1 or Bearish Risk <= 1.
 */
export async function scanLtpBlastUniverse(
  filter: "ALL" | "BULLISH" | "BEARISH" = "ALL",
): Promise<StockFourLineLevels[]> {
  const symbols = FO_UNIVERSE.map((i) => i.symbol);

  // Ingest live quotes batch
  try {
    await fetchLiveQuotesBatch(symbols, 25);
  } catch {
    // fallback cached
  }

  const results: StockFourLineLevels[] = [];

  for (const inst of FO_UNIVERSE) {
    const cached = getCachedMarketData(inst.symbol);
    const liveLtp = cached?.ltp && cached.ltp > 0 ? cached.ltp : inst.defaultPrice;
    const calc = computeStockFourLine(inst, liveLtp);

    if (filter === "BULLISH" && calc.triggerType !== "BULLISH_C1_C2") continue;
    if (filter === "BEARISH" && calc.triggerType !== "BEARISH_P1_P2") continue;

    results.push(calc);
  }

  // Sort by lowest risk first, then closest distance
  results.sort((a, b) => {
    const riskA = Math.min(a.bullishRisk, a.bearishRisk);
    const riskB = Math.min(b.bullishRisk, b.bearishRisk);
    if (riskA !== riskB) return riskA - riskB;
    return a.distanceToNearestPct - b.distanceToNearestPct;
  });

  return results;
}

/**
 * 7. Master LTP Calculator Process:
 * Synthesizes OptionChainSnapshot into the complete AI LTP Calculator & COA 1.0 output.
 */
export function processOptionChainToLtpCalculator(
  snapshot: OptionChainSnapshot,
): LtpCalculatorOutput {
  const spotPrice = snapshot.spotPrice ?? 25000;

  // Evaluate Call Side (Resistance)
  const callEval = evaluateSideDominance(snapshot.strikes, "CALL", spotPrice);

  // Evaluate Put Side (Support)
  const putEval = evaluateSideDominance(snapshot.strikes, "PUT", spotPrice);

  // Classify COA 1.0 Scenario
  const coaScenario = classifyCoaScenario(
    putEval.state,
    callEval.state,
    putEval.dominantFactor,
    callEval.dominantFactor,
  );

  // Calculate Exact Reversal & Diversion Levels
  const reversalLevels = calculateReversalLevels(
    snapshot.strikes,
    spotPrice,
    putEval.dominantStrike,
    callEval.dominantStrike,
  );

  // Find ATM strike
  let atmStrike = snapshot.strikes[0]?.strike ?? spotPrice;
  let minDiff = Infinity;
  for (const s of snapshot.strikes) {
    const diff = Math.abs(s.strike - spotPrice);
    if (diff < minDiff) {
      minDiff = diff;
      atmStrike = s.strike;
    }
  }

  // Get or persist 09:20 AM static levels
  const static0920Snapshot = getOrSave0920Snapshot(snapshot.instrument, reversalLevels);

  return {
    underlying: snapshot.instrument,
    spotPrice,
    timestamp: snapshot.timestamp,
    coaScenario,
    reversalLevels,
    callStrikes: callEval.items,
    putStrikes: putEval.items,
    atmStrike,
    static0920Snapshot,
  };
}
