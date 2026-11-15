# Authentic ticker daily changes

The ticker previously calculated daily changes against fixed previous closes, intraday candle opens, and synthetic nonzero fallbacks. It now prefers supplied nonzero provider deltas and otherwise calculates only against the positive, finite `prev_close` or `ohlc.close` returned by Upstox's `/v2/market-quote/quotes` endpoint. Missing inputs display `-`; a genuine unchanged quote stays zero.

The live EOD API check found that `ohlc.close` equals the current closing price while `net_change` remains authoritative. When a nonzero `net_change` is supplied without `prev_close`, the adapter recovers the authentic baseline as `last_price - net_change`. A supplied `change_percent` is preserved; otherwise this baseline supplies the denominator. This correctly normalizes the observed NIFTY -155.05 (-0.61%), BANK NIFTY -484.40 (-0.79%), and SENSEX -318.56 (-0.39%) quotes.

The documented V3 binary WebSocket schema supplies LTPC rather than literal `net_change` / `change_percent` fields. Binary ticks therefore leave direct deltas unavailable. Optional provider delta metadata is supported end to end without inventing binary fields or deriving a daily baseline from an intraday candle.

The ticker reuses the dashboard's `market-data` query key. The public homepage retains its existing `landingMarketData` key. Both use the same server response, which now includes the already-fetched SENSEX quote. Historical OHLC inputs, protected trading formulas, cache namespaces, Run IDs, and broker execution configuration are unchanged.

## Modified files

| File | Purpose |
| --- | --- |
| `src/components/market/LiveMarketTickerTape.tsx` | Remove fabricated prices, previous closes, changes and analytical rows; use provider deltas or authentic REST baseline; reject mismatched symbols and older stream prices; render missing values neutrally. |
| `src/components/market/LiveMarketTickerTape.test.ts` | Cover real negative deltas, zero/missing data, timestamp precedence and symbol isolation. |
| `src/hooks/use-live-candle-sse.ts` | Preserve optional daily delta metadata in browser state. |
| `src/lib/live-candle-contract.ts` | Validate optional finite daily deltas while accepting older events. |
| `src/lib/live-candle-safety.test.ts` | Verify daily deltas pass safely through SSE parsing and state updates. |
| `src/lib/live-candle-sse.ts` | Forward provider delta metadata in status events. |
| `src/lib/live-market-stream.server.ts` | Forward provider delta metadata in candle events. |
| `src/lib/market.functions.ts` | Add optional authentic daily quote metadata and return SENSEX. |
| `src/lib/market.functions.test.ts` | Verify SENSEX is returned alongside the existing indices. |
| `src/lib/provider-foundation/indstocks/indstocks-ws-types.ts` | Extend the neutral tick type with optional daily deltas. |
| `src/lib/provider-foundation/upstox/upstox-historical.adapter.server.ts` | Parse actual REST delta/previous-close fields; reject invalid prices and baselines. |
| `src/lib/provider-foundation/upstox/upstox-v3-streaming.test.ts` | Verify binary close-price metadata is not passed off as a direct daily delta. |
| `src/lib/provider-foundation/upstox/upstox-ws-adapter.server.ts` | Explicitly mark absent binary daily deltas unavailable. |
| `src/lib/provider-foundation/upstox/upstox.test.ts` | Test direct REST deltas and authentic-close fallback, including unavailable inputs. |
| `src/lib/upstox-quote-mapper.ts` | Share the daily-delta resolver and preserve authentic nullable metadata independently of historical OHLC. |
| `src/lib/upstox-quote-mapper.test.ts` | Test direct-delta priority, genuine zero, invalid baselines and the closed-market historical-candle regression. |
| `src/routes/index.tsx` | Remove fabricated public quote fallbacks and use authentic nullable daily changes for the index cards. |
| `docs/ticker-eod-delta-fix.md` | Explain this bounded change and every modified file. |

## Regression verification

Targeted REST/mapper/response tests: 69 passed. SSE/binary streaming tests: 40 passed. Ticker selection tests: 9 passed.

TypeScript `--noEmit`: passed with zero errors. Production build: passed.

Full suite: 319 files passed, 2 failed; 2,925 tests passed, 1 failed, 8 skipped. One unrelated baseline failure was independently reproduced in the primary checkout: `src/lib/orderflow/smt-divergence.test.ts:147` expects silver's swing price above 45, while the unchanged fixture returns 32.85. The diagnostics HTTP suite also exceeded its 120-second startup hook timeout in this run. No SMT or diagnostics source/test is modified by this fix.

All eight protected formula files were compared byte for byte with the primary workspace and matched. The release was prepared in a separate Git worktree; only its source/test/documentation patch was applied and staged on the primary branch, preserving existing uncommitted streaming work.
