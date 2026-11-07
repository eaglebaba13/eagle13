// Institutional VWAP Execution Signals Engine
// Clean Single-Line VWAP setups:
// 1. Dynamic Support/Resistance (Breakout & Retest)
// 2. Mean Reversion Target (Price extension > 2.0 SD with liquidity sweep / exhaustion)

import { computeIntradayVWAP, type VWAPPoint } from "../indicators/vwap";
import type { IndicatorCandle } from "../indicators/types";

export type VWAPSignalType =
  | "VWAP_DYNAMIC_SUPPORT_RETEST"
  | "VWAP_DYNAMIC_RESISTANCE_RETEST"
  | "VWAP_MEAN_REVERSION_OVERBOUGHT"
  | "VWAP_MEAN_REVERSION_OVERSOLD";

export interface VWAPExecutionSignal {
  readonly id: string;
  readonly symbol: string;
  readonly type: VWAPSignalType;
  readonly direction: "BULLISH" | "BEARISH";
  readonly price: number;
  readonly timestamp: number;
  readonly vwap: number;
  readonly stdDev: number;
  readonly targetPrice: number;
  readonly stopLoss: number;
  readonly riskRewardRatio: number;
  readonly confirmation: {
    readonly candleConfirmed: boolean;
    readonly candleType:
      | "BULLISH_REJECTION_PINBAR"
      | "BEARISH_REJECTION_PINBAR"
      | "BULLISH_RETEST_BOUNCE"
      | "BEARISH_RETEST_REJECTION"
      | "MEAN_REVERSION_WICK";
    readonly wickRatio: number; // 0.0 to 1.0
    readonly zScore: number; // distance from VWAP in standard deviations
  };
  readonly headline: string;
  readonly description: string;
  readonly recommendedAction: string;
}

export interface VWAPSignalOptions {
  readonly symbol?: string;
  readonly minRiskReward?: number; // default 1.5
  readonly retestTolerancePct?: number; // default 0.003 (0.3%)
  readonly minWickRatio?: number; // default 0.35 (35%)
  readonly meanReversionStdDev?: number; // default 2.0
}

/**
 * Evaluates the latest candle(s) against cumulative intraday VWAP
 * and outputs institutional execution signals.
 */
export function generateVWAPSignals(
  candles: readonly IndicatorCandle[],
  options: VWAPSignalOptions = {},
): readonly VWAPExecutionSignal[] {
  if (candles.length < 3) {
    return [];
  }

  const symbol = options.symbol ?? "NIFTY50";
  const isGold = symbol === "GC1!" || symbol === "GOLD";
  const minRR = options.minRiskReward ?? 1.5;
  const retestTolerance = options.retestTolerancePct ?? 0.003;
  const minWickRatio = options.minWickRatio ?? 0.35;
  const meanReversionThreshold = options.meanReversionStdDev ?? 2.0;

  const vwapPoints = computeIntradayVWAP(candles, { isGold });
  if (vwapPoints.length === 0) return [];

  const currentIdx = candles.length - 1;
  const currentCandle = candles[currentIdx];
  const currentVwapPoint = vwapPoints[currentIdx];

  const candleRange = currentCandle.high - currentCandle.low;
  if (candleRange <= 0) return [];

  const bodySize = Math.abs(currentCandle.close - currentCandle.open);
  const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
  const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
  const upperWickRatio = upperWick / candleRange;
  const lowerWickRatio = lowerWick / candleRange;

  const vwap = currentVwapPoint.vwap;
  const stdDev = currentVwapPoint.stdDev > 0 ? currentVwapPoint.stdDev : vwap * 0.005;
  const zScore = (currentCandle.close - vwap) / stdDev;

  const signals: VWAPExecutionSignal[] = [];

  // =========================================================================
  // SETUP 1: MEAN REVERSION TARGET (Price > 2.0 Std Dev with wick exhaustion)
  // Target is strictly the single VWAP line.
  // =========================================================================

  // 1A. Overbought Extension: High touched or exceeded +2.0 SD, rejected with upper wick or red close
  const highZScore = (currentCandle.high - vwap) / stdDev;
  if (highZScore >= meanReversionThreshold && (upperWickRatio >= minWickRatio || currentCandle.close < currentCandle.open)) {
    const stopLoss = Math.round((currentCandle.high + stdDev * 0.25) * 100) / 100;
    const targetPrice = Math.round(vwap * 100) / 100;
    const risk = stopLoss - currentCandle.close;
    const reward = currentCandle.close - targetPrice;

    if (risk > 0 && reward / risk >= minRR) {
      signals.push({
        id: `VWAP-MR-BEAR-${symbol}-${currentCandle.time}`,
        symbol,
        type: "VWAP_MEAN_REVERSION_OVERBOUGHT",
        direction: "BEARISH",
        price: Math.round(currentCandle.close * 100) / 100,
        timestamp: currentCandle.time,
        vwap: Math.round(vwap * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        targetPrice,
        stopLoss,
        riskRewardRatio: Math.round((reward / risk) * 100) / 100,
        confirmation: {
          candleConfirmed: true,
          candleType: "BEARISH_REJECTION_PINBAR",
          wickRatio: Math.round(upperWickRatio * 100) / 100,
          zScore: Math.round(highZScore * 100) / 100,
        },
        headline: `VWAP Mean Reversion: ${symbol} Overbought (+${highZScore.toFixed(1)}σ)`,
        description: `Price extended beyond +2.0 standard deviations above VWAP (${vwap.toFixed(2)}) and printed a sharp upper wick rejection (${(upperWickRatio * 100).toFixed(0)}%). Institutional sellers absorbing liquidity. Target is the VWAP mean line.`,
        recommendedAction: `SELL / BUY PUT with stop above ${stopLoss.toFixed(2)}. Target VWAP mean at ${targetPrice.toFixed(2)}.`,
      });
    }
  }

  // 1B. Oversold Extension: Low touched or pierced -2.0 SD, rejected with lower wick or green close
  const lowZScore = (currentCandle.low - vwap) / stdDev;
  if (lowZScore <= -meanReversionThreshold && (lowerWickRatio >= minWickRatio || currentCandle.close > currentCandle.open)) {
    const stopLoss = Math.round((currentCandle.low - stdDev * 0.25) * 100) / 100;
    const targetPrice = Math.round(vwap * 100) / 100;
    const risk = currentCandle.close - stopLoss;
    const reward = targetPrice - currentCandle.close;

    if (risk > 0 && reward / risk >= minRR) {
      signals.push({
        id: `VWAP-MR-BULL-${symbol}-${currentCandle.time}`,
        symbol,
        type: "VWAP_MEAN_REVERSION_OVERSOLD",
        direction: "BULLISH",
        price: Math.round(currentCandle.close * 100) / 100,
        timestamp: currentCandle.time,
        vwap: Math.round(vwap * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        targetPrice,
        stopLoss,
        riskRewardRatio: Math.round((reward / risk) * 100) / 100,
        confirmation: {
          candleConfirmed: true,
          candleType: "BULLISH_REJECTION_PINBAR",
          wickRatio: Math.round(lowerWickRatio * 100) / 100,
          zScore: Math.round(lowZScore * 100) / 100,
        },
        headline: `VWAP Mean Reversion: ${symbol} Oversold (${lowZScore.toFixed(1)}σ)`,
        description: `Price reached extreme oversold extension below -2.0 standard deviations from VWAP (${vwap.toFixed(2)}) and rejected with a strong buying wick (${(lowerWickRatio * 100).toFixed(0)}%). Target is the VWAP mean line.`,
        recommendedAction: `BUY / BUY CALL with stop below ${stopLoss.toFixed(2)}. Target VWAP mean at ${targetPrice.toFixed(2)}.`,
      });
    }
  }

  // =========================================================================
  // SETUP 2: DYNAMIC SUPPORT / RESISTANCE (Breakout & Retest)
  // Price crossed VWAP previously, returned to test VWAP line, and printed rejection.
  // =========================================================================

  const prevCandle = candles[currentIdx - 1];
  const prevVwap = vwapPoints[currentIdx - 1].vwap;

  // 2A. Bullish Dynamic Support Retest
  // Prior candle or trend above VWAP, current candle tested VWAP and held above
  const touchedSupport =
    currentCandle.low <= vwap * (1 + retestTolerance) &&
    currentCandle.low >= vwap * (1 - retestTolerance * 1.5);
  const closedAboveSupport = currentCandle.close >= vwap;
  const isBullishBounce = lowerWickRatio >= minWickRatio || currentCandle.close > currentCandle.open;

  if (touchedSupport && closedAboveSupport && isBullishBounce && prevCandle.close >= prevVwap * 0.998) {
    const stopLoss = Math.round(Math.min(currentCandle.low, vwap - stdDev * 0.4) * 100) / 100;
    const targetPrice = Math.round((vwap + Math.max(stdDev * 1.5, candleRange * 2)) * 100) / 100;
    const risk = currentCandle.close - stopLoss;
    const reward = targetPrice - currentCandle.close;

    if (risk > 0 && reward / risk >= minRR) {
      signals.push({
        id: `VWAP-RETEST-BULL-${symbol}-${currentCandle.time}`,
        symbol,
        type: "VWAP_DYNAMIC_SUPPORT_RETEST",
        direction: "BULLISH",
        price: Math.round(currentCandle.close * 100) / 100,
        timestamp: currentCandle.time,
        vwap: Math.round(vwap * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        targetPrice,
        stopLoss,
        riskRewardRatio: Math.round((reward / risk) * 100) / 100,
        confirmation: {
          candleConfirmed: true,
          candleType: lowerWickRatio >= minWickRatio ? "BULLISH_REJECTION_PINBAR" : "BULLISH_RETEST_BOUNCE",
          wickRatio: Math.round(lowerWickRatio * 100) / 100,
          zScore: Math.round(zScore * 100) / 100,
        },
        headline: `VWAP Support Retest: ${symbol} Held ${vwap.toFixed(2)}`,
        description: `Price retested dynamic VWAP support (${vwap.toFixed(2)}) and rejected lower prices with a confirmed ${lowerWickRatio >= minWickRatio ? "pinbar wick" : "bullish bounce"}. Dynamic support intact.`,
        recommendedAction: `BUY CALL / LONG with stop at ${stopLoss.toFixed(2)}. Targeting upside extension ${targetPrice.toFixed(2)}.`,
      });
    }
  }

  // 2B. Bearish Dynamic Resistance Retest
  // Prior candle or trend below VWAP, current candle tested VWAP from below and held below
  const touchedResistance =
    currentCandle.high >= vwap * (1 - retestTolerance) &&
    currentCandle.high <= vwap * (1 + retestTolerance * 1.5);
  const closedBelowResistance = currentCandle.close <= vwap;
  const isBearishRejection = upperWickRatio >= minWickRatio || currentCandle.close < currentCandle.open;

  if (touchedResistance && closedBelowResistance && isBearishRejection && prevCandle.close <= prevVwap * 1.002) {
    const stopLoss = Math.round(Math.max(currentCandle.high, vwap + stdDev * 0.4) * 100) / 100;
    const targetPrice = Math.round((vwap - Math.max(stdDev * 1.5, candleRange * 2)) * 100) / 100;
    const risk = stopLoss - currentCandle.close;
    const reward = currentCandle.close - targetPrice;

    if (risk > 0 && reward / risk >= minRR) {
      signals.push({
        id: `VWAP-RETEST-BEAR-${symbol}-${currentCandle.time}`,
        symbol,
        type: "VWAP_DYNAMIC_RESISTANCE_RETEST",
        direction: "BEARISH",
        price: Math.round(currentCandle.close * 100) / 100,
        timestamp: currentCandle.time,
        vwap: Math.round(vwap * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        targetPrice,
        stopLoss,
        riskRewardRatio: Math.round((reward / risk) * 100) / 100,
        confirmation: {
          candleConfirmed: true,
          candleType: upperWickRatio >= minWickRatio ? "BEARISH_REJECTION_PINBAR" : "BEARISH_RETEST_REJECTION",
          wickRatio: Math.round(upperWickRatio * 100) / 100,
          zScore: Math.round(zScore * 100) / 100,
        },
        headline: `VWAP Resistance Retest: ${symbol} Rejected ${vwap.toFixed(2)}`,
        description: `Price tested dynamic VWAP resistance (${vwap.toFixed(2)}) from below and failed to break above, printing a clear ${upperWickRatio >= minWickRatio ? "pinbar rejection" : "bearish reject"}. Dynamic resistance holding.`,
        recommendedAction: `BUY PUT / SHORT with stop at ${stopLoss.toFixed(2)}. Targeting downside continuation ${targetPrice.toFixed(2)}.`,
      });
    }
  }

  // Deduplicate signals by type and direction
  const seen = new Set<string>();
  return signals.filter((s) => {
    const key = `${s.type}-${s.direction}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Format institutional Clean Single-Line VWAP execution alert for Telegram.
 */
export function formatVWAPTelegramAlert(signal: VWAPExecutionSignal): string {
  const isMR = signal.type.includes("MEAN_REVERSION");
  const icon = isMR ? "🎯" : "⚡";
  const dirEmoji = signal.direction === "BULLISH" ? "🟢" : "🔴";
  const dateStr = new Date(signal.timestamp).toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const lines: string[] = [
    `${icon} [INSTITUTIONAL VWAP ALERT] ${signal.headline}`,
    "",
    `🎯 Instrument: ${signal.symbol}`,
    `⚡ Signal Type: ${signal.type} (${signal.direction} ${dirEmoji})`,
    `📍 Intraday VWAP: ${signal.vwap}`,
    `📊 Extension (Z-Score): ${signal.confirmation.zScore > 0 ? "+" : ""}${signal.confirmation.zScore}σ`,
    `🎯 Target Price: ${signal.targetPrice} ${isMR ? "(VWAP Mean Line Reversion)" : "(Dynamic S/R Expansion)"}`,
    `🛑 Stop Loss: ${signal.stopLoss} (R:R ${signal.riskRewardRatio}:1)`,
    `🔍 Confirmation: ${signal.confirmation.candleType} (Wick: ${(signal.confirmation.wickRatio * 100).toFixed(0)}%)`,
    `⏱ Timestamp: ${dateStr}`,
    "",
    `💡 Recommended Action:`,
    `${signal.recommendedAction}`,
    "",
    "EagleBABA Quantitative Research Platform — Automated VWAP Engine.",
  ];

  return lines.join("\n");
}
