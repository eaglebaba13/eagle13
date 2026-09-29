// Astro vs SMC conflict-bucket computation (Phase 21.4 Stage 4A).
// Extracted from `CompareAstroSmc.tsx` so that module only exports components
// (React Fast Refresh). Logic is unchanged.

export type ConflictBucket = {
  astroBuySmcBuy: number;
  astroSellSmcSell: number;
  astroBuySmcSell: number;
  astroSellSmcBuy: number;
  astroOnly: number;
  smcOnly: number;
};

export function computeConflictBuckets(
  astroTradesByDate: Map<string, "BUY" | "SELL" | "WAIT">,
  smcTradesByDate: Map<string, "BUY" | "SELL">,
): ConflictBucket {
  const b: ConflictBucket = {
    astroBuySmcBuy: 0,
    astroSellSmcSell: 0,
    astroBuySmcSell: 0,
    astroSellSmcBuy: 0,
    astroOnly: 0,
    smcOnly: 0,
  };
  const allDates = new Set([...astroTradesByDate.keys(), ...smcTradesByDate.keys()]);
  for (const d of allDates) {
    const a = astroTradesByDate.get(d);
    const s = smcTradesByDate.get(d);
    if (a && a !== "WAIT" && s) {
      if (a === "BUY" && s === "BUY") b.astroBuySmcBuy++;
      else if (a === "SELL" && s === "SELL") b.astroSellSmcSell++;
      else if (a === "BUY" && s === "SELL") b.astroBuySmcSell++;
      else if (a === "SELL" && s === "BUY") b.astroSellSmcBuy++;
    } else if (a && a !== "WAIT" && !s) {
      b.astroOnly++;
    } else if (!a && s) {
      b.smcOnly++;
    }
  }
  return b;
}
