# EagleBABA v1.0.0 — Admin Guide

## User access and licensing
- Users authenticate via Lovable Cloud auth.
- License activation is **manual** in v1.0.0. Approve entries in the admin billing surface after verifying the UPI payment reference.
- Revocation and grace-period handling are managed via the admin billing surface.

## Runtime readiness and diagnostics
- `/admin/launch-readiness` — v1.0.0 stable gates.
- `/admin/system-status` — runtime module and provider health.
- `/admin/coindcx`, `/admin/institutional-flow`, `/admin/gann-gap`, `/admin/alerts`, `/admin/research-lab` — subsystem diagnostics.
- `/admin/staging-validation` — staging validation history.
- `/admin/beta-readiness` — beta operations dashboard.

## Feature flags
Frozen defaults in `src/lib/release/v1-manifest.ts::V1_MANIFEST.featureFlags`. Experimental flags remain disabled unless explicitly approved.

## Health endpoints
`/status` exposes app version, build id, overall readiness, provider and persistence health, and the last health timestamp — without leaking secrets, headers, or stack traces.

## Backup, rollback, incident handling
See `docs/release/v1.0.0-backup-verification.md` and `docs/release/v1.0.0-rollback.md`. Incident severity, escalation, and ownership are documented per subsystem in the runbook.

## Release sign-off
The `signoff.human` gate in the v1.0.0 stable checklist must be performed manually by an authorized admin in `/admin/launch-readiness`. The stable verdict remains `AWAITING_HUMAN_SIGNOFF` until this action is recorded.

## Trading-safety invariants
`LIVE_ORDER_ENABLED`, `BROKER_ORDER_EXECUTION_ENABLED`, and `COINDCX_TRADING_ENABLED` are enforced to `false` at every gate. Any drift triggers `BLOCKED` in `evaluateV1StableReadiness()`.
