# Troubleshooting Guide

| Symptom | Likely cause | Fix |
|---|---|---|
| Startup crash "Missing required environment variables" | Env registry mismatch | Restore secret, redeploy |
| Health endpoint returns 503 | Subsystem unhealthy | Inspect `/admin/system-status` |
| Deployment stuck in HOLD | Manual approval missing OR p95 high | Approve OR investigate slow requests |
| Automatic rollback fired | Candidate unhealthy or error rate > 2% | Inspect logs by correlation ID, redeploy |

All logs share a `correlationId` per request; join with `requestId`,
`errorId`, `auditId` for finer scopes.
