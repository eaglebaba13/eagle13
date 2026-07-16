// Phase 21.7 · Deterministic market regime detector.
//
// Pure function: given an ordered OHLC series, classify the terminal window
// into a discrete regime label. Uses only backwards-looking inputs (ATR, ADX
// proxy, EMA slope, HH/HL/LH/LL swing tallies, range compression/expansion,
// volatility percentile) — never looks at future candles. Every regime is
// derived from a single transparent rule set so downstream consumers can
// justify classifications.

export type Ohlc = {
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
};

export type MarketRegime =
  | "TRENDING_UP"
  | "TRENDING_DOWN"
  | "RANGE"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "BREAKOUT"
  | "MEAN_REVERSION"
  | "UNKNOWN";

export type RegimeFeatures = {
  readonly sampleSize: number;
  readonly atr: number;
  readonly atrPct: number;
  readonly adxLike: number;
  readonly emaSlopePct: number;
  readonly hh: number;
  readonly hl: number;
  readonly lh: number;
  readonly ll: number;
  readonly rangeCompression: number;
  readonly rangeExpansion: number;
  readonly volatilityPercentile: number;
};

export type RegimeClassification = {
  readonly regime: MarketRegime;
  readonly features: RegimeFeatures;
  readonly reasons: readonly string[];
};

export type RegimeOptions = {
  /** Window used to compute ATR and slope (default 14). */
  readonly window?: number;
  /** Longer window for volatility percentile (default 60). */
  readonly percentileWindow?: number;
};

const DEFAULTS = { window: 14, percentileWindow: 60 } as const;

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function trueRange(prev: Ohlc, cur: Ohlc): number {
  return Math.max(
    cur.h - cur.l,
    Math.abs(cur.h - prev.c),
    Math.abs(cur.l - prev.c),
  );
}

function ema(values: readonly number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

/** Simple ADX-like proxy: directional-movement ratio over the window. */
function adxLike(candles: readonly Ohlc[], window: number): number {
  if (candles.length < window + 1) return 0;
  let plus = 0;
  let minus = 0;
  let tr = 0;
  const start = candles.length - window;
  for (let i = start; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    const upMove = cur.h - prev.h;
    const downMove = prev.l - cur.l;
    if (upMove > downMove && upMove > 0) plus += upMove;
    if (downMove > upMove && downMove > 0) minus += downMove;
    tr += trueRange(prev, cur);
  }
  if (tr <= 0) return 0;
  const plusDI = (plus / tr) * 100;
  const minusDI = (minus / tr) * 100;
  const sum = plusDI + minusDI;
  if (sum <= 0) return 0;
  return round6((Math.abs(plusDI - minusDI) / sum) * 100);
}

function computeSwings(candles: readonly Ohlc[], k: number): {
  hh: number; hl: number; lh: number; ll: number;
} {
  if (candles.length < 2 * k + 3) return { hh: 0, hl: 0, lh: 0, ll: 0 };
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= k; j++) {
      if (candles[i - j].h >= candles[i].h || candles[i + j].h >= candles[i].h) isHigh = false;
      if (candles[i - j].l <= candles[i].l || candles[i + j].l <= candles[i].l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push(candles[i].h);
    if (isLow) lows.push(candles[i].l);
  }
  let hh = 0, lh = 0, hl = 0, ll = 0;
  for (let i = 1; i < highs.length; i++) {
    if (highs[i] > highs[i - 1]) hh++;
    else if (highs[i] < highs[i - 1]) lh++;
  }
  for (let i = 1; i < lows.length; i++) {
    if (lows[i] > lows[i - 1]) hl++;
    else if (lows[i] < lows[i - 1]) ll++;
  }
  return { hh, hl, lh, ll };
}

export function computeRegimeFeatures(
  candles: readonly Ohlc[],
  opts: RegimeOptions = {},
): RegimeFeatures {
  const window = Math.max(2, opts.window ?? DEFAULTS.window);
  const pctWin = Math.max(window, opts.percentileWindow ?? DEFAULTS.percentileWindow);
  const n = candles.length;
  if (n < window + 2) {
    return {
      sampleSize: n,
      atr: 0, atrPct: 0, adxLike: 0, emaSlopePct: 0,
      hh: 0, hl: 0, lh: 0, ll: 0,
      rangeCompression: 0, rangeExpansion: 0, volatilityPercentile: 0,
    };
  }
  // ATR over last `window` candles.
  let sumTr = 0;
  for (let i = n - window; i < n; i++) sumTr += trueRange(candles[i - 1], candles[i]);
  const atr = sumTr / window;
  const lastClose = candles[n - 1].c;
  const atrPct = lastClose > 0 ? (atr / lastClose) * 100 : 0;

  // EMA slope: EMA(window) at end vs `window` bars back.
  const closes = candles.map((c) => c.c);
  const e = ema(closes, window);
  const eNow = e[n - 1];
  const ePrev = e[n - 1 - window];
  const emaSlopePct = ePrev > 0 ? ((eNow - ePrev) / ePrev) * 100 : 0;

  const swings = computeSwings(candles.slice(-Math.min(n, pctWin)), 2);

  // Range compression = ratio of current window ATR to prior window ATR.
  let sumPrev = 0;
  const priorStart = n - 2 * window;
  if (priorStart >= 1) {
    for (let i = priorStart; i < priorStart + window; i++) sumPrev += trueRange(candles[i - 1], candles[i]);
  }
  const atrPrev = priorStart >= 1 ? sumPrev / window : atr;
  const compression = atrPrev > 0 ? atr / atrPrev : 1;
  const expansion = compression > 0 ? 1 / compression : 1;

  // Volatility percentile of current ATR within trailing pctWin per-bar TRs.
  const trs: number[] = [];
  const start = Math.max(1, n - pctWin);
  for (let i = start; i < n; i++) trs.push(trueRange(candles[i - 1], candles[i]));
  trs.sort((a, b) => a - b);
  const rank = trs.filter((x) => x <= atr).length;
  const vp = trs.length ? (rank / trs.length) * 100 : 0;

  return {
    sampleSize: n,
    atr: round6(atr),
    atrPct: round6(atrPct),
    adxLike: adxLike(candles, window),
    emaSlopePct: round6(emaSlopePct),
    hh: swings.hh, hl: swings.hl, lh: swings.lh, ll: swings.ll,
    rangeCompression: round6(compression),
    rangeExpansion: round6(expansion),
    volatilityPercentile: round6(vp),
  };
}

/**
 * Classify the terminal window of an OHLC series into a market regime.
 * Rules are evaluated in priority order:
 *   1. Insufficient sample → UNKNOWN
 *   2. Sudden expansion breaking prior compression → BREAKOUT
 *   3. High volatility percentile → HIGH_VOLATILITY
 *   4. Strong ADX proxy + positive slope + HH/HL dominance → TRENDING_UP
 *   5. Strong ADX proxy + negative slope + LH/LL dominance → TRENDING_DOWN
 *   6. Low volatility + weak trend → LOW_VOLATILITY
 *   7. Compressed range and balanced swings → RANGE
 *   8. Weak trend + HH/HL balance flipping → MEAN_REVERSION
 *   9. Fallback → UNKNOWN
 */
export function classifyRegime(
  candles: readonly Ohlc[],
  opts: RegimeOptions = {},
): RegimeClassification {
  const features = computeRegimeFeatures(candles, opts);
  const reasons: string[] = [];
  const window = Math.max(2, opts.window ?? DEFAULTS.window);
  if (features.sampleSize < window + 2) {
    return { regime: "UNKNOWN", features, reasons: ["INSUFFICIENT_SAMPLE"] };
  }

  const swingUp = features.hh + features.hl >= features.lh + features.ll;
  const swingDown = features.lh + features.ll >= features.hh + features.hl;
  const strongTrend = features.adxLike >= 25 || Math.abs(features.emaSlopePct) >= 1;
  const upBias = features.emaSlopePct > 0.2 && swingUp;
  const downBias = features.emaSlopePct < -0.2 && swingDown;

  // Trend classification takes priority over volatility percentile,
  // otherwise a monotonic series (all TRs equal → 100th percentile)
  // would masquerade as HIGH_VOLATILITY.
  if (strongTrend && upBias) {
    reasons.push(`ADX=${features.adxLike}`, `EMA_SLOPE=${features.emaSlopePct}`);
    return { regime: "TRENDING_UP", features, reasons };
  }
  if (strongTrend && downBias) {
    reasons.push(`ADX=${features.adxLike}`, `EMA_SLOPE=${features.emaSlopePct}`);
    return { regime: "TRENDING_DOWN", features, reasons };
  }

  // Absolute-quiet check before percentile fires, otherwise a flat-line
  // series with tiny ATR would be flagged HIGH_VOLATILITY.
  if (features.atrPct <= 0.1) {
    reasons.push(`ATR_PCT=${features.atrPct}`);
    return { regime: "LOW_VOLATILITY", features, reasons };
  }

  if (features.rangeExpansion >= 1.6 && features.volatilityPercentile >= 70) {
    reasons.push(`RANGE_EXPANSION=${features.rangeExpansion}`);
    reasons.push(`VOL_PCT=${features.volatilityPercentile}`);
    return { regime: "BREAKOUT", features, reasons };
  }
  if (features.volatilityPercentile >= 85) {
    reasons.push(`VOL_PCT=${features.volatilityPercentile}`);
    return { regime: "HIGH_VOLATILITY", features, reasons };
  }
  if (features.volatilityPercentile <= 20 && features.adxLike < 20) {
    reasons.push(`VOL_PCT=${features.volatilityPercentile}`, `ADX=${features.adxLike}`);
    return { regime: "LOW_VOLATILITY", features, reasons };
  }
  if (features.rangeCompression <= 0.8 && features.adxLike < 20) {
    reasons.push(`RANGE_COMPRESSION=${features.rangeCompression}`);
    return { regime: "RANGE", features, reasons };
  }
  if (features.adxLike < 20 && Math.abs(features.hh - features.ll) <= 1 && Math.abs(features.hl - features.lh) <= 1) {
    reasons.push("WEAK_TREND_BALANCED_SWINGS");
    return { regime: "MEAN_REVERSION", features, reasons };
  }
  return { regime: "UNKNOWN", features, reasons: ["NO_RULE_MATCHED"] };
}

export const MARKET_REGIME_ENGINE_VERSION = "MARKET_REGIME_V1";