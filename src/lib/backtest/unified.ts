// Phase 21.3c · Unified backtest dispatch — NON-server entry point.
//
// Wraps `runHistoricalCore` with strategy/formula validation and typed error
// codes. Kept out of the .functions.ts modules so it can be unit-tested
// without spinning up the TanStack server-function harness.

import type { AdapterConfig } from "./adapter";
import type { HistoricalBacktestResult, DataGranularity, UnifiedFormulaId } from "./result";
import { runHistoricalCore } from "./runner";
import {
  UnifiedBacktestConfigError,
  validateUnifiedConfig,
  type StrategyId,
} from "./strategy";

export type RunUnifiedBacktestArgs = AdapterConfig & {
  strategy: StrategyId;
  formula: UnifiedFormulaId;
  timeframe?: DataGranularity;
  ingestVersion?: string;
};

export async function runUnifiedBacktest(
  args: RunUnifiedBacktestArgs,
): Promise<HistoricalBacktestResult> {
  const { strategy, formula, timeframe, ingestVersion, ...cfg } = args;
  const { formula: formulaAdapter } = validateUnifiedConfig({
    strategy,
    formula,
    instrument: cfg.instrument,
    timeframe,
  });
  return runHistoricalCore({
    ...cfg,
    formula: formulaAdapter,
    ingestVersion,
  });
}

export { UnifiedBacktestConfigError };