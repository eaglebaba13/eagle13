# SMC Readiness Audit — Phase 21.3c

Read-only audit for future SMC / Baseline / Astro+SMC Hybrid strategy adapters.
No behavior was modified.

## Files found

- `src/lib/smc-types.ts` — shared `Candle`/`Swing` types and `detectSwings`
  (symmetric-window fractal pivot detector, no lookahead).
- `src/lib/market-structure.ts` — HH/HL/LH/LL labelling; BOS / CHoCH / MSS
  events. Events fire only on the candle whose close breaks a *confirmed*
  prior swing.
- `src/lib/liquidity-engine.ts` — equal highs/lows, BSL/SSL pools, sweeps,
  inducements.
- `src/lib/fvg-engine.ts` — 3-candle imbalance detector; fill state walks
  strictly forward from `i + 2`.
- `src/lib/order-block-engine.ts` — active / mitigated / breaker / invalidated
  state machine driven by confirmed structure breaks.
- Vitest suites exist for every engine above.

## Nature of the existing implementation

- Pure, deterministic TypeScript. No PineScript-only paths.
- No dependency on Astro, Signal, Decision, or Risk engines.
- Engines accept `readonly Candle[]` and are side-effect free.
- No consumers in production routes today; engines are dormant.

## Lookahead risks

Absent by construction:

- Swings confirmed `lookback` candles after formation.
- Structure events fire on the candle whose close breaks a confirmed swing.
- FVG fill state derived only from candles `>= i + 2`.
- Order-block state advances candle-by-candle forward.

Guard required in the future adapter: never feed the 09:15 open candle
before the session opens.

## HistoricalStrategyAdapter fit

All four engines compose inside a single `smcStrategyAdapter` that:

1. Consumes a session `Candle[]` (5m / 15m).
2. Runs `analyzeStructure` → `detectLiquidity` → `detectFvg` →
   `detectOrderBlocks` in that order.
3. Emits `HistoricalTrade[]` mapped through the unified schema.

No engine mutation is required to become adapter-ready.

## Data requirements per future mode

| Mode | Required | Optional |
|---|---|---|
| SMC v1 | 5m/15m OHLCV, structure, liquidity, FVG, OB | — |
| SMC + Filters | above | EMA13/50, VWAP, premium/discount, session tags |
| Astro + SMC Hybrid | Astro output, SMC directional output | conflict → WAIT |
| Baseline | EMA13, EMA50, VWAP, S/R, structure break | — |

## Missing components for full SMC mode

- `smc-strategy-adapter.ts` translating engine output to `HistoricalTrade`.
- Session-aware candle slicer (already present as `candle-session-builder`).
- Premium/Discount classifier (trivial helper over last external swing).
- EMA/VWAP filter layer (shared with Baseline).

## Recommendation

SMC infrastructure is adapter-ready. Phase 21.4a will only ADD a strategy
adapter and reuse the shared runner without duplicating historical fetching
or trade schema.