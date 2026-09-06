# EagleBaba Astro Levels

Institutional-grade Indian stock-market **research platform**.

**Research only.** No order execution. No auto-trading. No broker integration.

---

## Current Release

| Field | Value |
|-------|-------|
| Repository | `eaglebaba13/eagle13` |
| Release branch | `production-release-v2` |
| Current HEAD | `5f2463580d5acc2d3ead2e0e5e7c509e4191f669` |
| Production URL | `https://eaglebaba.lwill.in/` |
| Last verified deployment | `e62cc28` (Coolify) |
| Deployment platform | Coolify on Hostinger VPS KVM4 |
| Runtime | Node.js + Nitro node-server |
| Start command | `node .output/server/index.mjs` |
| Development workflow | VS Code → Kilo Code → GitHub → Coolify → Hostinger VPS |
| Cloudflare | DNS/CDN/proxy only (NOT application deployment) |

**5f24635 is pushed to GitHub but has NOT been deployed to Coolify.**

---

## Historical Development Baseline

The original validated development work was performed on:

- **Branch**: `public-unrestricted-upstox-fix`
- **Baseline HEAD**: `910977d9d3367f4e16d47ae89101e0c522fcf516`

This branch contains the validated application logic. `production-release-v2` was created from this baseline with deployment-specific configuration (Nitro, Coolify, `.nvmrc`).

---

## What This Project Is

EagleBaba Astro Levels is a personal research terminal for Indian stock-market analysis. It combines astrological cycle analysis, Smart Money Concepts (SMC), hybrid signal engines, backtesting, options analytics, and live market-data streaming into a single research workstation.

The platform is **not** a broker. It cannot place, modify, or cancel orders. BUY/SELL terminology in the UI refers exclusively to research signals, never to executable trades.

---

## Active Markets

| Market | Historical REST | WebSocket | Status |
|--------|----------------|-----------|--------|
| NIFTY50 | `NSE_26000` | `NIDX:26000` | VERIFIED |
| BANKNIFTY | `NSE_26009` | UNRESOLVED | WS mapping pending |
| INDIA VIX | `NSE_26017` | UNRESOLVED | WS mapping pending |

Future markets (SENSEX, MCX, Crypto, XAUUSD, XAGUSD) require verified provider support.

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

Also do not modify: SMC outputs, Hybrid outputs, Decision Center calculations, Backtest calculations.

---

## Current Test Baseline

```
Test files:  284
Tests:       2508 passed, 0 failed
Lint:        0 Prettier errors
Build:       PASS
Formula:     PASS (zero diff on all 8 protected files)
Security:    PASS (no secrets in client bundle)
Broker:      DISABLED
```

Known flaky: `manual-payment.test.ts` "formats paise as rupees" — intermittent timeout.

---

## Authentication Status

`requireSupabaseAuth` is **strict** — it throws when no valid Bearer token is present.

Unauthenticated protected server functions remain protected.

`getRuntimeReadinessReport` is intentionally **public** because its server function does not invoke `requireSupabaseAuth`. This is by design — readiness diagnostics do not require user authentication.

---

## Runtime Readiness Status

Production Runtime Readiness does **NOT** use mock breadth data.

Previous `buildMockBreadthBundle` usage has been removed.

When real breadth data is unavailable:
- Breadth is reported as UNAVAILABLE
- No `RESEARCH_DEMO` evidence is used
- GTI receives null breadth inputs rather than fabricated data

Market Breadth is **not** fully live in production readiness.

---

## Browser Visual Verification

**NOT VERIFIED.**

UI component/source hardening has been performed (Phase 9), but browser visual verification has not been completed.

| Aspect | Status |
|--------|--------|
| UI component hardening | PARTIAL (CSS tokens, responsive rules) |
| Browser visual acceptance | NOT VERIFIED |
| Mobile browser | NOT VERIFIED |
| Tablet browser | NOT VERIFIED |
| Desktop browser | NOT VERIFIED |
| Theme browser verification | NOT VERIFIED |
| Chart browser verification | NOT VERIFIED |

---

## Broker / Order Execution

Research-only platform. The following are permanently disabled:

- No broker execution
- No order placement
- No BUY/SELL execution
- No auto-trading
- No GTT
- No order modification/cancellation

`LIVE_ORDER_ENABLED=false`
`BROKER_ORDER_EXECUTION_ENABLED=false`

---

## Production Data Integrity

No mock market data may be silently used in production.

Research/demo fixtures may exist for tests but must never be represented as production evidence.

---

## Completed Modules

- Astro Engine + Absolute Degree + Legacy Engine
- SMC (Smart Money Concepts) composite engine
- Hybrid Engine
- Decision Center
- Backtest Suite + Walk Forward + Monte Carlo
- Portfolio + Shadow Validation
- Provider Foundation (provider-neutral interfaces)
- Upstox Live Integration
- INDstocks Historical REST + Quote adapter
- INDstocks WebSocket foundation (server-side)
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

CRLF/LF normalization, `.gitattributes` policy, Prettier, Windows path fixes, Lovable detachment, auth/subscription gate removal, navigation registry unification, commercial UI removal.

### Phase 2 — INDstocks Provider Foundation

Historical REST adapter, quote endpoint, instrument master, range limits (1m–30m: 7 days, 60m–240m: 15 days, 1d–1m: 1 year), telemetry role (SECONDARY).

### Phase 3A — INDstocks WebSocket Foundation

Server-side connection manager, exponential backoff, heartbeat/stale detection, subscription manager, MarketTick model, Workers-compatible transport (fetch+Upgrade pattern).

### Phase 3B — Live Chart Engine

Historical REST bootstrap, CandleAggregator, `mergeHistoricalAndLive()` with volume preservation, `LiveMarketStreamManager`, `LiveCandlestickChart`.

### Phase 4.0 — Provider-Neutral Indicator Foundation

SMA, EMA, RSI, MACD, Bollinger Bands, VWAP. Registry, typed outputs, 43 tests.

### Phase 4.1 — Indicator Chart Adapter + UI Integration

chart-adapter.ts, IndicatorControls, OscillatorPanel, LiveCandlestickChart integration.

### Phase 4.1.1 — Volume Preservation Fix

`mergeHistoricalAndLive()` returns `MergedCandlePoint` with volume. VWAP receives actual volume.

### Phase 5 — Telegram Notification System

`telegram-delivery.server.ts` with Bot API, delivery persistence, idempotency, retry classification.

### Phase 6 — Responsive Premium UI + Audio

AudioNotificationManager, SoundToggle, `eagle-calling.wav` (research signals), `eagle-chirping.wav` (news impact — disabled until canonical event source exists).

### Phase 7 — Production Regression Hardening

Prettier formatting,2508 tests, 0 Prettier errors.

### Phase 8 — Production Deployment

Coolify on Hostinger VPS KVM4. Nitro node-server. `.nvmrc` = 22. Nixpacks configuration.

### Phase 8B — Production Release Reconciliation

`production-release-v2` branch created.163 production-only commits classified as OBSOLETE/DEFERRED/PORTED.

### Phase 8C — Coolify Deployment

`nixpacks.toml` added. `.nvmrc` added. Deployment verified for commit `e62cc28`.

### Phase 9 — UI/UX Hardening

Market semantic tokens added. Light theme card/table overrides. Responsive mobile/tablet CSS. Auth middleware corrected. Runtime Readiness mock data removed.

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

## Status Legend

| Status | Meaning |
|--------|---------|
| VERIFIED | Independently confirmed with evidence |
| UNRESOLVED | Known gap, not yet addressed |
| BLOCKED | Cannot proceed without external action |
| DEFERRED | Intentionally postponed |
| NOT VERIFIED | No evidence available |

Never use "complete" merely because source code exists. SOURCE ≠ RUNTIME ≠ PRODUCTION.
