// Shared number/currency formatters. These were open-coded in ~5 route files
// (astro.tsx, live-terminal.tsx, live-levels.tsx, live-market-terminal.tsx,
// option-strategy.tsx). Pure presentation — no formulas changed.

/** Rupees-style rounded integer with Indian grouping. Example: 1,23,456. */
export function inrRound(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

/** Rupees-style rounded integer prefixed with ₹. */
export function inrPrice(n: number): string {
  return "₹" + inrRound(n);
}

/** US-style number with up to 2 fraction digits (used for non-INR instruments). */
export function usdLike(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Two-decimal Indian-grouped number used by dashboard widget cards. */
export const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Safe institutional PCR formatter.
 * Handles numbers, numeric strings, and DecisionSummary PCR objects ({ pcrOi: number, ... }).
 * Never throws TypeError: .toFixed is not a function.
 */
export function formatPcr(val: unknown, fallback: string = "1.00"): string {
  if (val == null) return fallback;
  let candidate: unknown = val;
  if (typeof candidate === "object" && candidate !== null) {
    if (Object.prototype.hasOwnProperty.call(candidate, "pcrOi")) {
      candidate = (candidate as { pcrOi?: unknown }).pcrOi;
    }
  }
  if (candidate == null) return fallback;
  const num = typeof candidate === "number" ? candidate : Number(candidate);
  return isNaN(num) || !isFinite(num) || num <= 0 ? fallback : num.toFixed(2);
}

