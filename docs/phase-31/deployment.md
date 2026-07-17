# Deployment Guide

## Pipeline

Canonical pipeline: `src/lib/ci-cd-pipeline/index.ts` (`PRODUCTION_PIPELINE`).

Stages: Lint → TypeScript → Unit tests → Build → Security scan →
Dependency audit → Bundle analysis (non-blocking) → Deploy (blue/green) →
Post-deploy health → Rollback trigger (auto-armed).

Blocking failures fail the run (`evaluatePipelineRun`).

## Blue/Green

`evaluateDeployment` returns `PROMOTE | HOLD | ROLLBACK`.
Automatic rollback fires only on hard failures (unhealthy candidate or
error rate above threshold). Degradations require operator confirmation.

## Environment

`assertRequiredEnv(process.env)` runs at server bootstrap. Startup fails
if any required secret from `DEFAULT_ENV_REQUIREMENTS` is missing.

## Health

`buildHealthPayload` composes application, database, provider, queue, and
cache subsystems plus build info into a single payload. `httpStatusFor`
maps unhealthy → 503, otherwise 200.
