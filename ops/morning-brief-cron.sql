-- OPERATIONAL ARTIFACT ONLY: do not run as a migration or during deployment.
-- Before execution, confirm no external scheduler already calls this endpoint.
-- Store the same high-entropy secret in Coolify and Supabase Vault as
-- morning_brief_cron_secret. Never place the literal secret in this file.

-- This preflight intentionally fails closed if prerequisites, timezone,
-- secret, or the job name are not in the expected state.
DO $preflight$
DECLARE
  matching_secret_count integer;
  cron_timezone text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron is not installed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'pg_net is not installed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault')
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Supabase Vault is unavailable';
  END IF;

  cron_timezone := current_setting('cron.timezone', true);
  IF cron_timezone IS DISTINCT FROM 'UTC' AND cron_timezone IS DISTINCT FROM 'GMT' THEN
    RAISE EXCEPTION 'cron.timezone must be UTC or GMT for the requested 08:15 IST schedule';
  END IF;

  SELECT count(*) INTO matching_secret_count
  FROM vault.decrypted_secrets
  WHERE name = 'morning_brief_cron_secret'
    AND length(decrypted_secret) BETWEEN 32 AND 256
    AND decrypted_secret ~ '^[A-Za-z0-9_-]+$';

  IF matching_secret_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one valid morning_brief_cron_secret in Vault';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'eaglebaba-morning-brief') THEN
    RAISE EXCEPTION 'Job eaglebaba-morning-brief already exists; inspect it before proceeding';
  END IF;
END
$preflight$;

SELECT cron.schedule(
  'eaglebaba-morning-brief',
  '45 2 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://eaglebaba.lwill.in/api/public/hooks/morning-brief',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-morning-brief-secret',
        (SELECT decrypted_secret
         FROM vault.decrypted_secrets
         WHERE name = 'morning_brief_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

-- Read-only run-status check; do not select decrypted secrets, request headers,
-- response bodies, or application report contents.
SELECT
  jobid,
  jobname,
  schedule,
  active
FROM cron.job
WHERE jobname = 'eaglebaba-morning-brief';

SELECT
  jobid,
  status,
  start_time,
  end_time,
  left(
    regexp_replace(
      regexp_replace(coalesce(return_message, ''), '(?i)(secret|token|authorization)[^[:space:]]*', '[redacted]', 'g'),
      'https?://[^[:space:]]+',
      '[url-redacted]',
      'g'
    ),
    160
  ) AS sanitized_return_message
FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid FROM cron.job WHERE jobname = 'eaglebaba-morning-brief'
)
ORDER BY start_time DESC
LIMIT 10;

-- pg_net is asynchronous. Inspect only status/timing/error metadata from the
-- response queue; never select headers or content.
SELECT
  status_code,
  timed_out,
  created,
  left(
    regexp_replace(
      regexp_replace(coalesce(error_msg, ''), '(?i)(secret|token|authorization)[^[:space:]]*', '[redacted]', 'g'),
      'https?://[^[:space:]]+',
      '[url-redacted]',
      'g'
    ),
    160
  ) AS sanitized_error
FROM net._http_response
ORDER BY created DESC
LIMIT 10;

-- Rollback (run separately only after verifying the exact job):
-- SELECT cron.unschedule(jobid)
-- FROM cron.job
-- WHERE jobname = 'eaglebaba-morning-brief';
