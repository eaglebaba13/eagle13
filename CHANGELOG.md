# Changelog

## v1.0.0 — 2026-07-18

### Included
- Core dashboard with Astro Levels, Gann levels, GTI, and Decision Engine.
- Live Option Chain and Institutional Flow (OI, max pain, GEX).
- Smart Alerts with deterministic engine and persistence.
- Research Lab with anti-leakage walk-forward studies.
- Backtest Lab with deterministic strategy schema and cost model.
- CoinDCX public market-data integration (crypto and tokenized metals).
- Deterministic AI Market Assistant (template narrative, no LLM inference).
- Admin diagnostics: launch readiness, system status, staging validation, research and provider diagnostics.
- Runtime readiness registry and observability ring buffer.
- Responsive layouts across mobile / tablet / desktop.
- Accessibility work on shell, drawers, icon-only buttons, focus order.
- Security hardening: RLS on public tables, server-only imports enforced, bearer-attached server functions, admin routes gated by `has_role`.
- Legal and risk surfaces: `/privacy`, `/terms`, `/risk`, `/release-notes`, `/status`.

### Known limitations
- Research-only platform. No live order execution.
- No broker order routing in v1.0.0.
- CoinDCX integration is market-data only.
- Tokenized metals are not physical spot gold/silver.
- Billing/license activation is manual admin verification.
- Historical backtest results do not guarantee future outcomes.

### Non-goals
- No profitability claims.
- No investment advice.
- No automated payment provider in v1.0.0.
