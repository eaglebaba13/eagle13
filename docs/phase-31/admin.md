# Admin Guide

Admin surfaces:
- `/admin/system-status` — pipeline, env, backups, security (Phase 31)
- `/admin/launch-readiness` — verdict console with manual sign-off
- `/admin/readiness` — production readiness aggregator
- `/admin/staging-validation` — staging soak
- `/admin/providers` — provider health
- `/admin/payments` — billing

All admin routes require the `admin` role.

Verdicts: `READY_FOR_STAGING` (Phase 31 default) → `READY_FOR_SUBSCRIPTION`
→ `READY_FOR_PRODUCTION` (requires manual public sign-off).
