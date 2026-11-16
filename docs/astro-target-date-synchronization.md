# Astro Target Date market-data synchronization

## Behavior

`/astro` now requests a 90-calendar-day daily-candle window ending at a historical Target Date. It normalizes dates to IST, removes invalid/out-of-window candles, sorts sessions, and uses the final session on or before the selected date for spot/Star Day High/Low. The strictly preceding session supplies Prev Close/High/Low. Existing EMA (13), RSI (14), planetary and trading formulas are unchanged; daily indicators use only candles through the target session.

Today uses a live Upstox quote and T-1 session anchor. Future projections use the latest available quote/EOD and most recently completed session (including today's EOD after 15:30 IST when available). A positive finite manual Prev Close is accepted only for today/future dates. The UI scopes the override to the selected symbol/date, clears it on changes, and provides Reset Auto. The query key is `['eaglebaba-navagraha-cube', symbol, selectedDate, customPrevClose]`; the server retains the `eaglebaba-astro` cache namespace. Broker execution and Run IDs are unchanged.

The requested V2 daily endpoint is used first, with V3 daily fallback. See [Upstox historical candles](https://upstox.com/developer/api-documentation/get-historical-candle-data/) and [V3 daily history coverage](https://upstox.com/developer/api-documentation/announcements/enhanced-historical-candle-data-apis-v3/). Historical-data failure produces an error instead of fabricated/current-price anchors. Live quote failure retains authentic available daily EOD candles. India VIX behavior is unchanged and explicitly labeled Live Context for historical views.

## Authentic provider verification

On 16 Nov 2026, the production service's existing provider credentials returned HTTP 200 and 63 candles for each index for 21 Jul through 19 Oct 2024. No credentials are included in fixtures or reports.

| Symbol | Selected date | Target session | Session close | Strict previous session | Previous close |
| --- | --- | --- | --- | --- | --- |
| NIFTY | 2024-10-19 | 2024-10-18 | 24,854.05 | 2024-10-17 | 24,749.85 |
| BANKNIFTY | 2024-10-19 | 2024-10-18 | 52,094.20 | 2024-10-17 | 51,288.80 |

The previous-close session is Thursday 17 Oct, because Saturday's selected target resolves to Friday 18 Oct. Indicators use the 90-day warm-up window and the existing SMA-seeded EMA and Wilder RSI implementations; they do not use later candles. Older-year coverage is exercised with a clearly shifted test dataset, not represented as an authentic 2010 quote.

## Modified files

- `src/lib/ht-gann-intra.functions.ts`: replace the rolling Yahoo/hardcoded fallback index path with bounded Upstox history, strict session selection, daily indicators and live/future quote handling; validate overrides and return session metadata; supply the target session's high/low to Starwise.
- `src/routes/astro.tsx`: reactive symbol/date/override query key, exact session labels, inline Prev Close editing/reset, accessible date input and historical audio suppression.
- `src/lib/astro/ht-gann-intra-v2.test.ts`: retain the mathematical tests and add provider/handler regressions for both indices, all 36 levels, weekend/holiday/no-look-ahead behavior, indicators, live/future anchors, overrides, old-year endpoint construction and unavailable data.
- `src/lib/astro/ht-gann-daily-oct-2024.fixture.json`: authentic 63-session Upstox daily histories for both indices, containing market candles only.
- `docs/astro-target-date-synchronization.md`: scope, data evidence, file explanations, validation and release record.

## Validation and release

- Targeted suite: 22 tests passed.
- Full `npm test`: 321 files and 2,953 tests passed.
- `npx tsc --noEmit`: passed with zero errors.
- `npm run build`: passed; existing dependency/deprecation/browser-externalization warnings remain.
- All eight protected mathematical files: SHA-256 hashes match the pre-change snapshots; Git reports no changes to them. The V2 matrix formula module is also unchanged.
- `git diff --check`: passed.
- Interactive browser verification was unavailable (no connected browser). A local Vite development smoke attempt timed out during its module transport startup; the production build succeeded. Production HTTP/server checks are performed through the existing Coolify deployment on `root@200.234.35.116` after push.

Local provider snapshots, baseline hashes and check logs are stored under ignored `backups/astro-target-date-*` paths. The full suite rewrote four unrelated config files; their diffs were backed up and excluded from the release commit. After automatic approval review initially blocked restoration, the user explicitly approved restoring these files; all four are restored and the working tree is clean.


## Production rollout verification

- Application commit: `b5c251d12a150426832665654f107ed4e5f9babd`, pushed to `origin/production-release-v2`.
- Canonical VPS: `root@200.234.35.116`; existing Coolify application `zrrxmyubwxrhfowlnmfztutk` (`eaglebaba`).
- Deployment: `b7430158-4966-4d43-a94a-d42a3ef5d193`; new container healthy on the application commit.
- Public `https://eaglebaba.lwill.in/astro`: HTTP 200.
- Actual production TanStack RPC checks passed for both symbols: the historical session dates, previous closes, spot closes, EMA/RSI and all 36 levels match the fixture evidence above. Changing to 16 Oct recalculates the matrix; historical manual overrides are ignored.
- Actual production live override: NIFTY Prev Close set to 26,000; omitting the override returns the authentic automatic anchor (25,144.30 in this verification). Broker execution remains disabled.
- Explicit `cmd.exe` build rerun completed with exit code 0, resolving PowerShell stderr-warning exit ambiguity.
- This documentation follow-up records the completed rollout; it changes no application source or runtime behavior.
