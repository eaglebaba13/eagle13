# Phase 36.3 — Provider Routing Matrix

**Objective.** Upstox is the canonical primary provider for supported Indian live-market data. Yahoo Finance is retained only for explicit historical / commodity / ratio use cases or as a transparent fallback.

**Scope.** Audit-only for most modules; the one behavioural change in this phase is the dashboard `getMarketData` server function, which no longer fires Yahoo NIFTY / BANKNIFTY / INDIA VIX requests in parallel with Upstox. Yahoo is now called strictly on-demand when the Upstox path fails, and the failure reason is surfaced via `providerMetadata`.

No trading formulas, weights, thresholds or Decision Engine inputs were modified.

## Routing matrix

| # | Module | Data | Current | New primary | Fallback | Action | Reason |
|---|---|---|---|---|---|---|---|
| 1 | Dashboard market data (`market.functions.ts`) | NIFTY / BANKNIFTY / VIX live | Upstox+Yahoo parallel | **Upstox** | Yahoo (lazy, tagged) | **Migrated** | Yahoo was eagerly called even when Upstox succeeded — fixed this phase. |
| 2 | Dashboard commodities (`market.functions.ts`) | Gold / Silver spot for ratio | Yahoo (`GC=F`, `SI=F`) | Yahoo | — | **Keep Yahoo** | Upstox instrument master exposes only MCX futures; historical Gold/Silver ratio contract requires Yahoo commodities feed. |
| 3 | Option Chain (`option-chain/upstox-provider.server.ts`) | NIFTY / BANKNIFTY option chain | Upstox `v2/option/chain` | **Upstox** | — | Keep | Canonical live source for PCR + Decision + Terminal (single snapshot shared downstream). |
| 4 | Combined PCR (`combined-pcr.functions.ts`) | Option-chain derived | Upstox chain via (3) | **Upstox** | — | Keep | Uses shared canonical chain from (3). |
| 5 | Decision Intelligence Engine (`decision/live-chain-source.server.ts`) | Option-chain snapshot | Upstox via (3) | **Upstox** | — | Keep | Consumes same shared snapshot as (3)/(4); no independent Yahoo fetch. |
| 6 | Market Breadth (`market-breadth/provider.ts`) | Adv/Dec/sector | Provider-neutral registry | **Upstox** (when a live adapter is registered) | Mock/deterministic | Keep | Registry-driven; no Yahoo call in path. |
| 7 | Option Strategy Terminal (`option-strategy-terminal/*`) | VIX + chain | Upstox VIX + chain | **Upstox** | — | Keep | Reads canonical chain + Upstox VIX quote. |
| 8 | Backtest (`backtest.functions.ts`) | EOD historical (NIFTY) | Yahoo (`?interval=1d`) | Yahoo | — | **Keep Yahoo (historical)** | Historical daily depth; Upstox historical adapter exists but current backtest byte-parity oracle is Yahoo-locked. Migration deferred to a dedicated historical replatform phase. |
| 9 | Market Replay (`replay.functions.ts`, `replay-engine.ts`) | Historical replay | Yahoo | Yahoo | — | **Keep Yahoo (historical)** | Same as (8). |
| 10 | Strategy Analytics (`strategy-validation/*`) | Deterministic snapshot replay | Snapshot files | — | — | Keep | No live provider — replays canonical snapshots. |
| 11 | Astro Levels (`astro.functions.ts`) | NIFTY daily close | Yahoo (`^NSEI` 1d/1mo) | Yahoo | — | Keep (historical) | Last-close only; Yahoo is authoritative for the retained historical contract. |
| 12 | Live Astro (`live-astro.functions.ts`) | Live index quotes (NIFTY, BANK, FINNIFTY, SENSEX) | Yahoo | — | — | **Candidate to migrate — deferred** | Upstox covers NIFTY / BANKNIFTY / SENSEX; FINNIFTY requires instrument-master verification. |
| 13 | Live Levels (`live-levels.functions.ts`) | Live index quotes | Yahoo | — | — | **Candidate to migrate — deferred** | Same as (12). |
| 14 | Gann modules (`gann-intraday*.ts`, gap outlook) | Intraday 5m + daily | Yahoo | Yahoo | — | **Keep Yahoo (historical intraday)** | Migration blocked on Upstox intraday 60-day 5m depth confirmation. |
| 15 | Seasonality (`seasonality.functions.ts`) | 15-year monthly NIFTY | Yahoo (`?range=15y&interval=1mo`) | Yahoo | — | **Keep Yahoo (historical)** | Multi-year monthly is a Yahoo-only contract on this stack. |
| 16 | Insights spark (`insights.functions.ts`) | Spark endpoint | Yahoo `spark` | Yahoo | — | Keep | Historical spark only. |
| 17 | Gold / Silver ratio | Commodity spot | Yahoo | Yahoo | — | Keep (commodities) | See (2). |
| 18 | Readiness / System Status | Provider probes | Reports Upstox + Yahoo | — | — | **Enhanced this phase** | Yahoo/Upstox reported separately in `providerMetadata`; fallback reason now surfaced. |
| 19 | Shadow live controller (`shadow/*`) | Legacy parity oracle | Yahoo | — | — | Deprecated | Kept for parity oracle only; not on any user path. |
| 20 | MCP tools (`mcp/tools/get-market-data.ts`) | Same as (1) | Via `getMarketData` | **Upstox** (indirect) | Yahoo (via (1)) | Keep | Inherits routing from (1). |

## Migrated this phase

- `src/lib/market.functions.ts` — Upstox is called first for NIFTY / BANKNIFTY / INDIA VIX; Yahoo index requests are dispatched only for symbols whose Upstox call failed. `providerMetadata` records `yahoo-fallback (<reason>)` so the active provider, freshness and degraded status are visible in `/status` and every widget consuming `providerMetadata`.

## Retained Yahoo paths (with reason)

Backtest, Market Replay, Astro Levels, Seasonality, Insights spark, Gann intraday, Gold/Silver commodity ratio — historical contracts or markets Upstox does not serve on this integration.

## Duplicates removed

The dashboard was fetching Yahoo NIFTY / BANKNIFTY / VIX in parallel with Upstox on every call. This duplicate request is removed; Yahoo is fetched only when the corresponding Upstox call failed.

## Deferred (candidates for follow-up phases)

- `live-astro.functions.ts` and `live-levels.functions.ts` → Upstox for NIFTY / BANKNIFTY / SENSEX, Yahoo retained for FINNIFTY pending master coverage.
- Gann intraday → migrate once Upstox intraday adapter's 60-day 5m depth is verified.
- Backtest / Market Replay → historical replatform (requires re-baselining the parity oracle).

## Tests

- `src/lib/market.functions.test.ts` (new) — asserts that when Upstox responds for NIFTY / BANKNIFTY / INDIA VIX, `fetchJson` is not called with any Yahoo index URLs (`^NSEI`, `^NSEBANK`, `^INDIAVIX`) and that commodity fallback (`GC=F`, `SI=F`) still runs. `providerMetadata` is asserted to identify Upstox as the active provider.

## Static IP requirement for Upstox

The current Upstox integration uses OAuth 2.0 access tokens issued against the app's registered API key and secret and is called server-side over standard HTTPS. **No static / whitelisted egress IP is required** for this integration mode. Static-IP allow-listing is only relevant to Upstox' Order-Placement API when a broker risk-management profile requires it — this project keeps `LIVE_ORDER_ENABLED=false` and `BROKER_ORDER_EXECUTION_ENABLED=false`, so no such requirement is triggered.

## Results

- Typecheck: PASS (`bunx tsgo --noEmit`).
- Tests: 2182 total, 2182 pass when the previously-flaky `ai-market-assistant/assistant.test.ts` runs in isolation (a pre-existing 5s import timeout under max parallel load — not caused by this phase; re-runs green).
- Build: unchanged surface; no new dependencies.
