# Parity Oracle Fixtures (Phase 21.3d-parity-α)

This directory holds **deterministic, hand-authored golden envelopes** used by
the parity oracle test suite in `src/lib/parity/`.

## What is locked

- Every top-level and nested field name of `BacktestResult` (Sign-Degree + Legacy) and `HistoryResult` (Absolute Intraday) — see `backtest-golden.ts` and `history-golden.ts`.
- Byte output of every existing exporter (`historyToSummaryCsv`, `historyToJson`, `historyExportFilename`, `exportSummaryCsv`, `exportTradesCsv`, `exportResultJson`, `exportFilename`, plus the inline `/backtest` route CSV composition).
- Public Run-ID hashes for all three formula paths: `computeRunId` from `backtest-engine.ts` (daily astro), `computeRunId` from `gann-formula-compare.ts` (absolute intraday), and `computeUnifiedRunId` from `backtest/run-id.ts`.
- Pure-function behavior of `resolveOutcome`, `pickTargetStop`, `validateCandle`, `expectedTradingSessions`, `hashConfig`, `buildStats` for every trade class (BUY / SELL / WAIT / WIN / LOSS / FLAT / AMBIGUOUS / INVALID_SETUP / INVALID_OHLC / costs+slippage / missing session).

## What is NOT locked in α (documented gaps)

The α suite cannot end-to-end invoke `runBacktest` / `runHistoricalValidation`
because TanStack Start's `createServerFn` client wrapper opens an HTTP call in
client-mode and requires the running server runtime + Start async-local-storage
context. Neither is available inside vitest's node environment without adding a
translation layer — which is exactly what parity-β builds.

The following fields are **shape-locked** (via a hand-authored full-shape
golden literal that must compile against the production types) but not yet
**value-locked against a live end-to-end run**:

- `BacktestResult.trades` populated from actual `replayDay` iterations
- `BacktestResult.equityCurve` / `.monthly` / `.summary` / `.insights` populated from actual daily replays
- `BacktestResult.stats` populated from `buildStats` over real replay output
- `BacktestResult.benchmark` computed from real fetched OHLC
- `BacktestResult.dataQuality` computed from real Yahoo response
- `HistoryResult.sessionsSummary` / `.metrics` / `.attempted` / `.loaded` / `.failed` / `.causalityFailures` populated from actual `simulateSession` runs

β must add a translation layer that lets us feed deterministic fixtures into
the exact production compute pipeline and then diff the emitted envelope
byte-for-byte against the golden literals in this directory.

## Dynamic fields normalized

Only fields that are intentionally dynamic per invocation are normalized to
placeholder values in the golden envelopes:

- `generatedAt` → `"2026-07-15T00:00:00.000Z"` (fixed instant)

No business fields are normalized. Anything else that would differ across runs
is either a static constant or a value we assert exact-equality against.

## Determinism guarantees

- No network access (verified via `expect(fetch).not.toHaveBeenCalled()` in `deterministic-fixtures.test.ts`).
- No dependence on `Date.now()` — every timestamp is either hard-coded or an
  input to the function under test.
- No dependence on the current server time zone — every date string is
  YYYY-MM-DD IST or an explicit ISO instant.
- Snapshot tests use inline `toBe(...)` / `toEqual(...)` — no auto-updating
  external snapshot files.

## Translation requirements for parity-β

The β conversion turns `runBacktest` and `runHistoricalValidation` into thin
wrappers over `runUnifiedBacktest`. To keep the public envelope byte-identical,
β must implement:

1. **`BacktestResult` bidirectional mapper** (`unified.HistoricalBacktestResult` ↔ legacy `BacktestResult`):
   - Reconstruct `insights` (bestNakshatra / worstNakshatra / bestMoonSign / worstMoonSign / bestRetroCombo / worstRetroCombo / mostSuccessfulSignal / mostFailedSignal) from adapter-emitted `metadata.moonSign|moonNakshatra|retroCount|signal`.
   - Reconstruct `executionMeta` block (policy, invalidSetupPolicy, costs, astroAnchor, entryTime, exitAssumption, dataSource, timezone, candleTimeframe) from adapter config + adapter versions.
   - Reconstruct `benchmark` from adapter-emitted first/last OHLC in metadata.
   - Preserve legacy per-trade fields (`time`, `symbol`, `strength`, `confidence`, `pnlPct`, `dayOfWeek`, `month`, `nearest`, `fabricatedLevels`, `astroTs|entryTs|exitTs|dataAvailableTs`, `grossPnl|netPnl|costs`, `high|low`, `targetHit|stopHit`) by copying from `metadata`.
   - Preserve `dataQuality` (expectedSessions / loadedSessions / missingSessions / invalidSessions / coveragePct / dataSource / adjusted).
   - Preserve legacy `runId` (from `backtest-engine.computeRunId`), attach `unifiedRunId` alongside per §7.
   - Preserve legacy cache key namespace `astroCacheKey(...)`.
   - Preserve `summary.profitFactor === 999` sentinel behavior.
   - Preserve `summary.avgHoldingDays === 1` daily default.

2. **`HistoryResult` bidirectional mapper**:
   - Preserve `sessionsSummary` per-session grouping.
   - Preserve `metrics` from `computeCoreMetrics` (never inline this — keep the pure aggregator authoritative).
   - Preserve `attempted` / `loaded` / `failed` counters.
   - Preserve `causalityFailures` counter.
   - Preserve `labeledAs === "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION"` constant.
   - Preserve legacy `runId` (from `gann-formula-compare.computeRunId`) + attach `unifiedRunId`.

3. **No provider re-fetch**: the wrapper MUST reuse the previously-fetched
   Yahoo / snapshot / candle payload — no double-fetch. Prove this in β with a
   `fetchJson` call-count assertion.

If any golden byte in α changes, parity-β is not safe to merge.