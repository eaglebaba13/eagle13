# Phase 41 — Canonical Readiness Model

A single deterministic mapping derives three verdicts from the aggregated
`RuntimeReadinessReport`:

- **runtime** — mirrors `report.overall` (`READY | PARTIALLY_READY | NOT_READY`)
- **subscription** — paid-user gate (`READY | HOLD | BLOCKED`)
- **closedBeta** — controlled beta gate (`READY | HOLD | BLOCKED`)

## Dependency rules (enforced by `canonical-verdict.test.ts`)

| runtime            | subscription | closedBeta |
| ------------------ | ------------ | ---------- |
| NOT_READY          | BLOCKED      | HOLD*      |
| PARTIALLY_READY    | HOLD         | READY      |
| READY              | READY        | READY      |

*Any `critical` contradiction downgrades both to `BLOCKED` regardless of
`overall`. This eliminates the "NOT READY vs READY FOR BETA" contradiction
by making the beta verdict a function of the runtime verdict, not an
independent judgement.

## Consumers

`admin.launch-readiness` and any future readiness surface must call
`deriveCanonicalVerdict(runtime)` and render the three verdicts together;
they must never emit a subscription verdict without first checking the
runtime verdict from the same report.