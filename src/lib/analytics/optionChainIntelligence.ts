// EagleBABA Proprietary Mathematical Framework
// Module: Additive Option-Chain Intelligence Engine (PAZ, PDI, OVM-9, RSB, Top-Down Range)
// Pure, client/server safe TypeScript module.
// Protected engines remain 100% untouched.

import type { StrikeDominance, ReversalLevels, ShiftingState } from "@/lib/options/ltp-calculator-engine.server";
import type { OptionLeg } from "@/lib/options-analytics";

export interface PazAnchorZone {
  readonly strike: number;
  readonly factor: "OI" | "VOLUME" | "BOTH";
  readonly oi: number;
  readonly oiPct: number;
  readonly volume: number;
  readonly volPct: number;
  readonly reversalPrice: number;
  readonly isAtm: boolean;
}

export type PdiDriftDirection = "TOP" | "BOTTOM" | "STRONG";

export type AnchorPressureState =
  | "STABLE_STRONG"
  | "WTT_TO_STRONG"
  | "WTB_TO_STRONG"
  | "SHIFTED_B2T"
  | "SHIFTED_T2B";

export type SlRiskTier = "TIGHT" | "MODERATE" | "WIDE";

export interface D1ScalpPlan {
  readonly enabled: boolean;
  readonly direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  readonly entryPrice: number;
  readonly stopLossPrice: number;
  readonly targetPrice: number;
  readonly pointDistance: number;
  readonly recommendedCapPts: number;
  readonly overExtended: boolean;
  readonly label: string;
}

export interface PdiDriftIndex {
  readonly side: "CALL" | "PUT";
  readonly primaryStrike: number;
  readonly secondaryStrike: number;
  readonly primaryValue: number;
  readonly secondaryValue: number;
  readonly driftPct: number; // Secondary relative to primary (0-100+)
  readonly isDrifting: boolean; // >= 75%
  readonly direction: PdiDriftDirection; // "TOP" (>= 75% higher strike), "BOTTOM" (>= 75% lower strike), "STRONG" (< 75%)
  readonly pressureState: AnchorPressureState;
  readonly pressureBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  readonly label: string; // e.g. "STRONG (100%)", "WTT ↗ (84.2%)", "WTB ↘ (79.1%)"
}

export type Ovm9RegimeState =
  | "Neutral / Consolidation"
  | "Slight Bullish"
  | "Momentum Surge"
  | "Slight Bearish"
  | "Cascade Breakdown"
  | "Dual-Side Trap (Type A)"
  | "Dual-Side Trap (Type B)";

export interface Ovm9Matrix {
  readonly regime: Ovm9RegimeState;
  readonly sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" | "HIGH_RISK";
  readonly callOiSlope: number;
  readonly putOiSlope: number;
  readonly callOiChangeSum: number;
  readonly putOiChangeSum: number;
  readonly callOiTotal: number;
  readonly putOiTotal: number;
  readonly pcrOi: number;
  readonly pcrVolume: number;
  readonly badgeColor: "emerald" | "rose" | "amber" | "gold" | "purple";
  readonly description: string;
}

export interface RsbExecutionMatrix {
  readonly conservativeEntry: number;
  readonly aggressiveEntry: number;
  readonly invalidationStop: number;
  readonly target1: number;
  readonly target2: number;
  readonly target3: number;
  readonly extendedTolerance: boolean; // RSB-Ext triggered
  readonly extensionStrikes: number; // +1 strike if support migrated bottom-to-top
  readonly tradable: boolean;
  readonly tradeReason: string;
  readonly riskDistance: number;
  readonly rewardDistance: number;
  readonly rewardToRiskRatio: number;
  readonly slDistancePts: number;
  readonly slRiskTier: SlRiskTier;
  readonly oneSidedGating: "BEARISH_ONLY" | "BULLISH_ONLY" | "NONE";
  readonly suppressedSide: "BULLISH" | "BEARISH" | null;
  readonly side: "BUY_CE" | "BUY_PE" | "WAIT";
  readonly invalidatedLevels: readonly string[];
}

export interface TopDownRangeMatrix {
  readonly spotPrice: number;
  readonly weeklyRange: {
    readonly low: number;
    readonly high: number;
    readonly expectedMove: number;
    readonly iv: number;
    readonly ivExpansion: boolean;
    readonly label: string;
  };
  readonly dayRange0920: {
    readonly low: number;
    readonly high: number;
    readonly source: "STATIC_0920" | "ESTIMATED";
    readonly label: string;
  };
}

export interface StrikeIntelligenceOverlay {
  readonly strike: number;
  readonly isPazSup: boolean;
  readonly isPazRes: boolean;
  readonly callPdiPct: number;
  readonly putPdiPct: number;
  readonly callPdiLabel: string;
  readonly putPdiLabel: string;
  readonly isCallAnchorChallenger: boolean;
  readonly isPutAnchorChallenger: boolean;
}

export interface AnchorShiftEvent {
  readonly timestamp: string;
  readonly side: "CALL" | "PUT";
  readonly fromStrike: number;
  readonly toStrike: number;
  readonly type: "BOTTOM_TO_TOP" | "TOP_TO_BOTTOM";
}

export interface OptionChainIntelligenceInput {
  readonly underlying: string;
  readonly spotPrice: number;
  readonly atmStrike?: number;
  readonly strikeStep?: number;
  readonly timestamp?: string;
  readonly expiry?: string;
  readonly callStrikes?: readonly StrikeDominance[];
  readonly putStrikes?: readonly StrikeDominance[];
  readonly legs?: readonly OptionLeg[];
  readonly strikes?: readonly number[];
  readonly reversalLevels?: ReversalLevels;
  readonly static0920Snapshot?: ReversalLevels | null;
  readonly intradayShiftHistory?: readonly AnchorShiftEvent[];
}

export type SessionOiProfile =
  | "EXPIRY_BARRIER_RANGE"
  | "EVENT_HIGH_OI_OVERRIDE"
  | "DIRECTIONAL_MOMENTUM";

export type IntradayFlowBias =
  | "CALL_FLOW_EDGE"
  | "PUT_FLOW_EDGE"
  | "BALANCED_RANGE";

export interface SessionFlowIntelligence {
  readonly oiProfile: SessionOiProfile;
  readonly isExpirySession: boolean;
  readonly highOiOverride: boolean;
  readonly atmCallVolume: number;
  readonly atmPutVolume: number;
  readonly atmVolumeDominance: "CALL" | "PUT" | "BALANCED";
  readonly callDeltaOiVsVolRatio: number;
  readonly putDeltaOiVsVolRatio: number;
  readonly deltaOiContrastNote: string;
  readonly flowBias: IntradayFlowBias;
  readonly summary: string;
}

export interface OptionChainIntelligenceResult {
  readonly underlying: string;
  readonly spotPrice: number;
  readonly atmStrike: number;
  readonly strikeStep: number;
  readonly timestamp: string;
  readonly pazSup: PazAnchorZone;
  readonly pazRes: PazAnchorZone;
  readonly pdiTop: PdiDriftIndex;
  readonly pdiBot: PdiDriftIndex;
  readonly ovm9: Ovm9Matrix;
  readonly sessionFlow: SessionFlowIntelligence;
  readonly rsbExecution: RsbExecutionMatrix;
  readonly d1ScalpPlan: D1ScalpPlan;
  readonly topDownRange: TopDownRangeMatrix;
  readonly strikeOverlays: ReadonlyMap<number, StrikeIntelligenceOverlay>;
}

/** Classify explicit pressure-judgment state for an anchor side */
function classifyAnchorPressure(
  side: "CALL" | "PUT",
  direction: PdiDriftDirection,
  isDrifting: boolean,
  shiftHistory: readonly AnchorShiftEvent[],
): { pressureState: AnchorPressureState; pressureBias: "BULLISH" | "BEARISH" | "NEUTRAL" } {
  const latestShift = [...shiftHistory].reverse().find((ev) => ev.side === side);
  if (latestShift) {
    if (latestShift.type === "BOTTOM_TO_TOP") {
      return { pressureState: "SHIFTED_B2T", pressureBias: "BULLISH" };
    }
    return { pressureState: "SHIFTED_T2B", pressureBias: "BEARISH" };
  }
  if (isDrifting) {
    if (direction === "TOP") {
      return { pressureState: "WTT_TO_STRONG", pressureBias: "BEARISH" };
    }
    if (direction === "BOTTOM") {
      return { pressureState: "WTB_TO_STRONG", pressureBias: "BULLISH" };
    }
  }
  return { pressureState: "STABLE_STRONG", pressureBias: "NEUTRAL" };
}

/** Check if given timestamp/now is within the opening settlement window 09:15 - 09:20 IST */
export function isOpeningSettlementWindow(timestamp?: string | Date): boolean {
  try {
    const d = timestamp ? new Date(timestamp) : new Date();
    if (isNaN(d.getTime())) return false;
    const istHours = Number(
      new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(d),
    );
    const istMinutes = Number(
      new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", minute: "numeric" }).format(d),
    );
    return istHours === 9 && istMinutes >= 15 && istMinutes < 20;
  } catch {
    return false;
  }
}

/** Standard strike step for index / stocks */
export function resolveStrikeStep(underlying: string, explicitStep?: number, strikes?: readonly number[]): number {
  if (explicitStep && explicitStep > 0) return explicitStep;
  const upper = underlying.toUpperCase();
  if (upper === "NIFTY" || upper === "NIFTY50" || upper === "FINNIFTY") return 50;
  if (upper === "BANKNIFTY" || upper === "BANKEX") return 100;
  if (upper === "SENSEX") return 100;
  if (upper === "MIDCPNIFTY") return 25;

  if (strikes && strikes.length >= 2) {
    const sorted = [...strikes].sort((a, b) => a - b);
    let minDiff = Infinity;
    for (let i = 1; i < sorted.length; i++) {
      const diff = sorted[i] - sorted[i - 1];
      if (diff > 0 && diff < minDiff) minDiff = diff;
    }
    if (Number.isFinite(minDiff) && minDiff > 0) return minDiff;
  }
  return 50;
}

/** Convert raw OptionLeg[] into StrikeDominance[] if callStrikes/putStrikes not supplied */
function buildStrikeDominanceFromLegs(
  legs: readonly OptionLeg[],
  side: "CALL" | "PUT",
  spotPrice: number,
  step: number,
): StrikeDominance[] {
  const targetSide = side === "CALL" ? "CE" : "PE";
  const filtered = legs.filter((l) => l.side === targetSide && l.strike > 0);
  if (filtered.length === 0) return [];

  const maxVol = Math.max(1, ...filtered.map((l) => l.volume));
  const maxOi = Math.max(1, ...filtered.map((l) => l.oi));

  return filtered.map((l) => {
    const volPct = Math.round((l.volume / maxVol) * 1000) / 10;
    const oiPct = Math.round((l.oi / maxOi) * 1000) / 10;
    const isMaxVol = l.volume === maxVol;
    const isMaxOi = l.oi === maxOi;
    const reversalPrice = side === "CALL" ? l.strike + l.ltp : l.strike - l.ltp;

    return {
      strike: l.strike,
      volume: l.volume,
      volPct,
      oi: l.oi,
      oiPct,
      ltp: l.ltp,
      iv: l.iv,
      isMaxVol,
      isMaxOi,
      isWttVol: false,
      isWtbVol: false,
      isWttOi: false,
      isWtbOi: false,
      reversalPrice: Number.isFinite(reversalPrice) && reversalPrice > 0 ? reversalPrice : l.strike,
    };
  });
}

/**
 * Main Pure Computation Function
 * Generates all 5 intelligence modules from option chain data.
 */
export function computeOptionChainIntelligence(
  input: OptionChainIntelligenceInput,
): OptionChainIntelligenceResult {
  const {
    underlying,
    spotPrice,
    timestamp = new Date().toISOString(),
    expiry,
    reversalLevels,
    static0920Snapshot,
    intradayShiftHistory = [],
  } = input;

  const step = resolveStrikeStep(underlying, input.strikeStep, input.strikes);
  const atm =
    input.atmStrike && input.atmStrike > 0
      ? input.atmStrike
      : Math.round(spotPrice / step) * step;

  // Resolve call and put strikes
  const callStrikes: readonly StrikeDominance[] =
    input.callStrikes && input.callStrikes.length > 0
      ? input.callStrikes
      : input.legs
        ? buildStrikeDominanceFromLegs(input.legs, "CALL", spotPrice, step)
        : [];

  const putStrikes: readonly StrikeDominance[] =
    input.putStrikes && input.putStrikes.length > 0
      ? input.putStrikes
      : input.legs
        ? buildStrikeDominanceFromLegs(input.legs, "PUT", spotPrice, step)
        : [];

  // =========================================================================
  // 1. PRIMARY ANCHOR ZONES (PAZ-Sup & PAZ-Res)
  // Scan outward from ATM imaginary line to identify first strike with max Vol/OI
  // =========================================================================

  // Put Anchor (Support): scan outward from ATM downward
  const sortedPuts = [...putStrikes].sort((a, b) => b.strike - a.strike); // descending from high to low
  const maxPutOi = Math.max(1, ...putStrikes.map((s) => s.oi));
  const maxPutVol = Math.max(1, ...putStrikes.map((s) => s.volume));

  let pazSupStrike = sortedPuts.find((s) => s.strike <= atm && (s.isMaxOi || s.isMaxVol))?.strike;
  if (!pazSupStrike) {
    pazSupStrike = sortedPuts.find((s) => s.isMaxOi || s.isMaxVol)?.strike;
  }
  if (!pazSupStrike && putStrikes.length > 0) {
    pazSupStrike = sortedPuts[0].strike;
  }
  pazSupStrike = pazSupStrike ?? atm;

  const pazSupDominance = putStrikes.find((s) => s.strike === pazSupStrike);
  const pazSupFactor: "OI" | "VOLUME" | "BOTH" =
    pazSupDominance?.isMaxOi && pazSupDominance?.isMaxVol
      ? "BOTH"
      : pazSupDominance?.isMaxOi
        ? "OI"
        : pazSupDominance?.isMaxVol
          ? "VOLUME"
          : (pazSupDominance?.oi ?? 0) >= (pazSupDominance?.volume ?? 0)
            ? "OI"
            : "VOLUME";

  const pazSupReversal =
    reversalLevels?.eos ??
    (pazSupDominance && pazSupDominance.ltp != null && pazSupDominance.ltp > 0
      ? pazSupStrike - pazSupDominance.ltp
      : pazSupStrike - step * 0.4);

  const pazSup: PazAnchorZone = {
    strike: pazSupStrike,
    factor: pazSupFactor,
    oi: pazSupDominance?.oi ?? 0,
    oiPct: pazSupDominance?.oiPct ?? (pazSupDominance ? Math.round(((pazSupDominance.oi) / maxPutOi) * 1000) / 10 : 100),
    volume: pazSupDominance?.volume ?? 0,
    volPct: pazSupDominance?.volPct ?? (pazSupDominance ? Math.round(((pazSupDominance.volume) / maxPutVol) * 1000) / 10 : 100),
    reversalPrice: Number(pazSupReversal.toFixed(2)),
    isAtm: pazSupStrike === atm,
  };

  // Call Anchor (Resistance): scan outward from ATM upward
  const sortedCalls = [...callStrikes].sort((a, b) => a.strike - b.strike); // ascending from low to high
  const maxCallOi = Math.max(1, ...callStrikes.map((s) => s.oi));
  const maxCallVol = Math.max(1, ...callStrikes.map((s) => s.volume));

  let pazResStrike = sortedCalls.find((s) => s.strike >= atm && (s.isMaxOi || s.isMaxVol))?.strike;
  if (!pazResStrike) {
    pazResStrike = sortedCalls.find((s) => s.isMaxOi || s.isMaxVol)?.strike;
  }
  if (!pazResStrike && callStrikes.length > 0) {
    pazResStrike = sortedCalls[sortedCalls.length - 1].strike;
  }
  pazResStrike = pazResStrike ?? atm;

  const pazResDominance = callStrikes.find((s) => s.strike === pazResStrike);
  const pazResFactor: "OI" | "VOLUME" | "BOTH" =
    pazResDominance?.isMaxOi && pazResDominance?.isMaxVol
      ? "BOTH"
      : pazResDominance?.isMaxOi
        ? "OI"
        : pazResDominance?.isMaxVol
          ? "VOLUME"
          : (pazResDominance?.oi ?? 0) >= (pazResDominance?.volume ?? 0)
            ? "OI"
            : "VOLUME";

  const pazResReversal =
    reversalLevels?.eor ??
    (pazResDominance && pazResDominance.ltp != null && pazResDominance.ltp > 0
      ? pazResStrike + pazResDominance.ltp
      : pazResStrike + step * 0.4);

  const pazRes: PazAnchorZone = {
    strike: pazResStrike,
    factor: pazResFactor,
    oi: pazResDominance?.oi ?? 0,
    oiPct: pazResDominance?.oiPct ?? (pazResDominance ? Math.round(((pazResDominance.oi) / maxCallOi) * 1000) / 10 : 100),
    volume: pazResDominance?.volume ?? 0,
    volPct: pazResDominance?.volPct ?? (pazResDominance ? Math.round(((pazResDominance.volume) / maxCallVol) * 1000) / 10 : 100),
    reversalPrice: Number(pazResReversal.toFixed(2)),
    isAtm: pazResStrike === atm,
  };

  // =========================================================================
  // 2. PRESSURE DRIFT INDEX (PDI-Top & PDI-Bot)
  // Calculate percentage strength of secondary strikes relative to primary anchor
  // >= 75% triggers active drift
  // =========================================================================

  // Call PDI (Top Pressure):
  let callChallengerStrike = pazResStrike;
  let callMaxChallengerPct = 0;
  let callPrimaryVal = Math.max(pazResDominance?.oi ?? 0, pazResDominance?.volume ?? 0);
  if (callPrimaryVal <= 0) callPrimaryVal = 1;

  for (const c of callStrikes) {
    if (c.strike === pazResStrike) continue;
    const val = Math.max(c.oi, c.volume);
    const pct = (val / callPrimaryVal) * 100;
    if (pct > callMaxChallengerPct) {
      callMaxChallengerPct = pct;
      callChallengerStrike = c.strike;
    }
  }

  const callIsDrifting = callMaxChallengerPct >= 75.0;
  let callDirection: PdiDriftDirection = "STRONG";
  if (callIsDrifting) {
    callDirection = callChallengerStrike > pazResStrike ? "TOP" : "BOTTOM";
  }

  const callPressure = classifyAnchorPressure("CALL", callDirection, callIsDrifting, intradayShiftHistory);

  const pdiTop: PdiDriftIndex = {
    side: "CALL",
    primaryStrike: pazResStrike,
    secondaryStrike: callChallengerStrike,
    primaryValue: callPrimaryVal,
    secondaryValue: Math.round((callMaxChallengerPct / 100) * callPrimaryVal),
    driftPct: Number(callMaxChallengerPct.toFixed(1)),
    isDrifting: callIsDrifting,
    direction: callDirection,
    pressureState: callPressure.pressureState,
    pressureBias: callPressure.pressureBias,
    label:
      callDirection === "TOP"
        ? `WTT ↗ (${callMaxChallengerPct.toFixed(1)}% at ${callChallengerStrike})`
        : callDirection === "BOTTOM"
          ? `WTB ↘ (${callMaxChallengerPct.toFixed(1)}% at ${callChallengerStrike})`
          : `STRONG (100% at ${pazResStrike})`,
  };

  // Put PDI (Bottom Pressure):
  let putChallengerStrike = pazSupStrike;
  let putMaxChallengerPct = 0;
  let putPrimaryVal = Math.max(pazSupDominance?.oi ?? 0, pazSupDominance?.volume ?? 0);
  if (putPrimaryVal <= 0) putPrimaryVal = 1;

  for (const p of putStrikes) {
    if (p.strike === pazSupStrike) continue;
    const val = Math.max(p.oi, p.volume);
    const pct = (val / putPrimaryVal) * 100;
    if (pct > putMaxChallengerPct) {
      putMaxChallengerPct = pct;
      putChallengerStrike = p.strike;
    }
  }

  const putIsDrifting = putMaxChallengerPct >= 75.0;
  let putDirection: PdiDriftDirection = "STRONG";
  if (putIsDrifting) {
    putDirection = putChallengerStrike > pazSupStrike ? "TOP" : "BOTTOM";
  }

  const putPressure = classifyAnchorPressure("PUT", putDirection, putIsDrifting, intradayShiftHistory);

  const pdiBot: PdiDriftIndex = {
    side: "PUT",
    primaryStrike: pazSupStrike,
    secondaryStrike: putChallengerStrike,
    primaryValue: putPrimaryVal,
    secondaryValue: Math.round((putMaxChallengerPct / 100) * putPrimaryVal),
    driftPct: Number(putMaxChallengerPct.toFixed(1)),
    isDrifting: putIsDrifting,
    direction: putDirection,
    pressureState: putPressure.pressureState,
    pressureBias: putPressure.pressureBias,
    label:
      putDirection === "TOP"
        ? `WTT ↗ (${putMaxChallengerPct.toFixed(1)}% at ${putChallengerStrike})`
        : putDirection === "BOTTOM"
          ? `WTB ↘ (${putMaxChallengerPct.toFixed(1)}% at ${putChallengerStrike})`
          : `STRONG (100% at ${pazSupStrike})`,
  };

  // Track bottom-to-top migration from history or active WTT drift
  const hasBottomToTopShift =
    intradayShiftHistory.some(
      (ev) => ev.side === "PUT" && ev.type === "BOTTOM_TO_TOP",
    ) ||
    (putIsDrifting && putDirection === "TOP" && putMaxChallengerPct >= 80.0);

  // =========================================================================
  // 3. ORDERFLOW VELOCITY MATRIX (OVM-9)
  // Evaluate Call OI Change vs Put OI Change slopes to classify 7 actionable states
  // =========================================================================

  // Sum OI changes from legs or strikes
  let callOiChangeSum = 0;
  let putOiChangeSum = 0;
  let callOiTotal = 0;
  let putOiTotal = 0;
  let callVolTotal = 0;
  let putVolTotal = 0;

  if (input.legs && input.legs.length > 0) {
    for (const leg of input.legs) {
      if (leg.side === "CE") {
        callOiChangeSum += leg.changeOi;
        callOiTotal += leg.oi;
        callVolTotal += leg.volume;
      } else {
        putOiChangeSum += leg.changeOi;
        putOiTotal += leg.oi;
        putVolTotal += leg.volume;
      }
    }
  } else {
    for (const c of callStrikes) {
      callOiTotal += c.oi;
      callVolTotal += c.volume;
      // Synthesize slope approximation if legs absent
      callOiChangeSum += c.isWttOi ? c.oi * 0.15 : c.isWtbOi ? -c.oi * 0.1 : c.oi * 0.05;
    }
    for (const p of putStrikes) {
      putOiTotal += p.oi;
      putVolTotal += p.volume;
      putOiChangeSum += p.isWttOi ? p.oi * 0.15 : p.isWtbOi ? -p.oi * 0.1 : p.oi * 0.05;
    }
  }

  const pcrOi = callOiTotal > 0 ? Number((putOiTotal / callOiTotal).toFixed(2)) : 1.0;
  const pcrVolume = callVolTotal > 0 ? Number((putVolTotal / callVolTotal).toFixed(2)) : 1.0;

  const callOiSlope = callOiTotal > 0 ? Number(((callOiChangeSum / callOiTotal) * 100).toFixed(2)) : 0;
  const putOiSlope = putOiTotal > 0 ? Number(((putOiChangeSum / putOiTotal) * 100).toFixed(2)) : 0;

  let ovmRegime: Ovm9RegimeState = "Neutral / Consolidation";
  let ovmSentiment: "BULLISH" | "BEARISH" | "NEUTRAL" | "HIGH_RISK" = "NEUTRAL";
  let ovmBadgeColor: "emerald" | "rose" | "amber" | "gold" | "purple" = "amber";
  let ovmDescription = "Call and Put writing velocity balanced. Market consolidating within primary anchor boundaries.";

  const totalAbsDelta = Math.abs(putOiChangeSum) + Math.abs(callOiChangeSum);
  const isHighVelocity = totalAbsDelta > (callOiTotal + putOiTotal) * 0.04 || totalAbsDelta > 500_000;

  // Dual-Side Trap checks:
  if (callOiChangeSum > 0 && putOiChangeSum > 0 && callOiSlope > 5 && putOiSlope > 5 && Math.abs(callOiSlope - putOiSlope) < 4) {
    // Both sides writing aggressively -> Straddle compression trap
    ovmRegime = "Dual-Side Trap (Type A)";
    ovmSentiment = "HIGH_RISK";
    ovmBadgeColor = "purple";
    ovmDescription = "Aggressive simultaneous Call and Put writing creates straddle pinning trap. High theta decay risk.";
  } else if (callOiChangeSum < 0 && putOiChangeSum < 0 && (callOiSlope < -3 || putOiSlope < -3)) {
    // Both sides unwinding -> Stop hunt / liquidation trap
    ovmRegime = "Dual-Side Trap (Type B)";
    ovmSentiment = "HIGH_RISK";
    ovmBadgeColor = "purple";
    ovmDescription = "Dual-side OI liquidation and contract unwinding. High slippage and stop hunt volatility risk.";
  } else if (putOiChangeSum > 0 && putOiChangeSum >= 1.7 * Math.max(1, Math.abs(callOiChangeSum)) && isHighVelocity) {
    // Strong Put writing + Call covering -> Momentum Surge
    ovmRegime = "Momentum Surge";
    ovmSentiment = "BULLISH";
    ovmBadgeColor = "emerald";
    ovmDescription = "Dominant Put writing velocity and Call short-covering driving powerful upward expansion.";
  } else if (callOiChangeSum > 0 && callOiChangeSum >= 1.7 * Math.max(1, Math.abs(putOiChangeSum)) && isHighVelocity) {
    // Strong Call writing + Put unwinding -> Cascade Breakdown
    ovmRegime = "Cascade Breakdown";
    ovmSentiment = "BEARISH";
    ovmBadgeColor = "rose";
    ovmDescription = "Heavy Call writing pressure and Put long liquidation accelerating downward cascade.";
  } else if (putOiChangeSum > callOiChangeSum && (putOiSlope > callOiSlope + 2 || pcrOi > 1.15)) {
    ovmRegime = "Slight Bullish";
    ovmSentiment = "BULLISH";
    ovmBadgeColor = "emerald";
    ovmDescription = "Moderate Put buildup with positive slope; dips into support anchor favoured for upside retests.";
  } else if (callOiChangeSum > putOiChangeSum && (callOiSlope > putOiSlope + 2 || pcrOi < 0.85)) {
    ovmRegime = "Slight Bearish";
    ovmSentiment = "BEARISH";
    ovmBadgeColor = "rose";
    ovmDescription = "Moderate Call buildup overhead with negative slope; rallies into resistance anchor favoured for rejection.";
  } else {
    ovmRegime = "Neutral / Consolidation";
    ovmSentiment = "NEUTRAL";
    ovmBadgeColor = "gold";
    ovmDescription = "Call and Put writing velocity balanced. Market oscillating within primary anchor boundaries.";
  }

  const ovm9: Ovm9Matrix = {
    regime: ovmRegime,
    sentiment: ovmSentiment,
    callOiSlope,
    putOiSlope,
    callOiChangeSum,
    putOiChangeSum,
    callOiTotal,
    putOiTotal,
    pcrOi,
    pcrVolume,
    badgeColor: ovmBadgeColor,
    description: ovmDescription,
  };

  // =========================================================================
  // 4. REVERSAL & STRETCH BANDS (RSB) & EXECUTION MATRIX
  // Conservative Entry, Aggressive Entry, Invalidation Stop, Targets (T1, T2, T3)
  // R:R Filter & Opening Settlement Gating
  // =========================================================================

  const extendedTolerance = hasBottomToTopShift;
  const extensionStrikes = extendedTolerance ? 1 : 0;
  const extensionPoints = extensionStrikes * step;

  let tradeSide: "BUY_CE" | "BUY_PE" | "WAIT" = "WAIT";
  let oneSidedGating: "BEARISH_ONLY" | "BULLISH_ONLY" | "NONE" = "NONE";
  let suppressedSide: "BULLISH" | "BEARISH" | null = null;

  if (ovmRegime === "Momentum Surge") {
    tradeSide = "BUY_CE";
    oneSidedGating = "BULLISH_ONLY";
    suppressedSide = "BEARISH";
  } else if (ovmRegime === "Slight Bullish") {
    tradeSide = "BUY_CE";
  } else if (ovmRegime === "Cascade Breakdown") {
    tradeSide = "BUY_PE";
    oneSidedGating = "BEARISH_ONLY";
    suppressedSide = "BULLISH";
  } else if (ovmRegime === "Slight Bearish") {
    tradeSide = "BUY_PE";
  } else {
    tradeSide = "WAIT";
  }

  let conservativeEntry = pazSup.reversalPrice;
  let aggressiveEntry = pazSupStrike;
  let invalidationStop = Number((conservativeEntry - 0.5 * step).toFixed(2));
  let target1 = Number((conservativeEntry + 1.0 * step).toFixed(2));
  let target2 = Number((conservativeEntry + 2.0 * step).toFixed(2));
  let target3 = Number((pazRes.reversalPrice + extensionPoints).toFixed(2));
  const invalidatedLevels: string[] = [];

  if (tradeSide === "BUY_CE") {
    conservativeEntry = pazSup.reversalPrice;
    aggressiveEntry = pazSupStrike;
    invalidationStop = Number((conservativeEntry - 0.5 * step).toFixed(2));
    target1 = Number((conservativeEntry + 1.0 * step).toFixed(2));
    target2 = Number((conservativeEntry + 2.0 * step).toFixed(2));
    target3 = Number((pazRes.reversalPrice + extensionPoints).toFixed(2));
  } else if (tradeSide === "BUY_PE") {
    conservativeEntry = pazRes.reversalPrice;
    aggressiveEntry = pazResStrike;
    invalidationStop = Number((conservativeEntry + 0.5 * step).toFixed(2));
    target1 = Number((conservativeEntry - 1.0 * step).toFixed(2));
    target2 = Number((conservativeEntry - 2.0 * step).toFixed(2));
    target3 = Number((pazSup.reversalPrice - (extendedTolerance ? 0 : 0)).toFixed(2));
  } else {
    // In WAIT regime (Dual Trap or Neutral), both bounds are defined
    conservativeEntry = pazSup.reversalPrice;
    aggressiveEntry = pazRes.reversalPrice;
    invalidationStop = Number((conservativeEntry - 0.5 * step).toFixed(2));
    target1 = Number((pazRes.reversalPrice).toFixed(2));
    target2 = Number((pazRes.reversalPrice + step).toFixed(2));
    target3 = Number((pazRes.reversalPrice + extensionPoints).toFixed(2));
  }

  // Dim/grey out invalidated levels based on regime
  if (ovmRegime === "Cascade Breakdown") {
    invalidatedLevels.push("conservativeEntry", "aggressiveEntry");
  } else if (ovmRegime === "Momentum Surge") {
    invalidatedLevels.push("invalidationStop");
  } else if (ovmRegime.startsWith("Dual-Side Trap")) {
    invalidatedLevels.push("aggressiveEntry", "target2", "target3");
  }

  // Tradability & R:R checks
  const riskDist = Math.abs(conservativeEntry - invalidationStop);
  const rewardDist = Math.abs(target1 - conservativeEntry);
  const rr = riskDist > 0 ? Number((rewardDist / riskDist).toFixed(2)) : 1.0;

  let tradable = true;
  let tradeReason = "ACTIVE: High Probability Alignment";

  if (isOpeningSettlementWindow(timestamp)) {
    tradable = false;
    tradeReason = "WAIT: Opening Settlement 09:15-09:20";
  } else if (ovmRegime === "Cascade Breakdown" && tradeSide === "BUY_CE") {
    tradable = false;
    tradeReason = "WAIT: Regime Invalidation (Cascade Breakdown)";
  } else if (ovmRegime === "Momentum Surge" && tradeSide === "BUY_PE") {
    tradable = false;
    tradeReason = "WAIT: Regime Invalidation (Momentum Surge)";
  } else if (ovmRegime === "Dual-Side Trap (Type A)" || ovmRegime === "Dual-Side Trap (Type B)") {
    tradable = false;
    tradeReason = `WAIT: Active ${ovmRegime}`;
  } else if (riskDist > rewardDist) {
    tradable = false;
    tradeReason = "WAIT: Unfavorable R:R (Stop Distance > T1 Distance)";
  } else if (tradeSide === "WAIT") {
    tradable = false;
    tradeReason = "WAIT: Regime In Consolidation";
  }

  const stopRef =
    tradeSide === "WAIT" && reversalLevels?.maxPainSl && reversalLevels.maxPainSl > 0
      ? reversalLevels.maxPainSl
      : invalidationStop;
  const slDistancePts = Number(Math.abs(spotPrice - stopRef).toFixed(2));
  const slRiskTier: SlRiskTier =
    slDistancePts <= step * 0.75 ? "TIGHT" : slDistancePts <= step * 1.5 ? "MODERATE" : "WIDE";

  // D1 (1:1) Fixed Points Divergence Scalp Plan (recommended cap = 25 pts)
  const D1_RECOMMENDED_CAP_PTS = 25;
  const d1Direction: "BULLISH" | "BEARISH" | "NEUTRAL" =
    tradeSide === "BUY_CE" ? "BULLISH" : tradeSide === "BUY_PE" ? "BEARISH" : "NEUTRAL";
  const d1RawDist = Math.max(1, Math.abs(spotPrice - invalidationStop));
  const d1PointDistance = Number(d1RawDist.toFixed(2));
  const d1OverExtended = d1PointDistance > D1_RECOMMENDED_CAP_PTS;
  const d1TargetPrice = Number(
    (d1Direction === "BEARISH" ? spotPrice - d1PointDistance : spotPrice + d1PointDistance).toFixed(2),
  );
  const d1ScalpPlan: D1ScalpPlan = {
    enabled: true,
    direction: d1Direction,
    entryPrice: Number(spotPrice.toFixed(2)),
    stopLossPrice: Number(invalidationStop.toFixed(2)),
    targetPrice: d1TargetPrice,
    pointDistance: d1PointDistance,
    recommendedCapPts: D1_RECOMMENDED_CAP_PTS,
    overExtended: d1OverExtended,
    label: d1OverExtended
      ? `D1 (1:1) OVER-EXTENDED (${d1PointDistance} > ${D1_RECOMMENDED_CAP_PTS} pts)`
      : `D1 (1:1) SCALP (${d1PointDistance} pts)`,
  };

  const rsbExecution: RsbExecutionMatrix = {
    conservativeEntry: Number(conservativeEntry.toFixed(2)),
    aggressiveEntry: Number(aggressiveEntry.toFixed(2)),
    invalidationStop: Number(invalidationStop.toFixed(2)),
    target1: Number(target1.toFixed(2)),
    target2: Number(target2.toFixed(2)),
    target3: Number(target3.toFixed(2)),
    extendedTolerance,
    extensionStrikes,
    tradable,
    tradeReason,
    riskDistance: Number(riskDist.toFixed(2)),
    rewardDistance: Number(rewardDist.toFixed(2)),
    rewardToRiskRatio: rr,
    slDistancePts,
    slRiskTier,
    oneSidedGating,
    suppressedSide,
    side: tradeSide,
    invalidatedLevels,
  };

  // =========================================================================
  // 5. TOP-DOWN RANGE MATRIX
  // Weekly Range (Greeks/IV-based expected move) & 09:20 Day Range
  // =========================================================================

  // Approximate ATM IV
  let atmIv = 14.0;
  const atmCall = callStrikes.find((c) => c.strike === atm);
  const atmPut = putStrikes.find((p) => p.strike === atm);
  const validIvs = [atmCall?.iv, atmPut?.iv].filter((v): v is number => typeof v === "number" && v > 0);
  if (validIvs.length > 0) {
    atmIv = validIvs.reduce((a, b) => a + b, 0) / validIvs.length;
  }

  // Calculate DTE
  let dte = 5;
  if (expiry) {
    const expDate = new Date(expiry);
    const now = new Date(timestamp);
    if (!isNaN(expDate.getTime()) && !isNaN(now.getTime())) {
      const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0) dte = diffDays;
    }
  }

  // Session Flow & OI-vs-Volume Intelligence
  const isExpirySession = expiry ? dte <= 1 : false;
  const totalCombinedOi = callOiTotal + putOiTotal;
  const totalCombinedVol = callVolTotal + putVolTotal;
  const isHighOiConcentration =
    totalCombinedOi >= 200_000 &&
    (totalCombinedVol === 0 || totalCombinedOi >= totalCombinedVol * 1.15);

  let oiProfile: SessionOiProfile = "DIRECTIONAL_MOMENTUM";
  let highOiOverride = false;
  if (isExpirySession && isHighOiConcentration) {
    oiProfile = "EXPIRY_BARRIER_RANGE";
  } else if (!isExpirySession && totalCombinedOi >= 200_000 && totalCombinedVol > 0 && totalCombinedOi >= totalCombinedVol * 1.5) {
    oiProfile = "EVENT_HIGH_OI_OVERRIDE";
    highOiOverride = true;
  }

  const atmCallVolume = callStrikes
    .filter((c) => Math.abs(c.strike - atm) <= step)
    .reduce((sum, c) => sum + c.volume, 0);
  const atmPutVolume = putStrikes
    .filter((p) => Math.abs(p.strike - atm) <= step)
    .reduce((sum, p) => sum + p.volume, 0);

  const atmVolumeDominance: "CALL" | "PUT" | "BALANCED" =
    atmCallVolume >= Math.max(1, atmPutVolume) * 1.2
      ? "CALL"
      : atmPutVolume >= Math.max(1, atmCallVolume) * 1.2
        ? "PUT"
        : "BALANCED";

  const callDeltaOiVsVolRatio =
    callVolTotal > 0 ? Number((Math.abs(callOiChangeSum) / callVolTotal).toFixed(2)) : 0;
  const putDeltaOiVsVolRatio =
    putVolTotal > 0 ? Number((Math.abs(putOiChangeSum) / putVolTotal).toFixed(2)) : 0;

  let flowBias: IntradayFlowBias = "BALANCED_RANGE";
  let deltaOiContrastNote = "Balanced ΔOI buildup and ATM volume participation across Calls and Puts.";

  if (
    callOiChangeSum > putOiChangeSum * 1.25 &&
    callVolTotal < putVolTotal &&
    atmVolumeDominance === "PUT"
  ) {
    flowBias = "PUT_FLOW_EDGE";
    deltaOiContrastNote =
      "High Call ΔOI on lower Call volume contrasted by stronger Put ATM volume flow.";
  } else if (
    putOiChangeSum > callOiChangeSum * 1.25 &&
    putVolTotal < callVolTotal &&
    atmVolumeDominance === "CALL"
  ) {
    flowBias = "CALL_FLOW_EDGE";
    deltaOiContrastNote =
      "High Put ΔOI on lower Put volume contrasted by stronger Call ATM volume flow.";
  } else if (putOiChangeSum >= callOiChangeSum * 1.2 && (atmVolumeDominance === "PUT" || putVolTotal >= callVolTotal)) {
    flowBias = "PUT_FLOW_EDGE";
    deltaOiContrastNote = "Put ΔOI buildup aligned with stronger Put session/ATM volume flow.";
  } else if (callOiChangeSum >= putOiChangeSum * 1.2 && (atmVolumeDominance === "CALL" || callVolTotal >= putVolTotal)) {
    flowBias = "CALL_FLOW_EDGE";
    deltaOiContrastNote = "Call ΔOI buildup aligned with stronger Call session/ATM volume flow.";
  } else if (atmVolumeDominance === "CALL") {
    flowBias = "CALL_FLOW_EDGE";
    deltaOiContrastNote = "ATM Call volume leads participation while ΔOI remains relatively balanced.";
  } else if (atmVolumeDominance === "PUT") {
    flowBias = "PUT_FLOW_EDGE";
    deltaOiContrastNote = "ATM Put volume leads participation while ΔOI remains relatively balanced.";
  }

  const sessionFlow: SessionFlowIntelligence = {
    oiProfile,
    isExpirySession,
    highOiOverride,
    atmCallVolume,
    atmPutVolume,
    atmVolumeDominance,
    callDeltaOiVsVolRatio,
    putDeltaOiVsVolRatio,
    deltaOiContrastNote,
    flowBias,
    summary: `${oiProfile.replace(/_/g, " ")} · ATM Vol: ${atmVolumeDominance} · ${flowBias}`,
  };

  const expectedMove = Number((spotPrice * (atmIv / 100) * Math.sqrt(Math.max(1, dte) / 365)).toFixed(2));
  const weeklyLow = Math.round(spotPrice - expectedMove);
  const weeklyHigh = Math.round(spotPrice + expectedMove);
  const ivExpansion = atmIv >= 18.0;

  // Day Range 09:20
  let dayLow0920 = Math.round(spotPrice - 0.0075 * spotPrice);
  let dayHigh0920 = Math.round(spotPrice + 0.0075 * spotPrice);
  let dayRangeSource: "STATIC_0920" | "ESTIMATED" = "ESTIMATED";

  if (static0920Snapshot) {
    dayLow0920 = Math.round(static0920Snapshot.eos);
    dayHigh0920 = Math.round(static0920Snapshot.eor);
    dayRangeSource = "STATIC_0920";
  }

  const topDownRange: TopDownRangeMatrix = {
    spotPrice,
    weeklyRange: {
      low: weeklyLow,
      high: weeklyHigh,
      expectedMove,
      iv: Number(atmIv.toFixed(1)),
      ivExpansion,
      label: `Weekly Range: ${weeklyLow.toLocaleString("en-IN")} – ${weeklyHigh.toLocaleString("en-IN")}`,
    },
    dayRange0920: {
      low: dayLow0920,
      high: dayHigh0920,
      source: dayRangeSource,
      label: `09:20 Day Range: ${dayLow0920.toLocaleString("en-IN")} – ${dayHigh0920.toLocaleString("en-IN")}`,
    },
  };

  // Strike Overlays Map
  const strikeOverlays = new Map<number, StrikeIntelligenceOverlay>();
  const allStrikes = new Set([...callStrikes.map((c) => c.strike), ...putStrikes.map((p) => p.strike)]);

  for (const s of allStrikes) {
    const isPazSupStrike = s === pazSupStrike;
    const isPazResStrike = s === pazResStrike;
    const callItem = callStrikes.find((c) => c.strike === s);
    const putItem = putStrikes.find((p) => p.strike === s);

    const callPct = callPrimaryVal > 0 && callItem ? Math.min(100, (Math.max(callItem.oi, callItem.volume) / callPrimaryVal) * 100) : 0;
    const putPct = putPrimaryVal > 0 && putItem ? Math.min(100, (Math.max(putItem.oi, putItem.volume) / putPrimaryVal) * 100) : 0;

    strikeOverlays.set(s, {
      strike: s,
      isPazSup: isPazSupStrike,
      isPazRes: isPazResStrike,
      callPdiPct: Number(callPct.toFixed(1)),
      putPdiPct: Number(putPct.toFixed(1)),
      callPdiLabel: isPazResStrike ? "PAZ-Res (100%)" : callPct >= 75 ? `${s > pazResStrike ? "WTT ↗" : "WTB ↘"} (${callPct.toFixed(1)}%)` : `${callPct.toFixed(1)}%`,
      putPdiLabel: isPazSupStrike ? "PAZ-Sup (100%)" : putPct >= 75 ? `${s > pazSupStrike ? "WTT ↗" : "WTB ↘"} (${putPct.toFixed(1)}%)` : `${putPct.toFixed(1)}%`,
      isCallAnchorChallenger: s === callChallengerStrike && callIsDrifting,
      isPutAnchorChallenger: s === putChallengerStrike && putIsDrifting,
    });
  }

  return {
    underlying,
    spotPrice,
    atmStrike: atm,
    strikeStep: step,
    timestamp,
    pazSup,
    pazRes,
    pdiTop,
    pdiBot,
    ovm9,
    sessionFlow,
    rsbExecution,
    d1ScalpPlan,
    topDownRange,
    strikeOverlays,
  };
}
