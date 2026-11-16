# Live Chart continuity, viewport and drawing repair

## Scope

This change repairs `/live-chart` market-data transport and chart interaction. The eight protected mathematical baseline files and the trading formula modules are unchanged. Existing cache namespaces, drawing-storage keys and Run IDs are preserved. Broker execution remains disabled.

## Root causes and resulting behavior

- The bootstrap effect depended on the latest LTP, repeatedly requesting/reloading history. It now runs on selection and connection transitions, with in-flight request coalescing and explicit fresh snapshots on reconnect.
- The page discarded prior sessions and capped some instruments at 120 bars. Those display filters are removed. REST history, finalized SSE bars and the current partial bar merge without losing the authentic bar open or high/low.
- Repeated full-series loads replaced the canvas dataset. A synchronizer now seeds each selection once, updates changed/finalized bars in place, and retains existing indices while reconnect history appends. Initial history load and explicit replay/selection changes are the dataset-reset boundaries. No live update calls fitContent or sets a visible range.
- Indian live buckets and historical aggregation now share the 09:15 session anchor, IST daily boundaries and Monday weekly boundaries. Crypto/COMEX UTC bucketing remains separate.
- The right price scale uses visible candle auto-scaling; VWAP does not contribute to price scaling. Manual pan/zoom is retained; the explicit Scroll to Real-Time control returns to live following. Volume/VWAP visibility changes do not reload candle data. VWAP uses the existing session-reset indicator implementation and actual volume.
- Drawings store logical coordinates and canonical time anchors. Saved anchors rebase when history rolls or timeframes change; legacy time-only drawings continue to load. Pointer capture supports click-move-click and drag release, with cancellation, live previews, selection, body dragging, endpoint dragging and Delete/Backspace/floating deletion. Risk/reward drawings include editable target/stop points and live percentages; ruler drawings show bar count.

## Provider retrieval

The Upstox adapter fetches completed-session history plus today's one-minute intraday endpoint, then deduplicates and aggregates before retaining up to 500 actual bars. The lookback depends on timeframe; minute/30-minute requests are chunked inside the documented monthly/quarterly limits. Daily/weekly histories also stitch today's intraday activity into the current bar. Limited provider history produces a warning rather than fabricated candles.

Primary references: [Upstox V3 history limits](https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/), [Upstox current-day intraday data](https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data/), [Lightweight Charts incremental updates](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ISeriesApi).

## Modified files

| File | Purpose |
| --- | --- |
| `src/routes/live-chart.tsx` | Preserve multi-session history; refresh only on selection/connection transitions; merge partial bars; expose history readiness and provider warnings; constrain page width. |
| `src/components/chart/TradingViewLightweightChart.tsx` | Keep one chart instance; incremental data synchronization; visible-candle scaling; real-time return; logical drawing gestures/previews/editing and safe keyboard handling. |
| `src/lib/chart/live-series.ts` | Testable candle/volume/VWAP synchronizer and REST/live merge; retain earlier indices on reconnect. |
| `src/lib/chart/drawing-types.ts` | Backward-compatible logical/time anchors, coordinate rebasing and complete drawing creation. |
| `src/hooks/use-live-candle-sse.ts` | Preserve completed-map identity on live ticks and reject stale/resurrected candle updates. |
| `src/lib/provider-foundation/indstocks/candle-aggregator.ts` | Shared deterministic session buckets and non-destructive REST/SSE OHLC merging. |
| `src/lib/provider-foundation/upstox/upstox-historical-deep.server.ts` | Authenticated V3 chunking, current-day stitching, lookbacks, request coalescing and partial-history warnings. |
| `src/lib/live-candle-stream.functions.ts` | Optional fresh bootstrap snapshots; truthful connection/freshness/error metadata. |
| `src/lib/chart/live-series.test.ts` | Incremental update call counts, merging, volume integrity, reconnect index retention, logical anchors and all drawing types. |
| `src/lib/provider-foundation/upstox/upstox-historical-deep.test.ts` | All nine timeframes, current-day continuity, bounded retrieval, coalescing/cache refresh and incomplete-history behavior. |
| `src/lib/live-chart-streaming-layout.test.ts` | SSE history-map stability, finalization and stale-status regressions. |
| `docs/live-chart-continuity-repair.md` | Scope, evidence, changed-file explanations, validation and release limitations. |

## Verification

The authenticated production provider preflight returned HTTP 200 for both NIFTY50 and BANKNIFTY: 1,500 previous-session one-minute candles (9–13 Nov 2026), plus all 85 current-day bars from 09:15 through 10:39 IST on 16 Nov 2026. These are actual provider observations, separate from generated deterministic unit-test inputs.

- Targeted chart/data suite: 87 tests passed before the final reconnect-cache regression was added; the final full suite includes that additional case.
- `npm test -- --maxWorkers=2`: 323 files and 2,985 tests passed, exit 0.
- A preceding parallel run timed out in the unchanged smart-alert engine test. Its isolated recheck passed all 5 tests, and the bounded-worker full rerun passed all tests without changing test timeouts or skipping cases.
- `npx tsc --noEmit`: zero errors, exit 0.
- `npm run build`: exit 0. Built output was checked for the final connection-key and forced-refresh behavior. Existing dependency/deprecation/browser-externalization warnings remain.
- All eight protected baseline files: pre/post SHA-256 hashes match; no protected source diff.
- `git diff --check`: passed.
- Production's existing SSE endpoint emitted actual CONNECTED/LIVE candle-update events for both NIFTY50 and BANKNIFTY during market hours. Post-rollout bootstrap checks are recorded separately after deployment.

Browser interaction verification is unavailable: the connected-browser inventory is empty and both Chrome/in-app browser surfaces are unavailable. Pointer behavior is implemented and supporting logic is covered by regressions, but no visual live-market gesture sign-off is claimed. Other instruments retain their existing provider adapters; this release does not certify every provider or promise equivalence with every broker terminal.

Ignored `backups/live-chart-*` artifacts retain protected-file hashes, configuration snapshots, test/build logs and production provider/release evidence. Test-written configuration changes are excluded from the release and restored to the pre-test snapshot.
