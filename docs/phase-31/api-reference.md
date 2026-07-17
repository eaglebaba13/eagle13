# API Reference — Phase 31 Modules

## `@/lib/env-validation`
- `validateEnv(env, requirements?)`
- `assertRequiredEnv(env, requirements?)`
- `DEFAULT_ENV_REQUIREMENTS`

## `@/lib/health-endpoints`
- `buildHealthPayload(subsystems, build, now?)`
- `rollupStatus(subsystems)`
- `httpStatusFor(status)`

## `@/lib/monitoring`
- `summariseMonitoring(samples, windowMs?, now?)`
- `MonitoringBuffer`

## `@/lib/structured-logging`
- `StructuredLogger`, `newCorrelationId/RequestId/ErrorId/AuditId`

## `@/lib/release-management`
- `parseSemver / formatSemver / bumpVersion`
- `buildReleaseNotes`
- `MIGRATION_CHECKLIST`, `ROLLBACK_CHECKLIST`

## `@/lib/deployment-safety`
- `evaluateDeployment(input)`

## `@/lib/backup-recovery`
- `RECOVERY_CHECKLIST`
- `evaluateRecovery(completedIds)`

## `@/lib/ci-cd-pipeline`
- `PRODUCTION_PIPELINE`, `validatePipeline`, `evaluatePipelineRun`

## `@/lib/security-audit`
- `evaluateSecurityHeaders`, `evaluateCsp`, `buildSecurityAudit`
- `REQUIRED_SECURITY_HEADERS`
