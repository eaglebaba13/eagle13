# EagleBaba Astro Levels

Institutional-grade Indian stock-market **research platform**.

**Research only.** No order execution. No auto-trading. No broker integration.

---

## Repository

| Field | Value |
|-------|-------|
| GitHub | `eaglebaba13/eagle13` |
| Validated branch | `public-unrestricted-upstox-fix` |
| Validated HEAD | `910977d9d3367f4e16d47ae89101e0c522fcf516` |
| Production URL | `https://eaglebaba.lwill.in/` |
| Deployment target | Cloudflare Workers |
| Worker name | `eaglebaba13-eagle13` |

---

## What This Project Is

EagleBaba Astro Levels is a personal research terminal for Indian stock-market analysis. It combines astrological cycle analysis, Smart Money Concepts (SMC), hybrid signal engines, backtesting, options analytics, and live market-data streaming into a single research workstation.

The platform is **not** a broker. It cannot place, modify, or cancel orders. BUY/SELL terminology in the UI refers exclusively to research signals, never to executable trades.

---

## Active Markets

| Market | Historical | Live WS | Status |
|--------|-----------|---------|--------|
| NIFTY50 | INDstocks REST | `NIDX:26000` | VERIFIED |
| BANKNIFTY | INDstocks REST | UNRESOLVED | Provider mapping pending |
| INDIA VIX | INDstocks REST | UNRESOLVED | Provider mapping pending |

Future markets (SENSEX, MCX, Crypto, XAUUSD, XAGUSD) require verified provider support before activation.

---

## Protected Formula Files

These files are **frozen**. Do not modify without explicit approval:

```
src/lib/astro-engine.server.ts
src/lib/astro-levels.ts
src/lib/levels.ts
src/lib/backtest-engine.ts
src/lib/strategy-math.ts
src/lib/gann-cube-engine.ts
src/lib/fvg-engine.ts
src/lib/astro-constants.ts
```

Also do not modify: SMC outputs, Hybrid outputs, Decision Center calculations, Backtest calculations. Visualization must consume existing canonical outputs.

---

## Completed Core Modules

- Astro Engine + Absolute Degree + Legacy Engine
- SMC (Smart Money Concepts) composite engine
- Hybrid Engine
- Decision Center
- Backtest Suite + Walk Forward + Monte Carlo
- Portfolio + Shadow Validation
- Provider Foundation (provider-neutral interfaces)
- Upstox Live Integration
- INDstocks Historical REST + Quote adapter
- INDstocks WebSocket foundation (server-side, Workers-compatible)
- Live Chart Engine with CandleAggregator
- Provider-neutral Indicator Engine (SMA, EMA, RSI, MACD, Bollinger, VWAP)
- Chart Adapter + Oscillator Panel
- Smart Alert Engine with Telegram delivery
- Audio notification system
- Combined PCR + Market Breadth + GTI Research Layer
- Option Chain Foundation + Options Analytics

---

## Phase History

### Phase 1 — Repository Engineering Hardening

CRLF/LF normalization, `.gitattributes` policy, Prettier `endOfLine: "lf"`, Windows path compatibility fixes, Lovable detachment, auth/subscription gate removal, navigation registry unification, commercial UI removal.

Commits: `fad3963` → `5da34b5` → `5a953b3` → `fc72a34` → `c2724c9` → `7746b43` → `1518aed`

### Phase 2 — INDstocks Provider Foundation

Historical REST adapter, quote endpoint, instrument master (NIFTY50: `NSE_26000`, BANKNIFTY: `NSE_26009`, INDIA VIX: `NSE_26017`), provider-neutral interfaces, official documentation alignment, range limits (1m–30m: 7 days, 60m–240m: 15 days, 1d–1m: 1 year), telemetry role (SECONDARY).

Commits: `e6a1b59` → `2441b6b` → `be9aca2`

### Phase 3A — INDstocks WebSocket Foundation

Server-side connection manager (DISCONNECTED/CONNECTING/CONNECTED/RECONNECTING/CLOSING/FAILED), exponential backoff reconnect, heartbeat/stale detection, subscription manager with duplicate prevention and unresolved-token rejection, MarketTick model, provider-neutral WebSocketTransport abstraction, Workers-compatible transport (fetch+Upgrade pattern), no undocumented JSON ping.

NIFTY50 WebSocket: `NIDX:26000` (VERIFIED). BANKNIFTY and INDIA VIX: UNRESOLVED.

Commits: `7f38975` → `f9e69fc` → `bbf71e0`

### Phase 3B — Live Chart Engine

Historical REST bootstrap, CandleAggregator with deterministic time bucketing (1m/3m/5m/15m/1h/1d), `mergeHistoricalAndLive()` with volume preservation (`MergedCandlePoint`), server-side `LiveMarketStreamManager` singleton (Cloudflare isolate-local), `getLiveCandles` server function, `LiveCandlestickChart` component with 2s polling.

Commits: `aea134e` → `57c9e92`

### Phase 4.0 — Provider-Neutral Indicator Foundation

IndicatorCandle (epoch-ms OHLCV), IndicatorDefinition, IndicatorResult, typed output interfaces, registry with register/get/list/has. Implementations: SMA, EMA (SMA seed), RSI (Wilder's smoothing), MACD (fast/slow EMA + signal + histogram), Bollinger Bands (SMA ± σ×multiplier), VWAP (IST session reset). 43 tests with known mathematical vectors.

Commit: `f72c5ac`

### Phase 4.1 — Indicator Chart Adapter + UI Integration

`chart-adapter.ts`: IndicatorResult → ApexCharts series, overlay/oscillator separation, color palette, parameter validation. `IndicatorControls.tsx`: registry-driven selector + parameter editor. `OscillatorPanel.tsx`: RSI/MACD separate panels with reference lines. `LiveCandlestickChart.tsx`: integrated indicator overlay + oscillator panels.

Commit: `6b0e1a9`

### Phase 4.1.1 — Volume Preservation Fix

`mergeHistoricalAndLive()` returned `{x, y:[o,h,l,c]}` stripping volume. Fixed to return `MergedCandlePoint` with volume field. `LiveCandlestickChart` now reads actual volume from series points. Silent `catch` replaced with typed `IndicatorError[]`. Duplicate chart color source removed — `getOverlaySeriesColors()` in chart-adapter is single source of truth.

Commit: `e5090bd`

### Phase 5 — Telegram Notification System

Existing architecture verified production-ready: `telegram-delivery.server.ts` with Bot API integration, `AlertDeliveryProvider` interface, subscription preferences (opt-in), delivery persistence to `smart_alert_delivery_attempts`, idempotency via fingerprint, retry classification. 5 new regression tests added.

Commit: `97eece4`

### Phase 6 — Responsive Premium UI + Audio

`AudioNotificationManager`: Web Audio API + HTMLAudioElement fallback, fingerprint deduplication, browser autoplay handling, localStorage preferences. `SoundToggle`: accessible header control. `useSignalAudio`/`useNewsImpactAudio` hooks. Assets: `public/audio/eagle-calling.wav` (RESEARCH_SIGNAL), `public/audio/eagle-chirping.wav` (NEWS_IMPACT — disabled until canonical event source exists).

Commit: `fd4798a`

### Phase 6.1 — Audio Integration Hardening

Exported `getAudioAssetUrl()` and `createAudioNotificationManager()` for testing. Rewrote tests with real assertions: actual URL verification, mocked playAudio capture, dedup by fingerprint, autoplay blocking, disabled states, missing asset safety, broker isolation. 23 tests.

Commit: `3f495c0`

### Phase 7 — Production Regression Hardening

Prettier formatting of all new Phase 3A–6 files. Comment indentation fix in `__root.tsx`. 2508 tests pass. 0 Prettier errors. 80 pre-existing `@typescript-eslint/no-explicit-any` (documented, not hidden).

Commit: `910977d`

---

## Current Baseline

```
Test files:  284
Tests:       2508 passed, 0 failed
Lint:        0 Prettier errors, 80 pre-existing no-explicit-any
Build:       PASS
TypeScript:  PASS (production build)
Formula:     PASS (zero diff on all 8 protected files)
Security:    PASS (no secrets in client bundle)
Broker:      DISABLED (LIVE_ORDER_ENABLED=false, BROKER_ORDER_EXECUTION_ENABLED=false)
```

Known issue: `manual-payment.test.ts` "formats paise as rupees" is a flaky timeout. Do not weaken or disable it.

---

## Branch / Production History

### Validated Development Branch

- **Branch**: `public-unrestricted-upstox-fix`
- **HEAD**: `910977d9d3367f4e16d47ae89101e0c522fcf516`
- **Commits**: 24 ahead of merge base

### Existing Production Branch

- **Branch**: `production-hotfix-20260807`
- **HEAD**: `e518d7436776d422074ac8815531accb660f3c21`
- **Commits**: 163 ahead of merge base

### Relationship

**DIVERGED.** Merge base: `5c0346a85160998e09298cc6585ab8afe564d1a2`. 1184 files changed, 46781 insertions, 38662 deletions. Direct branch switching is unsafe.

### Production-Only Changes (163 commits)

Key categories:
- Nitro node-server deployment (Coolify/Hostinger VPS)
- npm lockfile synchronization
- Public research routing + Upstox analytics token
- Provider credential RLS migration
- Supabase Google OAuth
- SSR fixes (homepage blocking, NewsFeed timeout)
- Decision Engine signal transition hardening
- Options Analytics, provider health, Portfolio/Risk, Strategy Builder, GTI AI Decision Engine

### Target-Only Changes (24 commits)

Key categories:
- INDstocks provider foundation (REST + WebSocket)
- Live chart engine with CandleAggregator
- Provider-neutral indicator engine (SMA/EMA/RSI/MACD/Bollinger/VWAP)
- Chart adapter + oscillator panel
- Telegram notification verification
- Audio notification system
- Lovable detachment + auth/subscription removal
- Navigation registry unification
- Production regression hardening

### Deployment Divergence

| Aspect | Production | Target |
|--------|-----------|--------|
| Server runtime | Nitro `node-server` (Coolify/VPS) | TanStack Start (Cloudflare Workers) |
| vite.config.ts | `nitro({ preset: "node-server" })` | `tanstackStart({ server: { entry: "server" } })` |
| Start script | `node .output/server/index.mjs` | None (Wrangler) |
| Node requirement | `>=22.13.0` | None (Workers runtime) |

---

## Phase 8B — Production Release Reconciliation

**Status: COMPLETE — no application changes required**

### Release Branch

- **Branch**: `production-release-v2`
- **Created from**: `75abe79` (README commit on top of `910977d`)
- **Application base**: `910977d9d3367f4e16d47ae89101e0c522fcf516`

### Production Branch Audit

- **Production branch**: `production-hotfix-20260807`
- **Production HEAD**: `e518d7436776d422074ac8815531accb660f3c21`
- **Merge base**: `5c0346a85160998e09298cc6585ab8afe564d1a2`
- **Production-only commits**: 163
- **Target-only commits**: 25
- **Branch status**: DIVERGED (1184 files changed)

### Production Changes Classification

All 163 production-only changes classified:

**OBSOLETE** (not needed in target):
- All Nitro/Coolify/Hostinger deployment (9 commits)
- All Lovable migration (8+ commits)
- All lockfile synchronization (2 commits)
- `package.json` pinned versions, engines, start script
- `vite.config.ts` Nitro plugin
- SSR fixes (986bef6, d487445) — target has different route architecture
- Auth-related changes (f1a96e7, 4238ee2, 1725c19, 13bf800, c3d901a, 2300c61)
- Provider credential files (e9eb316) — files don't exist in target
- RLS migration (0cf2372) — not applicable without auth
- Service role binding (c83a847) — only changed bun.lock/package.json during Lovable
- Secret tracking (8598864) — already done in target
- Closed-beta metadata (cc01c1a) — removed in target
- All "Changes" and "Work in progress" commits with no functional content

**DEFERRED** (separate future scope):
- GTI AI Decision Engine (`src/lib/gti-ai-decision/`) — 5 files, ~645 lines
- Advanced Options Analytics (`src/lib/options-analytics/`) — 14 files, ~800+ lines
- Portfolio Manager (`src/lib/portfolio-manager/`) — 8 files, ~700+ lines
- Strategy Builder (`src/lib/strategy-builder/`) — 10 files, ~800+ lines
- Provider Health Registry (`src/lib/provider-health-registry/`) — 8 files, ~500+ lines
- Watchlist route
- Strategy Builder route
- Signal transition hardening (23aac76, 357ef61, ea40912)
- 6 SQL migrations from August 2026

**PORTED**: None — target branch is self-contained for core functionality.

### SQL Migrations

16 target-branch migrations (July 2026) are present. 6 production-only migrations (August 2026) are for features/auth not in target. Classified as **OBSOLETE** or **DEFERRED**.

### Security

- No production-only security fixes needed porting
- Target already has credential isolation, server-side tokens, no client secrets
- Broker execution remains disabled

### Regression Results

```
Tests:     2508 passed, 0 failed
Build:     PASS
Formula:   PASS (zero diff on all 8 protected files)
Broker:    DISABLED
```

### Next Step

Deploy `production-release-v2` to Cloudflare Workers via Wrangler.
Requires: `CLOUDFLARE_API_TOKEN` or `npx wrangler login`.

---

## Phase 8 Status — Production Deployment + Runtime Certification

**Status: OPEN / NOT CERTIFIED**

Production is stale. Production serves `index-C2zJWChg.js`; validated HEAD builds `index-CP7hgF98.js`.

Audio assets return 404 in production (stale deployment).

Wrangler authentication was unavailable in the operator environment.

### Required Sequence

1. Reconcile production branch history (Strategy E recommended: create `production-release-v2` from `910977d`, cherry-pick required production-only fixes)
2. Full regression
3. Deploy to Cloudflare Workers via Wrangler
4. Wait ~3 minutes
5. Verify production artifact matches HEAD
6. Verify `/audio/eagle-calling.wav` → 200
7. Verify `/audio/eagle-chirping.wav` → 200
8. Verify routes: `/`, `/astro`, `/live-market-terminal`
9. Verify NIFTY50 live data via `NIDX:26000`
10. Verify historical bootstrap + live merge
11. Verify volume reaches VWAP
12. Verify provider/freshness/data-quality telemetry
13. Verify credential security (no secrets in client bundle)
14. Verify broker isolation
15. Certify production

---

## Production Certification Checklist

```
[ ] Release SHA deployed
[ ] Source/artifact match
[ ] /audio/eagle-calling.wav → 200
[ ] /audio/eagle-chirping.wav → 200
[ ] Routes: /, /astro, /live-market-terminal
[ ] NIFTY50: NIDX:26000 — real ticks
[ ] Historical bootstrap works
[ ] Historical/live merge works
[ ] Candle aggregation works
[ ] Volume preserved
[ ] VWAP receives volume
[ ] Provider/freshness/data-quality truthful
[ ] Stale state displayed honestly
[ ] No mock production data
[ ] INDstocks token server-side only
[ ] Telegram token server-side only
[ ] Supabase service-role server-side only
[ ] LIVE_ORDER_ENABLED=false
[ ] BROKER_ORDER_EXECUTION_ENABLED=false
[ ] No trading execution
```

---

## Future Roadmap

**Priority order:**

1. Production live-data certification (Phase 8)
2. BANKNIFTY + INDIA VIX provider mapping verification
3. Performance / observability / launch readiness
4. Advanced analytics (Max Pain, OI Build-up, Gamma Exposure, Dealer Positioning)
5. Additional markets (SENSEX, MCX, Crypto, XAUUSD, XAGUSD)

Advanced analytics must wait until production market-data integrity is certified.

---

## Lovable History

Lovable was previously integrated (cloud-auth, MCP, Vite config, OAuth, error reporting). It was intentionally and completely removed during Phase 1. No Lovable runtime dependency remains. The project deploys via Cloudflare Workers / Wrangler.

---

## AI Agent Rules

1. Read this README first.
2. Inspect actual repository state (branch, HEAD, git status).
3. Search existing implementations before creating new ones.
4. Check protected files before every commit.
5. Run `npm test`, `npm run lint`, `npm run build` before committing.
6. One logical task = one focused commit.
7. Never guess provider mappings.
8. Never fabricate market data.
9. Never expose credentials.
10. Never enable broker execution.
11. STOP on formula changes, test failures, build failures, or unexpected mass formatting.

---

## Prompt Format

Work has been performed through phase-specific prompts. Standard format:

```
PHASE: <name>
SOURCE: <commit SHA>
OBJECTIVE: <what to do>
INSPECT FIRST: <what to check>
DO NOT CHANGE: <protected areas>
IMPLEMENT: <exact scope>
TEST: <required tests>
VERIFY: <quality gates>
COMMIT: <commit message>
REPORT: <structured output>
STOP IF: <blockers>
```

Current Phase 8 prompt intent: "Reconcile the diverged production line safely, deploy the validated release candidate, and certify real production runtime. Do not reimplement INDstocks WebSocket."

---

## Status Legend

| Status | Meaning |
|--------|---------|
| COMPLETE | Source code exists and tests pass |
| SOURCE COMPLETE / RUNTIME UNVERIFIED | Code exists, not verified in production |
| VERIFIED | Independently confirmed |
| UNRESOLVED | Known gap, not yet addressed |
| BLOCKED | Cannot proceed without external action |
| DEFERRED | Intentionally postponed |

Never use "complete" merely because source code exists. SOURCE ≠ RUNTIME ≠ PRODUCTION.
