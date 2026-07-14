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