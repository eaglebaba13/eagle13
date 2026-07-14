// Pure, client-safe options analytics helpers for the Options Analytics
// Terminal (Phase 16). These are additive — none of the existing Astro,
// Signal, Level, Backtest, Replay, or Signal-Accuracy engines are modified
// or duplicated here. This module operates on a normalized option-chain
// snapshot and produces deterministic analytics: moneyness, PCR, Max Pain,
// build-up classification, writing/unwinding, options-derived S/R, Astro
// confluence, and a transparent BUY CE / BUY PE / WAIT scoring model.

export type OptionSide = "CE" | "PE";

export type OptionLeg = {
  strike: number;
  side: OptionSide;
  oi: number;
  changeOi: number;
  volume: number;
  ltp: number;
  changePct: number;
  iv: number | null;
  bid: number | null;
  ask: number | null;
};

export type OptionChainSnapshot = {
  symbol: "NIFTY" | "BANKNIFTY";
  spot: number;
  expiry: string; // ISO date
  fetchedAt: string; // ISO timestamp
  strikes: number[];
  legs: OptionLeg[];
  provider: string;
  source: "NSE" | "PROVIDER" | "SIMULATED";
};

export type Moneyness = "ITM" | "ATM" | "OTM";

/** Standard NIFTY step is 50, BANK NIFTY step is 100. */
export function inferStrikeStep(strikes: number[]): number {
  if (strikes.length < 2) return 50;
  const sorted = [...strikes].sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d > 0 && d < min) min = d;
  }
  return Number.isFinite(min) ? min : 50;
}

/** ATM = strike closest to spot (within half a strike step). */
export function atmStrike(spot: number, strikes: number[]): number {
  if (!strikes.length) return 0;
  return strikes.reduce((best, s) =>
    Math.abs(s - spot) < Math.abs(best - spot) ? s : best,
  );
}

export function classifyMoneyness(
  strike: number,
  spot: number,
  side: OptionSide,
  step: number,
): Moneyness {
  if (Math.abs(strike - spot) <= step / 2) return "ATM";
  if (side === "CE") return strike < spot ? "ITM" : "OTM";
  return strike > spot ? "ITM" : "OTM";
}

/* ------------------------------ PCR ------------------------------- */

export type PcrResult = {
  totalCallOi: number;
  totalPutOi: number;
  totalCallVolume: number;
  totalPutVolume: number;
  pcrOi: number;
  pcrVolume: number;
};

export function computePCR(legs: OptionLeg[]): PcrResult {
  let totalCallOi = 0,
    totalPutOi = 0,
    totalCallVolume = 0,
    totalPutVolume = 0;
  for (const leg of legs) {
    if (leg.side === "CE") {
      totalCallOi += leg.oi;
      totalCallVolume += leg.volume;
    } else {
      totalPutOi += leg.oi;
      totalPutVolume += leg.volume;
    }
  }
  const pcrOi = totalCallOi > 0 ? totalPutOi / totalCallOi : 0;
  const pcrVolume = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;
  return {
    totalCallOi,
    totalPutOi,
    totalCallVolume,
    totalPutVolume,
    pcrOi: Math.round(pcrOi * 1000) / 1000,
    pcrVolume: Math.round(pcrVolume * 1000) / 1000,
  };
}

/** Configurable PCR interpretation. Defaults are documented as configurable. */
export type PcrThresholds = { bullish: number; bearish: number };
export const DEFAULT_PCR_THRESHOLDS: PcrThresholds = { bullish: 1.1, bearish: 0.85 };

export function interpretPcr(
  pcr: number,
  t: PcrThresholds = DEFAULT_PCR_THRESHOLDS,
): "Bullish" | "Bearish" | "Neutral" {
  if (pcr >= t.bullish) return "Bullish";
  if (pcr <= t.bearish) return "Bearish";
  return "Neutral";
}

/* --------------------------- Max Pain ----------------------------- */

/**
 * Max Pain: strike at which the total intrinsic payout across all open
 * contracts is minimized (the strike where option writers collectively
 * suffer the least, and option buyers the most).
 *
 * For each candidate strike K:
 *   call payout = sum over strikes s: CE.oi(s) * max(K - s, 0)
 *   put  payout = sum over strikes s: PE.oi(s) * max(s - K, 0)
 *   total = call payout + put payout
 */
export function computeMaxPain(legs: OptionLeg[]): {
  strike: number;
  payout: number;
  table: { strike: number; call: number; put: number; total: number }[];
} {
  const strikes = Array.from(new Set(legs.map((l) => l.strike))).sort((a, b) => a - b);
  const callOi = new Map<number, number>();
  const putOi = new Map<number, number>();
  for (const leg of legs) {
    const map = leg.side === "CE" ? callOi : putOi;
    map.set(leg.strike, (map.get(leg.strike) ?? 0) + leg.oi);
  }
  const table = strikes.map((k) => {
    let call = 0;
    let put = 0;
    for (const s of strikes) {
      call += (callOi.get(s) ?? 0) * Math.max(k - s, 0);
      put += (putOi.get(s) ?? 0) * Math.max(s - k, 0);
    }
    return { strike: k, call, put, total: call + put };
  });
  if (!table.length) return { strike: 0, payout: 0, table: [] };
  const min = table.reduce((a, b) => (b.total < a.total ? b : a));
  return { strike: min.strike, payout: min.total, table };
}

/* --------------------- Build-up classification -------------------- */

export type Buildup =
  | "LONG_BUILDUP"
  | "SHORT_BUILDUP"
  | "SHORT_COVERING"
  | "LONG_UNWINDING"
  | "UNKNOWN";

export function classifyBuildup(
  prevPrice: number | null,
  currPrice: number,
  prevOi: number | null,
  currOi: number,
): Buildup {
  if (prevPrice == null || prevOi == null) return "UNKNOWN";
  const priceUp = currPrice > prevPrice;
  const priceDown = currPrice < prevPrice;
  const oiUp = currOi > prevOi;
  const oiDown = currOi < prevOi;
  if (priceUp && oiUp) return "LONG_BUILDUP";
  if (priceDown && oiUp) return "SHORT_BUILDUP";
  if (priceUp && oiDown) return "SHORT_COVERING";
  if (priceDown && oiDown) return "LONG_UNWINDING";
  return "UNKNOWN";
}

/* ----------------- Writing / Unwinding ranking -------------------- */

export type WritingRow = {
  strike: number;
  side: OptionSide;
  changeOi: number;
  oi: number;
  volume: number;
  ltp: number;
  changePct: number;
  distance: number;
};

export function rankWriting(
  legs: OptionLeg[],
  spot: number,
  side: OptionSide,
  limit = 5,
): WritingRow[] {
  return legs
    .filter((l) => l.side === side && l.changeOi > 0)
    .map((l) => ({
      strike: l.strike,
      side,
      changeOi: l.changeOi,
      oi: l.oi,
      volume: l.volume,
      ltp: l.ltp,
      changePct: l.changePct,
      distance: Math.abs(l.strike - spot),
    }))
    .sort((a, b) => b.changeOi - a.changeOi)
    .slice(0, limit);
}

export function rankUnwinding(
  legs: OptionLeg[],
  spot: number,
  side: OptionSide,
  limit = 5,
): WritingRow[] {
  return legs
    .filter((l) => l.side === side && l.changeOi < 0)
    .map((l) => ({
      strike: l.strike,
      side,
      changeOi: l.changeOi,
      oi: l.oi,
      volume: l.volume,
      ltp: l.ltp,
      changePct: l.changePct,
      distance: Math.abs(l.strike - spot),
    }))
    .sort((a, b) => a.changeOi - b.changeOi) // most negative first
    .slice(0, limit);
}

/* ---------------- Support / Resistance selection ----------------- */

export type OptionsLevel = {
  strike: number;
  kind: "SUPPORT" | "RESISTANCE";
  rank: "PRIMARY" | "SECONDARY";
  oi: number;
  changeOi: number;
};

export function selectOptionsLevels(legs: OptionLeg[]): OptionsLevel[] {
  const calls = legs.filter((l) => l.side === "CE");
  const puts = legs.filter((l) => l.side === "PE");
  const out: OptionsLevel[] = [];
  if (calls.length) {
    const byOi = [...calls].sort((a, b) => b.oi - a.oi)[0];
    const byAdd = [...calls]
      .filter((c) => c.changeOi > 0 && c.strike !== byOi.strike)
      .sort((a, b) => b.changeOi - a.changeOi)[0];
    out.push({
      strike: byOi.strike,
      kind: "RESISTANCE",
      rank: "PRIMARY",
      oi: byOi.oi,
      changeOi: byOi.changeOi,
    });
    if (byAdd)
      out.push({
        strike: byAdd.strike,
        kind: "RESISTANCE",
        rank: "SECONDARY",
        oi: byAdd.oi,
        changeOi: byAdd.changeOi,
      });
  }
  if (puts.length) {
    const byOi = [...puts].sort((a, b) => b.oi - a.oi)[0];
    const byAdd = [...puts]
      .filter((p) => p.changeOi > 0 && p.strike !== byOi.strike)
      .sort((a, b) => b.changeOi - a.changeOi)[0];
    out.push({
      strike: byOi.strike,
      kind: "SUPPORT",
      rank: "PRIMARY",
      oi: byOi.oi,
      changeOi: byOi.changeOi,
    });
    if (byAdd)
      out.push({
        strike: byAdd.strike,
        kind: "SUPPORT",
        rank: "SECONDARY",
        oi: byAdd.oi,
        changeOi: byAdd.changeOi,
      });
  }
  return out;
}

/* -------------------- Astro-level confluence --------------------- */

export type AstroLevelLite = { planet: string; label: string; value: number };
export type ConfluenceStrength = "VERY_STRONG" | "STRONG" | "MODERATE" | "WEAK";

export function confluenceBand(distance: number, tolerance: number): ConfluenceStrength {
  if (distance <= tolerance) return "VERY_STRONG";
  if (distance <= tolerance * 2) return "STRONG";
  if (distance <= tolerance * 4) return "MODERATE";
  return "WEAK";
}

export function nearestAstroLevel(
  optionStrike: number,
  astroLevels: AstroLevelLite[],
  tolerance: number,
): { level: AstroLevelLite; distance: number; strength: ConfluenceStrength } | null {
  if (!astroLevels.length) return null;
  let best = astroLevels[0];
  let bestD = Math.abs(optionStrike - best.value);
  for (const l of astroLevels) {
    const d = Math.abs(optionStrike - l.value);
    if (d < bestD) {
      best = l;
      bestD = d;
    }
  }
  return { level: best, distance: bestD, strength: confluenceBand(bestD, tolerance) };
}

/** BANK NIFTY moves ~4× wider than NIFTY — scale tolerance accordingly. */
export function confluenceTolerance(symbol: "NIFTY" | "BANKNIFTY"): number {
  return symbol === "BANKNIFTY" ? 20 : 5;
}

/* ----------------------- Recommendation -------------------------- */

export type RecommendationInputs = {
  spot: number;
  atm: number;
  maxPain: number;
  pcrOi: number;
  pcrVolume: number;
  pcrTrend: number; // pcrOi - prevPcrOi (0 if unknown)
  callWriting: number; // total change-in-OI on CE side (positive = writing)
  putWriting: number; // total change-in-OI on PE side
  vix: number | null;
  breadthBias: "Bullish" | "Bearish" | "Neutral" | null;
  astroBias: "Bullish" | "Bearish" | "Neutral" | null;
  supportConfluence: ConfluenceStrength | null;
  resistanceConfluence: ConfluenceStrength | null;
  dataComplete: boolean;
  thresholds?: PcrThresholds;
};

export type RecommendationScore = {
  label: "Options OI" | "PCR" | "Writing/Unwinding" | "Breadth" | "VIX" | "Astro Confluence";
  ce: number;
  pe: number;
  note: string;
};

export type Recommendation = {
  action: "BUY_CE" | "BUY_PE" | "WAIT";
  confidence: number; // 0..100
  scores: RecommendationScore[];
  reasons: string[];
};

function confluenceScore(strength: ConfluenceStrength | null): number {
  switch (strength) {
    case "VERY_STRONG":
      return 3;
    case "STRONG":
      return 2;
    case "MODERATE":
      return 1;
    default:
      return 0;
  }
}

export function scoreRecommendation(inp: RecommendationInputs): Recommendation {
  const thresholds = inp.thresholds ?? DEFAULT_PCR_THRESHOLDS;
  const scores: RecommendationScore[] = [];
  const reasons: string[] = [];

  if (!inp.dataComplete) {
    return {
      action: "WAIT",
      confidence: 0,
      scores: [],
      reasons: ["Data incomplete — waiting for a complete option-chain snapshot"],
    };
  }

  // Options OI structure: spot vs Max Pain
  const painGap = inp.spot - inp.maxPain;
  let oiCe = 0,
    oiPe = 0;
  if (painGap > 0) {
    oiCe += 2;
    reasons.push(`Spot above Max Pain (${inp.maxPain}) — bullish drift`);
  } else if (painGap < 0) {
    oiPe += 2;
    reasons.push(`Spot below Max Pain (${inp.maxPain}) — bearish drift`);
  }
  scores.push({ label: "Options OI", ce: oiCe, pe: oiPe, note: `Spot vs Max Pain ${inp.maxPain}` });

  // PCR
  let pcrCe = 0,
    pcrPe = 0;
  const pcrInterp = interpretPcr(inp.pcrOi, thresholds);
  if (pcrInterp === "Bullish") {
    pcrCe += 2;
    reasons.push(`PCR OI ${inp.pcrOi.toFixed(2)} bullish (put writing dominant)`);
  } else if (pcrInterp === "Bearish") {
    pcrPe += 2;
    reasons.push(`PCR OI ${inp.pcrOi.toFixed(2)} bearish (call writing dominant)`);
  }
  if (inp.pcrTrend > 0.05) pcrCe += 1;
  else if (inp.pcrTrend < -0.05) pcrPe += 1;
  scores.push({ label: "PCR", ce: pcrCe, pe: pcrPe, note: `PCR OI ${inp.pcrOi.toFixed(2)}` });

  // Writing / Unwinding
  let wCe = 0,
    wPe = 0;
  if (inp.putWriting > inp.callWriting * 1.15) {
    wCe += 3;
    reasons.push("Put writing stronger than call writing");
  } else if (inp.callWriting > inp.putWriting * 1.15) {
    wPe += 3;
    reasons.push("Call writing stronger than put writing");
  }
  scores.push({
    label: "Writing/Unwinding",
    ce: wCe,
    pe: wPe,
    note: `CE Δ${Math.round(inp.callWriting)} vs PE Δ${Math.round(inp.putWriting)}`,
  });

  // Breadth
  let bCe = 0,
    bPe = 0;
  if (inp.breadthBias === "Bullish") {
    bCe += 2;
    reasons.push("Market breadth bullish");
  } else if (inp.breadthBias === "Bearish") {
    bPe += 2;
    reasons.push("Market breadth bearish");
  }
  scores.push({ label: "Breadth", ce: bCe, pe: bPe, note: inp.breadthBias ?? "n/a" });

  // VIX preference (strategy — not directional scoring, informational)
  const vixNote =
    inp.vix == null
      ? "n/a"
      : inp.vix < 15
        ? "Low VIX — prefer ITM"
        : inp.vix <= 20
          ? "Moderate VIX — prefer ATM"
          : "High VIX — prefer OTM";
  scores.push({ label: "VIX", ce: 0, pe: 0, note: vixNote });

  // Astro confluence
  let aCe = 0,
    aPe = 0;
  const supS = confluenceScore(inp.supportConfluence);
  const resS = confluenceScore(inp.resistanceConfluence);
  aCe += supS;
  aPe += resS;
  if (supS >= 2) reasons.push(`Support aligns with Astro (${inp.supportConfluence})`);
  if (resS >= 2) reasons.push(`Resistance aligns with Astro (${inp.resistanceConfluence})`);
  if (inp.astroBias === "Bullish") {
    aCe += 1;
    reasons.push("Astro bias bullish");
  } else if (inp.astroBias === "Bearish") {
    aPe += 1;
    reasons.push("Astro bias bearish");
  }
  scores.push({
    label: "Astro Confluence",
    ce: aCe,
    pe: aPe,
    note: `${inp.supportConfluence ?? "-"} / ${inp.resistanceConfluence ?? "-"}`,
  });

  const ceTotal = scores.reduce((a, s) => a + s.ce, 0);
  const peTotal = scores.reduce((a, s) => a + s.pe, 0);
  // Max possible per-side ≈ 2+3+3+2+0+4 = 14.
  const denom = 14;
  const ceConf = Math.min(100, Math.round((ceTotal / denom) * 100));
  const peConf = Math.min(100, Math.round((peTotal / denom) * 100));

  let action: Recommendation["action"] = "WAIT";
  let confidence = Math.max(0, Math.abs(ceConf - peConf));
  if (ceTotal >= 5 && ceTotal > peTotal + 2) {
    action = "BUY_CE";
    confidence = ceConf;
  } else if (peTotal >= 5 && peTotal > ceTotal + 2) {
    action = "BUY_PE";
    confidence = peConf;
  } else {
    action = "WAIT";
    if (!reasons.length) reasons.push("Signals balanced — no clear directional edge");
  }

  return { action, confidence, scores, reasons };
}

/* --------------------- Focus alert confirmation ------------------ */

export type FocusSample = {
  ts: number;
  putWriting: number;
  callWriting: number;
};

export type FocusAlert = "FOCUS_CALL" | "FOCUS_PUT" | null;

/**
 * Only emit a focus alert when the SAME dominance is confirmed on the two
 * most recent samples. Prevents flicker between consecutive snapshots.
 */
export function confirmFocus(samples: FocusSample[], ratio = 1.25): FocusAlert {
  if (samples.length < 2) return null;
  const last = samples[samples.length - 1];
  const prev = samples[samples.length - 2];
  const focusOf = (s: FocusSample): FocusAlert => {
    if (s.putWriting > s.callWriting * ratio) return "FOCUS_CALL";
    if (s.callWriting > s.putWriting * ratio) return "FOCUS_PUT";
    return null;
  };
  const a = focusOf(last);
  const b = focusOf(prev);
  return a && a === b ? a : null;
}

/* ------------------------- Expiry selection ---------------------- */

export type ExpiryCategory = "NEAR_WEEKLY" | "NEXT_WEEKLY" | "MONTHLY" | "OTHER";

/**
 * Categorize a sorted list of expiry ISO dates (ascending). Nearest = weekly
 * near, next = weekly next, and the last expiry within the current calendar
 * month (or the first expiry after it, if the current month has none) is
 * treated as the monthly. Deterministic and provider-agnostic.
 */
export function categorizeExpiries(
  expiries: string[],
  now: Date = new Date(),
): { expiry: string; category: ExpiryCategory; daysToExpiry: number }[] {
  const sorted = [...expiries].sort();
  const future = sorted.filter((e) => new Date(e).getTime() >= startOfDay(now).getTime());
  const monthly = pickMonthly(future);
  return future.map((e, i) => {
    const days = Math.max(
      0,
      Math.round((new Date(e).getTime() - startOfDay(now).getTime()) / 86_400_000),
    );
    let category: ExpiryCategory = "OTHER";
    if (i === 0) category = "NEAR_WEEKLY";
    else if (i === 1) category = "NEXT_WEEKLY";
    if (e === monthly) category = "MONTHLY";
    return { expiry: e, category, daysToExpiry: days };
  });
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function pickMonthly(sortedFuture: string[]): string | null {
  if (!sortedFuture.length) return null;
  const first = new Date(sortedFuture[0]);
  const y = first.getFullYear();
  const m = first.getMonth();
  const sameMonth = sortedFuture.filter((e) => {
    const d = new Date(e);
    return d.getFullYear() === y && d.getMonth() === m;
  });
  if (sameMonth.length) return sameMonth[sameMonth.length - 1];
  return sortedFuture[0];
}

/* ---------------------- Data quality check ----------------------- */

export type DataQuality = {
  ok: boolean;
  strikesLoaded: number;
  missingFields: string[];
  hasIv: boolean;
  hasGreeks: boolean;
  ageSeconds: number;
};

export function assessDataQuality(
  snapshot: OptionChainSnapshot,
  now: number = Date.now(),
): DataQuality {
  const missing: string[] = [];
  if (!snapshot.legs.length) missing.push("legs");
  const hasIv = snapshot.legs.some((l) => l.iv != null);
  const legsWithoutOi = snapshot.legs.filter((l) => !Number.isFinite(l.oi)).length;
  if (legsWithoutOi > 0) missing.push(`oi(${legsWithoutOi})`);
  const age = Math.max(0, Math.round((now - new Date(snapshot.fetchedAt).getTime()) / 1000));
  return {
    ok: snapshot.legs.length > 0 && legsWithoutOi === 0,
    strikesLoaded: snapshot.strikes.length,
    missingFields: missing,
    hasIv,
    hasGreeks: false,
    ageSeconds: age,
  };
}