# Operations Runbook

## Deploy
1. Merge to main; CI runs the pipeline.
2. Candidate colour deploys on success.
3. Operator approves in `/admin/launch-readiness` after staging soak.

## Rotate a secret
1. Update the secret in Lovable Cloud.
2. Redeploy.
3. Verify `validateEnv` reports no missing required keys.

## Provider outage
Failover chain demotes the failing provider automatically. If all fail,
cards render `UNAVAILABLE`. Do not touch research formulas.

## Unhealthy post-deploy
`evaluateDeployment` returns `ROLLBACK`; the rollback stage re-routes to
the last known-good colour.
