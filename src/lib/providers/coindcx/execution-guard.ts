// Phase 3F — Hard execution guard.
//
// CoinDCX integration is **market-data only**. Trading endpoints require
// authenticated private API access that this adapter does not implement.
// This file exists so any accidental import path that tries to place an
// order fails loudly at build/test time.

export const COINDCX_TRADING_ENABLED = false;

export function assertNoExecution(operation: string): never {
  throw new Error(
    `COINDCX_TRADING_DISABLED: refusing "${operation}". CoinDCX is wired as a market-data provider only.`,
  );
}

export function assertExecutionGuardIntact(flag: boolean = COINDCX_TRADING_ENABLED): void {
  if (flag !== false) {
    throw new Error("COINDCX_EXECUTION_GUARD_TRIPPED");
  }
}
