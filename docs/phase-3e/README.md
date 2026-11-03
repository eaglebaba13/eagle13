# Phase 3E — Historical Research & Signal Validation Lab

Research-only, consumer-only, canonical-signal analytics module. Never issues
trade signals, never fetches a live provider, and never modifies existing
trading formulas.

## Scope

- Deterministic historical validation of the Gann Gap outlook, Decision
  Intelligence, GTI, Combined PCR, Market Breadth, Smart Alerts and
  Institutional Flow — exactly as implemented today.
- FNV-1a 64-bit dataset hashing for run reproducibility.
- Anti-leakage alignment (signals published after session close are rejected).
- Walk-forward chronological splits (expanding / rolling window).
- Small-sample warnings and confusion matrices.
- JSON / CSV exports with allowlisted fields — never credentials or PII.

## Routes

- `/research-lab` — overview, dataset status, warnings, recent runs.
- `/research-lab/gann-gap` — Gann Gap study.
- `/research-lab/signals` — Decision / GTI / PCR / Breadth family metrics.
- `/research-lab/alerts` — Smart Alert alignment & suppression.
- `/research-lab/institutional-flow` — class-conditioned outcomes.
- `/research-lab/runs` — persisted runs.
- `/research-lab/runs/$runId` — run detail.
- `/admin/research-lab` — admin diagnostics (redacted, allowlisted).

## Runtime readiness

`RESEARCH_LAB` is registered as a non-critical module. `LEAKAGE_DETECTED`
blockers stop research execution only; they never affect live-market
readiness (Decision, Options, PCR, Breadth, GTI, Alerts).

## Persistence and Run IDs

Run reports and failure metrics are stored in Supabase/PostgreSQL by the
`research_lab_durable_persistence` migration. Reads are owner-scoped, with
row-level security as a second boundary; cross-user diagnostics require the
admin role. Failure metrics are written through an owner-checked RPC using
database time. Run IDs are allocated with a PostgreSQL sequence through an
authenticated RPC, so allocation is database-backed across server instances
and restarts. Apply and validate the migration in the target environment before
enabling this feature there; the server does not fall back to process memory.

## Disclaimer

Historical results do not guarantee future performance.
