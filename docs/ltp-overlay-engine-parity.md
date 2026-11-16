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


## Production rollout verification

- Application commit: `33b6aa27e07902e4156a042e24ebc5d55cf7576f`, pushed to `origin/production-release-v2`.
- Canonical VPS: `root@200.234.35.116`; existing Coolify application `zrrxmyubwxrhfowlnmfztutk`.
- Deployment ID: `270c4c92-b6dd-4b15-97b2-039514dac47c`; the new application container is healthy.
- At 12:09 IST on 16 Nov 2026, concurrent calculator/chart RPC requests returned identical complete reversal-level and COA objects with identical timestamps. The actual deployed presentation mapper and HUD source were transpiled/rendered on the VPS and checked against those same responses.

| Underlying | Expiry | EOS | EOR | Max Pain SL | Max Gain TP | COA |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| NIFTY | 2026-11-17 | 25,140.85 | 25,382.85 | 25,106.00 | 25,382.85 | #2 |
| BANKNIFTY | 2026-11-23 | 60,289.55 | 62,363.75 | 59,873.90 | 62,363.75 | #8 |

- Both observed index responses reported `UPSTOX / OK`. These numbers are verification-time observations, not fixed future values.
- RELIANCE's calculator and chart stock RPC results matched exactly for P2/P1/C1/C2.
- Both indices retained 500 valid candles in each tested 1m/5m/1h/4h/1D bootstrap. Indian intraday timestamps passed the shared session filter; daily candles were preserved.
- Public `/live-chart` and `/options-chain` HTTP responses were 200. No authentication configuration was changed; an HTTP/SSR check does not establish an authenticated interactive browser session.
- Broker execution remained disabled. The previous healthy `f3e633f` application image is the rollback reference.
- Visual desktop/mobile watchlist/footer verification remains unavailable without a connected browser. The successful RPC, deployed-source mapping and HUD-markup checks do not claim browser screenshots or visual sign-off.
- This documentation follow-up changes no application runtime code.


## WTB / WTT plotting extension

The LTP overlay now also plots each engine-flagged PE support / CE resistance challenger at its exact `StrikeDominance.reversalPrice`. WTT is cyan and WTB is rose; both use two-pixel dashed lines. Chart titles include direction, side and strike. The COA HUD lists the same reversal prices and the engine's Volume/OI percentages.

Flags `isWttVol`, `isWttOi`, `isWtbVol` and `isWtbOi` are authoritative. No thresholds, strikes, premiums or prices are recalculated in the chart. Volume and OI flags for the same strike/direction share one line; opposed directions stay separate. Missing/invalid reversal prices are omitted, with no strike-price substitute. If no flags are active, the HUD states that no challenger levels are active.

These levels follow the existing LTP toggle and 15-second shared snapshot refresh. Stock four-line prices remain in place and can include shifting levels from the already-fetched calculator snapshot. Existing candle-only auto-scaling and user viewport behavior remain unchanged.

Extension files:
- `src/lib/chart/ltp-overlay.ts`: map flagged engine rows into stable, labelled lines and combine shared Volume/OI factors.
- `src/routes/live-chart.tsx`: retain calculator flags alongside stock four-line results.
- `src/components/chart/TradingViewLightweightChart.tsx`: accept optional line width for distinct shifting-level rendering.
- `src/components/chart/ChartHeaderHud.tsx`: display active WTB/WTT prices and factor detail, or an explicit inactive state.
- `src/lib/chart/ltp-overlay.test.ts`: verify exact PE/CE prices, combined/opposed flags, stable IDs, invalid prices, stock coexistence and actual HUD markup.
- `docs/ltp-overlay-engine-parity.md`: document this bounded presentation extension and its checks.

Extension validation: targeted suite passed 32 tests; `npm test -- --maxWorkers=2` passed all 325 files / 3,006 tests; TypeScript passed with zero errors; the production build exited 0; `git diff --check` passed. All eight protected-file hashes and the calculator-engine hash match their pre-change snapshots. Test-written config changes were backed up and restored under the existing user approval. Runtime rollout results follow below.
