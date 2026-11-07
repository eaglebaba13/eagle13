// Institutional Volume Profile Order Flow Execution Signals
// High-probability setups: LVN Momentum Breakouts, HVN Liquidity Sweeps, and Candle Confirmation Gates.

import type {
  OrderFlowCandle,
  VolumeProfileResult,
  OrderFlowSymbol,
} from "./volume-profile-engine";

export type VolumeProfileSignalType =
  | "LVN_MOMENTUM_BREAKOUT"
  | "HVN_LIQUIDITY_SWEEP_REVERSAL"
  | "VALUE_AREA_REJECTION"
  | "POC_MAGNET_ROTATION";

export interface VolumeProfileSignal {
  readonly id: string;
  readonly symbol: OrderFlowSymbol;
  readonly type: VolumeProfileSignalType;
  readonly direction: "BULLISH" | "BEARISH";
  readonly price: number;
  readonly timestamp: number;
  readonly triggerLevel: number;
  readonly targetPrice: number;
  readonly stopLoss: number;
  readonly riskRewardRatio: number;
  readonly shapeBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  readonly profileShape: VolumeProfileResult["shape"];
  readonly confirmation: {
    readonly candleConfirmed: boolean;
    readonly candleType: "PINBAR_REJECTION" | "ENGULFING" | "MOMENTUM_EXPANSION" | "BREAKOUT_CLOSE";
    readonly volumeSurgeRatio: number;
    readonly wickRatio: number; // 0.0 to 1.0
  };
  readonly headline: string;
  readonly description: string;
  readonly recommendedAction: string;
}

export interface SignalGeneratorOptions {
  readonly minRiskReward?: number; // default 1.5
  readonly volumeSurgeThreshold?: number; // default 1.35x
  readonly minWickRejectionRatio?: number; // default 0.50 (50%)
}

/**
 * Generates institutional execution signals from the latest completed candle
 * against the Fixed Range Volume Profile (FRVP) landscape.
 */
export function generateVolumeProfileSignals(
  profile: VolumeProfileResult,
  candles: readonly OrderFlowCandle[],
  options: SignalGeneratorOptions = {}
): readonly VolumeProfileSignal[] {
  if (candles.length < 3 || profile.totalVolume <= 0) {
    return [];
  }

  const minRR = options.minRiskReward ?? 1.5;
  const volSurgeThreshold = options.volumeSurgeThreshold ?? 1.35;
  const minWickRatio = options.minWickRejectionRatio ?? 0.50;

  const currentCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const lookbackCandles = candles.slice(-20, -1);
  const avgVolume =
    lookbackCandles.length > 0
      ? lookbackCandles.reduce((acc, c) => acc + c.volume, 0) / lookbackCandles.length
      : currentCandle.volume;

  const volumeSurgeRatio = avgVolume > 0 ? currentCandle.volume / avgVolume : 1.0;
  const candleRange = currentCandle.high - currentCandle.low;
  if (candleRange <= 0) return [];

  const bodySize = Math.abs(currentCandle.close - currentCandle.open);
  const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
  const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
  const upperWickRatio = upperWick / candleRange;
  const lowerWickRatio = lowerWick / candleRange;

  const signals: VolumeProfileSignal[] = [];

  // =========================================================================
  // SETUP 1: LVN MOMENTUM BREAKOUT TRIGGER
  // Price enters an LVN void and closes decisively beyond its boundary with volume expansion.
  // Targets the next HVN magnet.
  // =========================================================================
  for (const lvn of profile.lvns) {
    const lvnHalfWidth = profile.binSize * 1.5;
    const lvnHigh = lvn.price + lvnHalfWidth;
    const lvnLow = lvn.price - lvnHalfWidth;

    // Bullish LVN Breakout: Previous candle originated at/below LVN, current candle closed ABOVE LVN high
    if (
      prevCandle.close <= lvnHigh &&
      currentCandle.close > lvnHigh &&
      currentCandle.close > currentCandle.open &&
      volumeSurgeRatio >= volSurgeThreshold
    ) {
      // Find next higher HVN magnet
      const higherHvns = profile.hvns
        .filter((h) => h.price > currentCandle.close)
        .sort((a, b) => a.price - b.price);
      const targetHvn = higherHvns.length > 0 ? higherHvns[0].price : profile.vah;

      const stopLoss = lvnLow - profile.binSize * 0.5;
      const risk = currentCandle.close - stopLoss;
      const reward = targetHvn - currentCandle.close;

      if (risk > 0 && reward / risk >= minRR) {
        signals.push({
          id: `LVN-BO-BULL-${profile.symbol}-${currentCandle.time}`,
          symbol: profile.symbol,
          type: "LVN_MOMENTUM_BREAKOUT",
          direction: "BULLISH",
          price: currentCandle.close,
          timestamp: currentCandle.time,
          triggerLevel: Math.round(lvn.price * 100) / 100,
          targetPrice: Math.round(targetHvn * 100) / 100,
          stopLoss: Math.round(stopLoss * 100) / 100,
          riskRewardRatio: Math.round((reward / risk) * 100) / 100,
          shapeBias: profile.shapeBias,
          profileShape: profile.shape,
          confirmation: {
            candleConfirmed: true,
            candleType: "BREAKOUT_CLOSE",
            volumeSurgeRatio: Math.round(volumeSurgeRatio * 100) / 100,
            wickRatio: Math.round(upperWickRatio * 100) / 100,
          },
          headline: `LVN Momentum Breakout: ${profile.symbol} cleared ${lvn.price.toFixed(1)} void`,
          description: `Price accelerated through Low Volume Node (${lvn.price.toFixed(1)}) with ${volumeSurgeRatio.toFixed(1)}x volume expansion. Velocity void cleared towards ${targetHvn.toFixed(1)} HVN magnet.`,
          recommendedAction: `BUY CALL / LONG on close confirmation above ${lvnHigh.toFixed(1)}. Target: ${targetHvn.toFixed(1)} HVN. Stop: ${stopLoss.toFixed(1)}.`,
        });
      }
    }

    // Bearish LVN Breakout: Previous candle originated at/above LVN, current candle closed BELOW LVN low
    if (
      prevCandle.close >= lvnLow &&
      currentCandle.close < lvnLow &&
      currentCandle.close < currentCandle.open &&
      volumeSurgeRatio >= volSurgeThreshold
    ) {
      // Find next lower HVN magnet
      const lowerHvns = profile.hvns
        .filter((h) => h.price < currentCandle.close)
        .sort((a, b) => b.price - a.price);
      const targetHvn = lowerHvns.length > 0 ? lowerHvns[0].price : profile.val;

      const stopLoss = lvnHigh + profile.binSize * 0.5;
      const risk = stopLoss - currentCandle.close;
      const reward = currentCandle.close - targetHvn;

      if (risk > 0 && reward / risk >= minRR) {
        signals.push({
          id: `LVN-BO-BEAR-${profile.symbol}-${currentCandle.time}`,
          symbol: profile.symbol,
          type: "LVN_MOMENTUM_BREAKOUT",
          direction: "BEARISH",
          price: currentCandle.close,
          timestamp: currentCandle.time,
          triggerLevel: Math.round(lvn.price * 100) / 100,
          targetPrice: Math.round(targetHvn * 100) / 100,
          stopLoss: Math.round(stopLoss * 100) / 100,
          riskRewardRatio: Math.round((reward / risk) * 100) / 100,
          shapeBias: profile.shapeBias,
          profileShape: profile.shape,
          confirmation: {
            candleConfirmed: true,
            candleType: "BREAKOUT_CLOSE",
            volumeSurgeRatio: Math.round(volumeSurgeRatio * 100) / 100,
            wickRatio: Math.round(lowerWickRatio * 100) / 100,
          },
          headline: `LVN Momentum Breakout: ${profile.symbol} broke down through ${lvn.price.toFixed(1)} void`,
          description: `Price broke through Low Volume Node (${lvn.price.toFixed(1)}) with ${volumeSurgeRatio.toFixed(1)}x volume surge. Void cleared towards ${targetHvn.toFixed(1)} HVN magnet.`,
          recommendedAction: `BUY PUT / SHORT on close confirmation below ${lvnLow.toFixed(1)}. Target: ${targetHvn.toFixed(1)} HVN. Stop: ${stopLoss.toFixed(1)}.`,
        });
      }
    }
  }

  // =========================================================================
  // SETUP 2: HVN LIQUIDITY SWEEP & REVERSAL TRIGGER
  // Price sweeps past an HVN or Value Area boundary (POC/VAH/VAL), traps liquidity,
  // and prints a confirmed rejection candle (wick > 50% or engulfing reversal).
  // =========================================================================
  const testLevels = [
    { level: profile.poc, label: "POC" },
    { level: profile.vah, label: "VAH" },
    { level: profile.val, label: "VAL" },
    ...profile.hvns.map((h) => ({ level: h.price, label: "HVN" })),
  ];

  for (const item of testLevels) {
    const level = item.level;
    const tolerance = profile.binSize * 1.2;

    // Bullish Reversal: Price tested/swept below level (low <= level + tolerance)
    // and rejected upward with lower wick > 50% OR bullish engulfing
    const sweptBelow = currentCandle.low <= level + tolerance && currentCandle.close > level;
    const isBullishPinbar = lowerWickRatio >= minWickRatio && lowerWick > bodySize;
    const isBullishEngulfing =
      currentCandle.close > prevCandle.high &&
      currentCandle.open <= prevCandle.close &&
      prevCandle.close < prevCandle.open;

    if (sweptBelow && (isBullishPinbar || isBullishEngulfing)) {
      const stopLoss = currentCandle.low - profile.binSize * 0.2;
      const targetPrice = level === profile.poc ? profile.vah : profile.poc;
      const risk = currentCandle.close - stopLoss;
      const reward = targetPrice - currentCandle.close;

      if (risk > 0 && reward / risk >= minRR) {
        signals.push({
          id: `HVN-SWEEP-BULL-${profile.symbol}-${currentCandle.time}`,
          symbol: profile.symbol,
          type: "HVN_LIQUIDITY_SWEEP_REVERSAL",
          direction: "BULLISH",
          price: currentCandle.close,
          timestamp: currentCandle.time,
          triggerLevel: Math.round(level * 100) / 100,
          targetPrice: Math.round(targetPrice * 100) / 100,
          stopLoss: Math.round(stopLoss * 100) / 100,
          riskRewardRatio: Math.round((reward / risk) * 100) / 100,
          shapeBias: profile.shapeBias,
          profileShape: profile.shape,
          confirmation: {
            candleConfirmed: true,
            candleType: isBullishPinbar ? "PINBAR_REJECTION" : "ENGULFING",
            volumeSurgeRatio: Math.round(volumeSurgeRatio * 100) / 100,
            wickRatio: Math.round(lowerWickRatio * 100) / 100,
          },
          headline: `HVN Liquidity Sweep: ${profile.symbol} rejected ${item.label} (${level.toFixed(1)})`,
          description: `Price swept liquidity below ${item.label} (${level.toFixed(1)}) and printed a sharp ${isBullishPinbar ? "lower wick absorption" : "bullish engulfing reversal"} (${(lowerWickRatio * 100).toFixed(0)}% wick). Buyers defended the node.`,
          recommendedAction: `BUY CALL / LONG with stop at ${stopLoss.toFixed(1)}. Targeting ${targetPrice.toFixed(1)} liquidity rotation.`,
        });
      }
    }

    // Bearish Reversal: Price tested/swept above level (high >= level - tolerance)
    // and rejected downward with upper wick > 50% OR bearish engulfing
    const sweptAbove = currentCandle.high >= level - tolerance && currentCandle.close < level;
    const isBearishPinbar = upperWickRatio >= minWickRatio && upperWick > bodySize;
    const isBearishEngulfing =
      currentCandle.close < prevCandle.low &&
      currentCandle.open >= prevCandle.close &&
      prevCandle.close > prevCandle.open;

    if (sweptAbove && (isBearishPinbar || isBearishEngulfing)) {
      const stopLoss = currentCandle.high + profile.binSize * 0.2;
      const targetPrice = level === profile.poc ? profile.val : profile.poc;
      const risk = stopLoss - currentCandle.close;
      const reward = currentCandle.close - targetPrice;

      if (risk > 0 && reward / risk >= minRR) {
        signals.push({
          id: `HVN-SWEEP-BEAR-${profile.symbol}-${currentCandle.time}`,
          symbol: profile.symbol,
          type: "HVN_LIQUIDITY_SWEEP_REVERSAL",
          direction: "BEARISH",
          price: currentCandle.close,
          timestamp: currentCandle.time,
          triggerLevel: Math.round(level * 100) / 100,
          targetPrice: Math.round(targetPrice * 100) / 100,
          stopLoss: Math.round(stopLoss * 100) / 100,
          riskRewardRatio: Math.round((reward / risk) * 100) / 100,
          shapeBias: profile.shapeBias,
          profileShape: profile.shape,
          confirmation: {
            candleConfirmed: true,
            candleType: isBearishPinbar ? "PINBAR_REJECTION" : "ENGULFING",
            volumeSurgeRatio: Math.round(volumeSurgeRatio * 100) / 100,
            wickRatio: Math.round(upperWickRatio * 100) / 100,
          },
          headline: `HVN Liquidity Sweep: ${profile.symbol} rejected ${item.label} (${level.toFixed(1)})`,
          description: `Price swept liquidity above ${item.label} (${level.toFixed(1)}) and printed a sharp ${isBearishPinbar ? "upper wick trap" : "bearish engulfing rejection"} (${(upperWickRatio * 100).toFixed(0)}% wick). Sellers absorbed demand.`,
          recommendedAction: `BUY PUT / SHORT with stop at ${stopLoss.toFixed(1)}. Targeting ${targetPrice.toFixed(1)} Value Area rotation.`,
        });
      }
    }
  }

  // Deduplicate signals by trigger level and direction
  const seen = new Set<string>();
  return signals.filter((s) => {
    const key = `${s.type}-${s.direction}-${Math.round(s.triggerLevel)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Format institutional Fixed Range Volume Profile (FRVP) execution alert for Telegram.
 */
export function formatVolumeProfileTelegramAlert(signal: VolumeProfileSignal): string {
  const icon = signal.type === "LVN_MOMENTUM_BREAKOUT" ? "📊" : "🧲";
  const dirEmoji = signal.direction === "BULLISH" ? "🟢" : "🔴";
  const dateStr = new Date(signal.timestamp).toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const lines: string[] = [
    `${icon} [VOLUME PROFILE ALERT] ${signal.headline}`,
    "",
    `🎯 Instrument: ${signal.symbol}`,
    `⚡ Signal: ${signal.type} (${signal.direction} ${dirEmoji})`,
    `📐 Profile Shape: ${signal.profileShape} (${signal.shapeBias})`,
    `📍 Trigger Level: ${signal.triggerLevel}`,
    `🎯 Target Price: ${signal.targetPrice} (${signal.type === "LVN_MOMENTUM_BREAKOUT" ? "HVN Magnet" : "POC/VA Rotation"})`,
    `🛑 Stop Loss: ${signal.stopLoss} (R:R ${signal.riskRewardRatio}:1)`,
    `🔍 Confirmation: ${signal.confirmation.candleType} (Surge: ${signal.confirmation.volumeSurgeRatio}x, Wick: ${(signal.confirmation.wickRatio * 100).toFixed(0)}%)`,
    `⏱ Timestamp: ${dateStr}`,
    "",
    `💡 Recommended Action:`,
    `${signal.recommendedAction}`,
    "",
    "EagleBABA Quantitative Research Platform — Automated Order Flow Engine.",
  ];

  return lines.join("\n");
}
