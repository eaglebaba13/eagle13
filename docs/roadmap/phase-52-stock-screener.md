# Roadmap — Phase 52: Stock Screener Foundation

Status: Planned. Not scheduled. Feature-frozen behind current sprint.

## Scope (planned)

- Universe: NIFTY 500 constituents via Upstox instrument master.
- Screener criteria: price/volume, delivery %, OI change, F&O ban list,
  52-week range distance, sector filters.
- Deterministic scoring only — no LLM narratives.
- Runs entirely off the canonical provider pipeline; no NSE / Yahoo.

## Blockers before implementation

1. Phase 41 must land in full (canonical readiness, Options Analytics on
   Upstox, BANKNIFTY diagnostics, Decision confidence semantics).
2. Instrument-master ingestion must be productionised.
3. Data-quality report from assessDataQuality must be reused for
   per-symbol filtering.

## Non-goals

- Real-time streaming (batch/refresh only in v1).
- Custom user formulas (canned criteria only).
- Any trading formula or decision-engine change — Screener consumes,
  never mutates.
