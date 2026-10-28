# Telegram Morning Brief operations

The Morning Brief is generated only when `POST /api/public/hooks/morning-brief`
is called. The application has no server-side scheduler.

## Application configuration

Set these Coolify application variables:

- `TELEGRAM_ENABLED=true`
- `TELEGRAM_MORNING_BRIEF_ENABLED=true`
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- `MORNING_BRIEF_CRON_SECRET` to a randomly generated, URL-independent secret
  of 32-256 ASCII letters, digits, underscores, or hyphens

Generate a secret without printing it into shell history or CI logs, and store
it in Coolify and Supabase Vault. For example, generate 32 random bytes with a
trusted password manager and encode them as 64 hexadecimal characters. Never put
the secret in source control, a migration, or a scheduler SQL literal.

The hook requires the `x-morning-brief-secret` header. Missing or malformed
server configuration returns HTTP 503; missing or incorrect request
credentials return HTTP 401. The Supabase publishable key is not accepted as
scheduler authentication.

Only the exact case-insensitive value `true` enables either Telegram flag.
Missing or invalid flag values disable Morning Brief delivery. Smart Alerts and
other Telegram notification paths are unchanged.

## Scheduling prerequisites

The database registry previously showed no Morning Brief `pg_cron` job, but
confirm no external scheduler is already calling the endpoint before adding
this schedule. `pg_cron` was verified in the database; verify `pg_net`, Vault,
and `cron.timezone` before running the separate
[`morning-brief-cron.sql`](../../ops/morning-brief-cron.sql) operational script.
It is not a migration and must not be run automatically by deployment.

The SQL expects a Supabase Vault secret named `morning_brief_cron_secret` whose
value exactly matches `MORNING_BRIEF_CRON_SECRET` in Coolify. Store it through
the Vault UI; do not select or print its decrypted value. The schedule is
02:45 UTC, equivalent to 08:15 Asia/Kolkata when `cron.timezone` is UTC.

`pg_net` HTTP calls are asynchronous: a successful cron run can mean only that
the request was queued. Verify the HTTP response status separately; do not
interpret cron success alone as successful Telegram delivery.

## Delivery and data quality

Reports with unavailable provider inputs remain clearly labeled `PARTIAL` or
`UNAVAILABLE`; the Morning Brief does not fabricate prices, timestamps, or
signals. The report is `SENT` only after all Telegram message parts succeed.
Successfully delivered reports are idempotent. Ambiguous or failed prior
attempts are not automatically resent; an authorized admin must use the
existing retry path to avoid accidental duplicates.

Structured application events include scheduler invocation, report quality,
delivery status, and safe error codes. They must not include request headers,
Telegram URLs, credentials, or report payloads.

## Rollback

Disable or unschedule only the Morning Brief job after confirming its exact job
ID and name in the live database. Remove `MORNING_BRIEF_CRON_SECRET` from
Coolify and delete the matching Vault entry only after the schedule is stopped.
Do not affect unrelated `pg_cron` jobs.
