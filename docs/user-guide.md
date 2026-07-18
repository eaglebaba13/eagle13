# EagleBABA v1.0.0 — User Guide

## What EagleBABA is
A research and analytics platform for Indian markets. It is **not** an order-execution product — no orders are ever placed from this application.

## Dashboard
Overview of live market data, Astro Levels, Gann levels, GTI signals, and the Decision Engine synthesis. When a provider is stale or unavailable the dashboard displays that state explicitly rather than guessing values.

## Option Chain and Institutional Flow
`/options-chain` shows the live Upstox option chain when available. `/institutional-flow` surfaces OI analysis, max pain, and GEX.

## Research Lab and Backtest Lab
`/research-lab` runs deterministic historical studies. `/backtest-lab` runs deterministic strategy backtests with anti-leakage safeguards. Both are research-only and do not place orders.

## CoinDCX Crypto
`/crypto` streams **public market data only** from CoinDCX. Tokenized metals are not physical spot gold or silver.

## Alerts and AI Market Assistant
`/alerts` is the alert center for smart alerts you configure. `/ai-market-assistant` returns deterministic narrative summaries — there is no LLM inference in v1.0.0.

## Exports and freshness
Where available, exports are provided in CSV/JSON. Every export carries a freshness timestamp; treat any missing timestamp as unavailable.

## Mobile / tablet / desktop
All primary routes are responsive across mobile, tablet, and desktop. Sidebar collapses to an accessible drawer on smaller viewports.

## Research-only disclaimer
Nothing in this application is investment advice. Historical results do not guarantee future outcomes.
