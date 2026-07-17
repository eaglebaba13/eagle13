# Phase 31 — Production Deployment, CI/CD, Monitoring, Backups & Public Launch

This directory collects the operational documentation shipped in Phase 31.
All code changes are additive: no research engine, formula, provider
foundation, run ID, query key, cache namespace, broker path, or order-
execution surface was modified.

## Contents

- [Architecture Guide](./architecture.md)
- [Deployment Guide](./deployment.md)
- [Operations Runbook](./runbook.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [Disaster Recovery Guide](./disaster-recovery.md)
- [Admin Guide](./admin.md)
- [API Reference](./api-reference.md)

## Deployment Verdict

**READY_FOR_STAGING** — the deployment framework is in place; a production
cut requires manual sign-off in `/admin/launch-readiness` plus a successful
run of the pipeline defined in `src/lib/ci-cd-pipeline/`.