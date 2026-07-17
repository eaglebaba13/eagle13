# Phase 35 — Open Beta Operations Report

**Version:** 1.0.0 (feature freeze)
**Status:** READY_FOR_OPEN_BETA · manual production sign-off pending
**Scope:** Operations only. No new indicators, formulas, provider architecture,
dashboard modules, broker execution, order placement, AI prediction engine, or
major UI redesign was introduced in this phase.

## 1. Bug Triage

All incoming beta bugs are classified with priority (Critical/High/Medium/Low),
status (Open / In Progress / Fixed / Won't Fix / Duplicate), owner, and
resolution. Aggregation is deterministic via `summariseBugs` in
`src/lib/beta-ops`. Any open Critical bug forces the release recommendation to
`HOLD`.

## 2. User Feedback

Feedback is bucketed into UI, Usability, Performance, Understanding, Feature
Request, and Pain Point. `summariseFeedback` returns totals, average rating,
per-category counts, and an approximate NPS. Feature requests are captured for
the 1.1 roadmap only — never implemented during freeze.

## 3. Crash Reporting

`summariseCrashes` classifies events into Unhandled Exception, Provider
Failure, Render Failure, and API Failure. It tracks 24h volume and the top
affected route. A rolling 24h count above 25 triggers a `ROLLBACK`
recommendation.

## 4. Performance

Existing budgets in `src/lib/readiness/performance-audit.ts` remain the source
of truth (server response, route load, TTFD, LCP, INP, hydration, bundle,
backtest, research, portfolio, shadow, export). Beta ops does not redefine
budgets — it consumes and reports.

## 5. Provider Stability

`rateProviderStability` computes error rate per provider (Quote, Historical,
Option Chain, Combined PCR, Breadth, GTI) and classifies HEALTHY (<2%),
DEGRADED (<10%), UNSTABLE (≥10%). Any UNSTABLE provider forces `HOLD`.

## 6. Payment Validation

`validatePayments` reports renewal rate, failure rate, refund rate, and
invoice coverage. Healthy requires failure rate <10%, refund rate <10%, and
invoice coverage ≥90%.

## 7. Customer Support

FAQ, Help Center, Documentation, and Known Issues live under `docs/phase-31`
and are updated as beta findings resolve.

## 8. Version 1.0.1 Scope (Bug + Security + Performance only)

See `V1_0_1_SCOPE` in `src/lib/beta-ops/index.ts`:

- Eliminate remaining hydration warnings
- Tighten provider retry/backoff windows
- Polish empty-state copy across dashboard
- Verify security headers on all edge routes

No feature additions.

## 9. Version 1.1 Roadmap (Planning Only)

Candidate modules, planned but **not implemented**:

- Max Pain
- OI Build-up
- Long Build-up
- Short Build-up
- Gamma Exposure
- Dealer Positioning

## 10. Final Report Shape

`buildBetaReport` composes the deterministic report used by admin dashboards
and returns a recommendation:

- `PROMOTE` — no Critical bugs, healthy payments, no UNSTABLE provider, 24h
  crashes ≤ 25
- `HOLD` — Critical bug open, unhealthy payments, or UNSTABLE provider
- `ROLLBACK` — 24h crash volume above threshold

## Guarantees

- No research formula was modified
- No provider foundation was modified
- No broker path was touched
- No order execution was enabled
- No Run IDs, query keys, or cache namespaces changed