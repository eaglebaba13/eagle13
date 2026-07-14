// Pure, client-safe calculation helpers shared across the strategy/astro data
// layers. Extracted VERBATIM from the existing server functions so they can be
// unit-tested in isolation. No formula, threshold, or business rule is changed
// here — these are the exact same computations that previously lived inline in
// astro.functions.ts and option-strategy.functions.ts.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Exponential moving average of the last `period` closes (day timeframe).
export function computeEma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return round2(ema);
}

// Directional bias from a percentage move.
export function biasFromPct(pct: number): "Bullish" | "Bearish" | "Neutral" {
  if (pct > 0.15) return "Bullish";
  if (pct < -0.15) return "Bearish";
  return "Neutral";
}

// Model per-sector advance/decline (out of ~50 members) from the sector move.
export function sectorBreadth(pct: number): { advance: number; decline: number } {
  const total = 50;
  const frac = clamp(0.5 + pct / 6, 0.05, 0.95);
  const advance = Math.round(total * frac);
  return { advance, decline: total - advance };
}

export type VixStrategy = {
  vix: number;
  changePct: number;
  band: "ITM" | "ATM" | "OTM";
  label: string;
  tone: "green" | "yellow" | "red";
};

// India VIX option-band strategy (identical thresholds to the previous inline
// logic: <15 → ITM, 15..20 → ATM, >20 → OTM).
export function vixStrategy(vixVal: number, changePct: number): VixStrategy {
  if (vixVal < 15)
    return { vix: vixVal, changePct, band: "ITM", label: "BUY ITM OPTIONS", tone: "green" };
  if (vixVal <= 20)
    return { vix: vixVal, changePct, band: "ATM", label: "BUY ATM OPTIONS", tone: "yellow" };
  return { vix: vixVal, changePct, band: "OTM", label: "BUY OTM OPTIONS", tone: "red" };
}

// PCR focus for the LIVE NSE chain (change-in-OI driven).
export function pcrFocusFromOI(
  changeCallOI: number,
  changePutOI: number,
): "CALL" | "PUT" | "NEUTRAL" {
  if (changePutOI > changeCallOI * 1.15) return "CALL";
  if (changeCallOI > changePutOI * 1.15) return "PUT";
  return "NEUTRAL";
}

// PCR focus for the DERIVED proxy chain.
export function pcrFocusFromRatio(pcr: number): "CALL" | "PUT" | "NEUTRAL" {
  if (pcr >= 1.1) return "CALL";
  if (pcr <= 0.85) return "PUT";
  return "NEUTRAL";
}