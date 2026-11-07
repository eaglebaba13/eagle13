// Institutional Fixed Range Volume Profile (FRVP) & Order Flow Quantitative Engine
// High-performance discretization, Value Area (70%), POC, HVN/LVN, and Shape Classification.

export type OrderFlowSymbol = "NIFTY50" | "BANKNIFTY" | "SENSEX" | "GC1!" | "XAUUSD" | "GOLD";

export interface OrderFlowCandle {
  readonly time: number; // UTC ms timestamp
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly buyVolume?: number;
  readonly sellVolume?: number;
}

export interface VolumeBin {
  readonly price: number; // Midpoint price of bucket
  readonly low: number;   // Bin lower boundary
  readonly high: number;  // Bin upper boundary
  readonly volume: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly delta: number; // buyVolume - sellVolume
  readonly percentage: number; // % of session total volume
  readonly isPOC: boolean;
  readonly isVAH: boolean;
  readonly isVAL: boolean;
  readonly isHVN: boolean;
  readonly isLVN: boolean;
}

export type ProfileShape =
  | "P_SHAPE" // Bullish: POC in upper 35% of session range with thin lower stem
  | "B_SHAPE_BEARISH" // Bearish b-shape: POC in lower 35% of session range with thin upper stem
  | "D_SHAPE" // Neutral/Balanced Rotation: POC in middle (35%-65%), symmetrical bell
  | "DOUBLE_DISTRIBUTION"; // B-shape: Two prominent HVNs separated by deep LVN

export interface VolumeProfileConfig {
  readonly symbol: OrderFlowSymbol;
  readonly binSize?: number;
  readonly valueAreaRatio?: number; // default 0.70 (70%)
  readonly hvnThresholdMultiplier?: number; // default 1.5x of local MA
  readonly lvnThresholdMultiplier?: number; // default 0.4x of local MA
  readonly sessionStartTime?: number; // optional filter start ms
  readonly sessionEndTime?: number;   // optional filter end ms
}

export interface VolumeProfileResult {
  readonly symbol: OrderFlowSymbol;
  readonly sessionOpenTime: number;
  readonly sessionEndTime: number;
  readonly totalVolume: number;
  readonly totalCandles: number;
  readonly binSize: number;
  readonly minPrice: number;
  readonly maxPrice: number;
  readonly range: number;
  readonly poc: number; // Point of Control price
  readonly pocVolume: number;
  readonly vah: number; // Value Area High (70%)
  readonly val: number; // Value Area Low (70%)
  readonly valueAreaVolume: number;
  readonly valueAreaPercentage: number;
  readonly bins: readonly VolumeBin[];
  readonly hvns: readonly { readonly price: number; readonly volume: number }[];
  readonly lvns: readonly { readonly price: number; readonly volume: number }[];
  readonly shape: ProfileShape;
  readonly shapeLabel: "P-Shape (Bullish)" | "b-Shape (Bearish)" | "D-Shape (Rotation)" | "Double Distribution";
  readonly shapeBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  readonly relativePocPosition: number; // 0.0 (session low) to 1.0 (session high)
  readonly summary: string;
}

/**
 * Standard tick bin sizes across asset classes.
 * NIFTY: 5.0 pt, BANKNIFTY: 10.0 pt, SENSEX: 10.0 pt, COMEX Gold (GC1! / XAUUSD): 0.5 pt
 */
export function getDefaultBinSize(symbol: OrderFlowSymbol): number {
  switch (symbol) {
    case "NIFTY50":
      return 5.0;
    case "BANKNIFTY":
      return 10.0;
    case "SENSEX":
      return 10.0;
    case "GC1!":
    case "XAUUSD":
    case "GOLD":
      return 0.5;
    default:
      return 5.0;
  }
}

/**
 * Computes the Institutional Fixed Range Volume Profile (FRVP)
 * with Value Area (70%), POC, HVN/LVN identification, and Shape Classification.
 */
export function computeVolumeProfile(
  rawCandles: readonly OrderFlowCandle[],
  config: VolumeProfileConfig
): VolumeProfileResult {
  const symbol = config.symbol;
  const binSize = config.binSize ?? getDefaultBinSize(symbol);
  const valueAreaRatio = config.valueAreaRatio ?? 0.70;
  const hvnMult = config.hvnThresholdMultiplier ?? 1.5;
  const lvnMult = config.lvnThresholdMultiplier ?? 0.4;

  // Filter candles by optional fixed range / session window
  let candles = rawCandles.filter((c) => {
    if (!Number.isFinite(c.close) || c.close <= 0) return false;
    if (config.sessionStartTime != null && c.time < config.sessionStartTime) return false;
    if (config.sessionEndTime != null && c.time > config.sessionEndTime) return false;
    return true;
  });

  if (candles.length === 0) {
    return createEmptyProfile(symbol, binSize);
  }

  // Sort candles chronologically
  candles = [...candles].sort((a, b) => a.time - b.time);

  const sessionOpenTime = candles[0].time;
  const sessionEndTime = candles[candles.length - 1].time;

  // Find price bounds
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalVolume = 0;

  for (const c of candles) {
    const low = Math.min(c.open, c.high, c.low, c.close);
    const high = Math.max(c.open, c.high, c.low, c.close);
    if (low < minPrice) minPrice = low;
    if (high > maxPrice) maxPrice = high;
    totalVolume += c.volume > 0 ? c.volume : 0;
  }

  if (minPrice === Infinity || maxPrice === -Infinity || totalVolume <= 0) {
    return createEmptyProfile(symbol, binSize);
  }

  // Align bins to clean grid
  const gridMin = Math.floor(minPrice / binSize) * binSize;
  const gridMax = Math.ceil(maxPrice / binSize) * binSize;
  const numBins = Math.max(1, Math.round((gridMax - gridMin) / binSize));

  // Initialize mutable accumulation arrays
  const binVolumes = new Float64Array(numBins);
  const binBuyVolumes = new Float64Array(numBins);
  const binSellVolumes = new Float64Array(numBins);

  // Distribute candle volume across bins
  for (const c of candles) {
    const vol = c.volume > 0 ? c.volume : 0;
    if (vol === 0) continue;

    // Estimate buy/sell volume if not explicitly provided
    let buyVol = c.buyVolume;
    let sellVol = c.sellVolume;
    if (buyVol == null || sellVol == null) {
      const candleRange = c.high - c.low;
      if (candleRange > 0) {
        const closePosition = (c.close - c.low) / candleRange;
        // Proportionate delta estimation: close at high = 85% buy, close at low = 15% buy
        const buyFactor = 0.15 + 0.70 * Math.max(0, Math.min(1, closePosition));
        buyVol = vol * buyFactor;
        sellVol = vol - buyVol;
      } else {
        buyVol = vol * 0.5;
        sellVol = vol * 0.5;
      }
    }

    const cLow = Math.max(gridMin, Math.min(c.open, c.high, c.low, c.close));
    const cHigh = Math.min(gridMax, Math.max(c.open, c.high, c.low, c.close));
    const startBin = Math.max(0, Math.min(numBins - 1, Math.floor((cLow - gridMin) / binSize)));
    const endBin = Math.max(0, Math.min(numBins - 1, Math.floor((cHigh - gridMin) / binSize)));
    const spannedBins = endBin - startBin + 1;

    if (spannedBins <= 1) {
      binVolumes[startBin] += vol;
      binBuyVolumes[startBin] += buyVol;
      binSellVolumes[startBin] += sellVol;
    } else {
      // Uniform volume distribution across spanned ticks
      const perBinVol = vol / spannedBins;
      const perBinBuy = buyVol / spannedBins;
      const perBinSell = sellVol / spannedBins;
      for (let b = startBin; b <= endBin; b++) {
        binVolumes[b] += perBinVol;
        binBuyVolumes[b] += perBinBuy;
        binSellVolumes[b] += perBinSell;
      }
    }
  }

  // 1. Identify Point of Control (POC) - bin with maximum volume
  let maxBinIndex = 0;
  let maxBinVol = -1;
  for (let i = 0; i < numBins; i++) {
    if (binVolumes[i] > maxBinVol) {
      maxBinVol = binVolumes[i];
      maxBinIndex = i;
    }
  }

  const pocPrice = gridMin + maxBinIndex * binSize + binSize / 2;
  const pocVolume = maxBinVol;

  // 2. Compute Value Area (70% standard)
  const targetVAVolume = totalVolume * valueAreaRatio;
  let currentVAVolume = binVolumes[maxBinIndex];
  let upIndex = maxBinIndex + 1;
  let downIndex = maxBinIndex - 1;

  while (currentVAVolume < targetVAVolume && (upIndex < numBins || downIndex >= 0)) {
    const upVol = upIndex < numBins ? binVolumes[upIndex] : -1;
    const downVol = downIndex >= 0 ? binVolumes[downIndex] : -1;

    if (upVol >= downVol && upIndex < numBins) {
      currentVAVolume += binVolumes[upIndex];
      upIndex++;
    } else if (downIndex >= 0) {
      currentVAVolume += binVolumes[downIndex];
      downIndex--;
    } else if (upIndex < numBins) {
      currentVAVolume += binVolumes[upIndex];
      upIndex++;
    } else {
      break;
    }
  }

  const vahBinIndex = Math.min(numBins - 1, upIndex - 1);
  const valBinIndex = Math.max(0, downIndex + 1);
  const vah = gridMin + vahBinIndex * binSize + binSize;
  const val = gridMin + valBinIndex * binSize;

  // 3. Node Detection (HVN & LVN via Rolling Local Moving Average)
  const windowRadius = 3; // 7-bin rolling window
  const localMA = new Float64Array(numBins);
  for (let i = 0; i < numBins; i++) {
    let sum = 0;
    let count = 0;
    for (let w = Math.max(0, i - windowRadius); w <= Math.min(numBins - 1, i + windowRadius); w++) {
      sum += binVolumes[w];
      count++;
    }
    localMA[i] = count > 0 ? sum / count : binVolumes[i];
  }

  const hvns: { price: number; volume: number }[] = [];
  const lvns: { price: number; volume: number }[] = [];
  const isHVN = new Uint8Array(numBins);
  const isLVN = new Uint8Array(numBins);

  for (let i = 0; i < numBins; i++) {
    const v = binVolumes[i];
    const ma = localMA[i];
    const binPrice = gridMin + i * binSize + binSize / 2;

    // Peak detection for HVN: higher than neighbors and > 1.5x local MA
    const prevV = i > 0 ? binVolumes[i - 1] : 0;
    const nextV = i < numBins - 1 ? binVolumes[i + 1] : 0;
    if (v >= ma * hvnMult && v >= prevV && v >= nextV) {
      isHVN[i] = 1;
      hvns.push({ price: binPrice, volume: v });
    }

    // Valley detection for LVN: lower than neighbors and < 0.4x local MA
    if (v <= ma * lvnMult && v <= prevV && v <= nextV && v > 0) {
      isLVN[i] = 1;
      lvns.push({ price: binPrice, volume: v });
    }
  }

  // Ensure POC is always recognized as a premier HVN
  isHVN[maxBinIndex] = 1;
  if (!hvns.some((h) => Math.abs(h.price - pocPrice) < binSize)) {
    hvns.unshift({ price: pocPrice, volume: pocVolume });
  }

  // 4. Build VolumeBins
  const bins: VolumeBin[] = [];
  for (let i = 0; i < numBins; i++) {
    const bLow = gridMin + i * binSize;
    const bHigh = bLow + binSize;
    const bMid = bLow + binSize / 2;
    const bVol = binVolumes[i];
    const bBuy = binBuyVolumes[i];
    const bSell = binSellVolumes[i];
    bins.push({
      price: Math.round(bMid * 100) / 100,
      low: Math.round(bLow * 100) / 100,
      high: Math.round(bHigh * 100) / 100,
      volume: Math.round(bVol * 100) / 100,
      buyVolume: Math.round(bBuy * 100) / 100,
      sellVolume: Math.round(bSell * 100) / 100,
      delta: Math.round((bBuy - bSell) * 100) / 100,
      percentage: totalVolume > 0 ? Math.round((bVol / totalVolume) * 10000) / 100 : 0,
      isPOC: i === maxBinIndex,
      isVAH: i === vahBinIndex,
      isVAL: i === valBinIndex,
      isHVN: isHVN[i] === 1,
      isLVN: isLVN[i] === 1,
    });
  }

  // 5. Shape Classification
  const priceRange = maxPrice - minPrice;
  const relativePocPosition = priceRange > 0 ? (pocPrice - minPrice) / priceRange : 0.5;

  let shape: ProfileShape;
  let shapeLabel: VolumeProfileResult["shapeLabel"];
  let shapeBias: VolumeProfileResult["shapeBias"];
  let summary: string;

  // Check for Double Distribution: two prominent HVNs with an LVN between them
  if (hvns.length >= 2) {
    const upperHvn = hvns.find((h) => (h.price - minPrice) / priceRange > 0.60);
    const lowerHvn = hvns.find((h) => (h.price - minPrice) / priceRange < 0.40);
    const middleLvn = lvns.find((l) => {
      const rel = (l.price - minPrice) / priceRange;
      return rel >= 0.35 && rel <= 0.65;
    });

    if (upperHvn && lowerHvn && middleLvn) {
      shape = "DOUBLE_DISTRIBUTION";
      shapeLabel = "Double Distribution";
      shapeBias = "NEUTRAL";
      summary = `Double distribution structure detected between upper acceptance (${upperHvn.price.toFixed(1)}) and lower acceptance (${lowerHvn.price.toFixed(1)}) across ${middleLvn.price.toFixed(1)} LVN void.`;
    } else {
      shape = null as unknown as ProfileShape;
      shapeLabel = null as unknown as VolumeProfileResult["shapeLabel"];
      shapeBias = null as unknown as VolumeProfileResult["shapeBias"];
      summary = "";
    }
  } else {
    shape = null as unknown as ProfileShape;
    shapeLabel = null as unknown as VolumeProfileResult["shapeLabel"];
    shapeBias = null as unknown as VolumeProfileResult["shapeBias"];
    summary = "";
  }

  if (!shape) {
    if (relativePocPosition >= 0.65) {
      // P-Shape Bullish: High acceptance near the highs, thin volume below
      shape = "P_SHAPE";
      shapeLabel = "P-Shape (Bullish)";
      shapeBias = "BULLISH";
      summary = `P-Shape Bullish profile: POC concentrated in upper 35% (${pocPrice.toFixed(1)}) indicating short-covering or aggressive buyer acceptance above ${val.toFixed(1)}.`;
    } else if (relativePocPosition <= 0.35) {
      // b-Shape Bearish: High acceptance near the lows, thin volume above
      shape = "B_SHAPE_BEARISH";
      shapeLabel = "b-Shape (Bearish)";
      shapeBias = "BEARISH";
      summary = `b-Shape Bearish profile: POC concentrated in lower 35% (${pocPrice.toFixed(1)}) indicating long liquidation or aggressive seller absorption below ${vah.toFixed(1)}.`;
    } else {
      // D-Shape Neutral / Balanced Rotation
      shape = "D_SHAPE";
      shapeLabel = "D-Shape (Rotation)";
      shapeBias = "NEUTRAL";
      summary = `D-Shape Balanced profile: Symmetric two-sided auction centered around ${pocPrice.toFixed(1)} Point of Control within Value Area [${val.toFixed(1)} - ${vah.toFixed(1)}].`;
    }
  }

  return {
    symbol,
    sessionOpenTime,
    sessionEndTime,
    totalVolume: Math.round(totalVolume * 100) / 100,
    totalCandles: candles.length,
    binSize,
    minPrice: Math.round(minPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    range: Math.round(priceRange * 100) / 100,
    poc: Math.round(pocPrice * 100) / 100,
    pocVolume: Math.round(pocVolume * 100) / 100,
    vah: Math.round(vah * 100) / 100,
    val: Math.round(val * 100) / 100,
    valueAreaVolume: Math.round(currentVAVolume * 100) / 100,
    valueAreaPercentage: totalVolume > 0 ? Math.round((currentVAVolume / totalVolume) * 1000) / 10 : 70.0,
    bins,
    hvns: hvns.map((h) => ({ price: Math.round(h.price * 100) / 100, volume: Math.round(h.volume * 100) / 100 })),
    lvns: lvns.map((l) => ({ price: Math.round(l.price * 100) / 100, volume: Math.round(l.volume * 100) / 100 })),
    shape,
    shapeLabel,
    shapeBias,
    relativePocPosition: Math.round(relativePocPosition * 1000) / 1000,
    summary,
  };
}

function createEmptyProfile(symbol: OrderFlowSymbol, binSize: number): VolumeProfileResult {
  return {
    symbol,
    sessionOpenTime: 0,
    sessionEndTime: 0,
    totalVolume: 0,
    totalCandles: 0,
    binSize,
    minPrice: 0,
    maxPrice: 0,
    range: 0,
    poc: 0,
    pocVolume: 0,
    vah: 0,
    val: 0,
    valueAreaVolume: 0,
    valueAreaPercentage: 70.0,
    bins: [],
    hvns: [],
    lvns: [],
    shape: "D_SHAPE",
    shapeLabel: "D-Shape (Rotation)",
    shapeBias: "NEUTRAL",
    relativePocPosition: 0.5,
    summary: "No candle volume available for session profile calculation.",
  };
}
