// Phase 21.3 · Canonical CostModel — re-exports the pre-existing
// backtest-engine CostModel so both daily and intraday adapters share one
// numeric implementation. No new math; parity tests confirm equivalence.

export type { CostModel } from "../backtest-engine";
export { ZERO_COSTS } from "../backtest-engine";

import type { CostModel } from "../backtest-engine";

/** Index-point mode — used for spot-index PnL where no % costs apply. */
export const INDEX_POINT_COSTS: CostModel = {
  slippagePct: 0,
  brokerageFlat: 0,
  brokeragePct: 0,
  taxesPct: 0,
};

export function applyCosts(
  grossPnl: number,
  entry: number,
  exit: number,
  costs: CostModel,
): { netPnl: number; costs: number } {
  const notional = Math.abs(entry) + Math.abs(exit);
  const slip = notional * (costs.slippagePct / 100);
  const brok = costs.brokerageFlat + notional * (costs.brokeragePct / 100);
  const tax = notional * (costs.taxesPct / 100);
  const total = Math.round((slip + brok + tax) * 100) / 100;
  return { netPnl: Math.round((grossPnl - total) * 100) / 100, costs: total };
}
