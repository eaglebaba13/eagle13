# Phase 34 · Version 1.0 Launch Freeze

**Version**: 1.0.0
**Channel**: launch-candidate
**Formula version**: `EAGLEBABA_ASTRO_V1_1` (unchanged)
**Provider stack**: Upstox (primary) · Yahoo (fallback)

## UX Improvements

- Unified production-facing copy via `src/lib/ux-copy/`. Legacy strings
  ("Missing", "Unavailable", "Not Available") are humanised into
  Loading / Waiting for provider / Provider partial / Provider degraded /
  Provider temporarily unavailable / Coming soon.
- Compact `ProviderHealthBar` component with per-subsystem dots and a
  green/yellow/red rollup rendered as a single accessible pill.
- Skeleton-loader signalling standardised via `humaniseStatus().showSkeleton`.
- Retry hinting standardised via `humaniseStatus().retryable`.

## Feature-flagged Hides

`legacy-global-markets` widget is now gated on `dashboard.global-markets`
and hidden by default until a verified provider is wired. No widget was
deleted. MCX / Crypto / XAUUSD / XAGUSD are not present in the registry;
the flag pattern is documented for future modules.

## Version & Changelog

`src/lib/release-notes/` exposes `PLATFORM_VERSION`, `versionInfo()` and
`RELEASE_HISTORY`. Consumers render a "What's New" surface directly from
this registry — no runtime mutation.

## Immutability Guarantees (still enforced)

- No research formulas changed (Astro / SMC / Hybrid / Decision / PCR /
  Breadth / GTI / Backtest / Portfolio).
- No provider paths changed; no duplicate provider requests introduced.
- Broker execution remains disabled. No order path activated.
- No Run ID / query key / cache namespace changes.

## Quality Gates

- TypeScript: clean.
- Vitest: existing suites unchanged; Phase 34 modules add unit tests.
- ESLint: clean on new modules.
- Production build: unchanged surface, only additive UX primitives.

## Launch Freeze Checklist

| Item | Status |
|------|--------|
| Research formulas immutable | PASS |
| Provider paths immutable | PASS |
| Broker execution disabled | PASS |
| Legacy status wording humanised | PASS |
| Unverified widgets flag-gated | PASS |
| Provider health surface | PASS |
| Version + changelog surface | PASS |
| UX copy unit tests | PASS |
| Release notes unit tests | PASS |
| Manual production sign-off required for public promotion | PENDING (human) |

**Feature freeze declared for Version 1.0.** Future changes belong in
`1.0.x` (bugfix) or `1.1.0+` (additive).