# Authentic calculator overlays and live-chart layout repair

## Behavior

`/live-chart` now uses the existing `getLtpCalculatorData` engine through `ltpCalculatorQuery`. The current RPC accepts `underlying`/`expiry` and returns `data.reversalLevels` plus `data.coaScenario`; the brief's flat price fields and `symbol`/`mode`/`strikeDepth` input shape are not the current API. Strike depth remains an option-table display setting and does not recreate reversal prices.

The chart copies EOS, EOR, distinct S-Moderate/R-Moderate levels, Max Pain SL and Max Gain Target directly from the returned numbers. Strike labels come from the same response. F&O stock P2/P1/C1/C2 lines use the existing `getStockFourLineData` engine. No chart ATM-premium fallback remains. Missing data produces an unavailable/loading state instead of fabricated levels.

Both calculator-page modes and chart overlays share their respective query helpers with 15-second refresh. The original `['ltp-calculator', underlying, expiry]` query namespace is preserved. Server responses are coalesced/cached for 15 seconds per symbol/expiry, with no stale-while-revalidate window, so concurrent callers consume one snapshot. Exact parity means the same underlying, expiry and snapshot; independent snapshots may change as the market moves. Existing engine provider/fallback policies and formulas are unchanged.

The COA HUD below OHLC displays the engine scenario, shifting states, dominant strikes, EOS/EOR/SL and its recommendation text, with provider metadata and refresh-failure state. Price labels retain two decimal places, and stable line IDs let strike-label changes update existing lines without resetting the chart.

Indian intraday candles outside 09:15–15:30 IST are rejected before server aggregation and at the client history/SSE merge. Actual previous sessions remain available. Daily/weekly midnight candles and 24/7/COMEX timestamps are preserved. The server's redundant final-price mutation was removed; no spot/EOD anchor is inserted.

Watchlist visibility now follows one toggle on every breakpoint, including an explicit desktop close button. The footer wraps with horizontal overflow protection; the date popover is portaled outside that clipping container. The canvas can shrink with the available height. The HUD lives inside the chart pane so an open watchlist does not cover it.

## Modified files

| File | Purpose |
| --- | --- |
| `src/routes/live-chart.tsx` | Replace ATM arithmetic with shared calculator queries; attach COA HUD; reject out-of-session bars; repair watchlist/footer/popover layout. |
| `src/routes/_authenticated/options-chain.tsx` | Use the same polling query helpers in live/static and stock modes; derive data directly from the active query; reset expiry on underlying change. |
| `src/components/chart/ChartHeaderHud.tsx` | Render compact responsive COA scenario/levels/rule and precise currency values. |
| `src/components/chart/TradingViewLightweightChart.tsx` | Stable LTP line IDs, two-decimal price formatting and shrinkable canvas height. |
| `src/lib/chart/ltp-overlay.ts` | Presentation-only symbol alias and exact engine-to-chart line mapping; no price formulas. |
| `src/lib/options/ltp-calculator.functions.ts` | Share short-lived engine snapshots; add a shared stock query helper while preserving RPC inputs and existing query keys. |
| `src/lib/provider-foundation/indstocks/candle-aggregator.ts` | Shared regular-session timestamp predicate; existing bucketing behavior preserved. |
| `src/lib/provider-foundation/upstox/upstox-historical-deep.server.ts` | Reject orphan pre-open bars before aggregation; remove redundant final-price rewriting. |
| `src/lib/chart/ltp-overlay.test.ts` | Verify exact paisa/strike mapping, missing/duplicate levels, stock lines, actual HUD markup and session boundaries. |
| `src/lib/options/ltp-calculator.functions.test.ts` | Verify snapshot coalescing, refresh, symbol/expiry isolation and shared stock-query results at mocked provider boundaries. |
| `src/lib/provider-foundation/upstox/upstox-historical-deep.test.ts` | Verify midnight/pre-open artifacts cannot contaminate intraday aggregation. |
| `docs/ltp-overlay-engine-parity.md` | Record scope, file explanations, test/deployment evidence and verification limits. |

## Verification evidence

Targeted suite: 62 tests passed. Production provider preflight on 16 Nov 2026 returned `UPSTOX / OK`: NIFTY EOS 25,135.25, EOR 25,374.05, SL 25,101.90, COA #7; BANKNIFTY EOS 60,277.40, EOR 62,323.60, SL 59,867.70, COA #8. These are observed live snapshots, not hardcoded expectations for later times.

Final local checks: `npm test -- --maxWorkers=2` passed all 325 files / 3,001 tests (exit 0); `npx tsc --noEmit` passed with zero errors (exit 0); `npm run build` passed (exit 0). Existing dependency/deprecation/browser-externalization build warnings remain. All eight protected baseline SHA-256 hashes match; the calculator engine's own SHA-256 hash also matches. `git diff --check` passed. All four test-written configuration files were backed up and restored using the user's existing approval. Production rollout results are recorded separately after deployment. Ignored `backups/ltp-overlay-*` files retain check logs and provider/release evidence. The eight protected baseline files and the calculator engine itself are verified against pre-change hashes. Test-written configuration changes are excluded and restored.

No connected browser is available (inventory checked this turn). Automated engine/RPC/HUD-markup checks do not constitute visual browser sign-off for watchlist/footer interactions. `/options-chain` retains its existing authentication gate; no login or security protection is changed for verification.
