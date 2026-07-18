# Phase 3F — CoinDCX Multi-Asset Market Data Integration

**Status:** Complete · Market-data only · No trading execution

## Objectives Achieved

- Wired CoinDCX as a canonical multi-asset market-data provider.
- Delivered live 24×7 crypto data for BTC, ETH, SOL, XRP.
- Discovered and surfaced tokenized metal instruments (PAXG, XAUT, KAG) as **reference-only** data. These do NOT feed the Gold/Silver trading formulas.

## Security Guarantees

- **Hard execution guard.** `COINDCX_TRADING_ENABLED` is a compile-time `false`. `assertNoExecution()` and `assertExecutionGuardIntact()` fail loudly if any code path attempts trading.
- **Public endpoints only.** All URLs are allowlisted in `src/lib/providers/coindcx/endpoints.ts`. `assertAllowlistedEndpoint()` runs on every fetch. No private, order, wallet, or account endpoints are referenced anywhere in the codebase.
- **No credentials.** The provider does not read or accept any API key, secret, signature, or nonce. There is no ability to sign or authenticate a request.
- **Rate limit safety.** Server-side caches: 15 min for market discovery, 10 s for all-tickers. Per-request timeout 8 s with `AbortController`.

## Architecture

```
src/lib/providers/coindcx/
├── endpoints.ts          # Allowlisted public URLs + timeframe map
├── types.ts              # Market/ticker/candle/meta types
├── symbols.ts            # Crypto major & tokenized-metal classification
├── market-discovery.ts   # Pure parser for markets_details
├── ticker.ts             # Pure ticker normalizer
├── candles.ts            # Pure candles normalizer
├── freshness.ts          # 24×7 freshness classifier
├── execution-guard.ts    # Compile-time trading guard
├── diagnostics.ts        # Diagnostics report builder
├── coindcx.server.ts     # Server-only fetch + cache layer
├── coindcx.functions.ts  # createServerFn RPCs
└── coindcx.test.ts       # Unit tests
```

## User Surfaces

- `/crypto` — public list of crypto majors + tokenized metals with 24h ticker data.
- `/crypto/$pair` — pair detail view with configurable candle interval (1m/5m/15m/1h/1d).
- `/admin/coindcx` — admin-only diagnostics (execution guard status, discovered counts, allowlisted endpoints).

## Runtime Readiness

A new `COINDCX_MARKET_DATA` module is registered in `runtime-evidence.ts` and evaluated by `build-report.ts`. The evidence hard-blocks readiness if the trading flag is ever tripped.

## Constraint Check

- No trading formulas modified.
- No existing provider paths altered.
- Gold/Silver canonical instruments remain unchanged — tokenized-metal discovery is reference-only.
- No secrets added; no environment variables required.
