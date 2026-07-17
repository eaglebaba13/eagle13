# Disaster Recovery Guide

- RPO: ≤ 24 hours
- RTO: ≤ 4 hours

## Backups
See `src/lib/backup-recovery/` (`RECOVERY_CHECKLIST`).

## Restore Procedure
1. Freeze writes (`LIVE_ORDER_ENABLED=false` — already default).
2. Restore latest snapshot into a fresh instance.
3. Verify health with `buildHealthPayload`.
4. Rotate any secrets touched.
5. Re-open writes only after `/admin/system-status` is healthy.

## Secrets Recovery
Every runtime secret in `DEFAULT_ENV_REQUIREMENTS` has a named owner;
regenerate at the upstream provider and store via `add_secret`.
