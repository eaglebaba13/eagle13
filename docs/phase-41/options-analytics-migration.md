# Phase 41 · Item 3 — Options Analytics Migration Plan

Status: Design landed. Runtime cutover deferred to a dedicated turn.

## Current state

src/lib/options-chain.functions.ts LIVE branch hits nseindia.com directly.
That path is not on the canonical Upstox pipeline, is frequently HTTP 4xx
from Cloudflare edge, and is not covered by assessDataQuality,
OptionChainCapability, or the runtime readiness aggregator.

## Target design

1. Add getOptionsAnalyticsSnapshot(underlying, expiry?) that calls
   fetchCanonicalOptionChain and maps the result into the
   OptionChainSnapshot shape from src/lib/options-analytics.ts.
2. Rewrite getOptionsChain LIVE branch to call the new adapter; keep the
   DEMO branch untouched.
3. Drop NSE_SYMBOLS, parseProvider(NseFullChain, ...), and the
   Referer: nseindia.com request block once the adapter is validated.
4. Route provider label through safeProviderLabel — no raw broker names.

## Why not now

The options-analytics OptionChainSnapshot has fields the canonical model
omits (changePct, bid, ask per leg, source enum). Every consumer of
source === "NSE" must be reviewed before cutover; doing this inside a
mixed Phase 41 patch would balloon the change surface. Migration will
land as a dedicated Phase 41.3 patch with its own regression run.
