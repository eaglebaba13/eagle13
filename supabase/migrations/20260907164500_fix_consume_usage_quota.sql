-- ============================================================
-- Phase 8B: consume_usage security hardening (corrected draft)
-- ============================================================
-- Problem: consume_usage accepts _max from caller, allowing
-- authenticated users to bypass intended quotas via direct RPC.
-- Fix: Store authoritative quotas in a database table and have
-- consume_usage look them up internally.
--
-- Corrections vs. the previous (never-applied) draft, found during the
-- P0-B production reconciliation on 2026-09-28:
--   D1) Repaired corrupted seed row ("('effective plan.") that would
--       abort this migration with a syntax error. professional
--       journalEntries value restored from src/lib/plans.ts (= 50000).
--   D2) Added ALTER TABLE ... ENABLE ROW LEVEL SECURITY. Table is
--       deny-by-default: no policy for authenticated/anon, so only the
--       SECURITY DEFINER owner (postgres) can read it. The previous
--       "GRANT SELECT ... TO authenticated" was removed - no client
--       code reads usage_quotas.
--   D3) Previous "REVOKE ... FROM public" on the 3-arg overload was a
--       no-op: production proacl is {postgres, authenticated} (no
--       PUBLIC entry), so authenticated would have KEPT execute on the
--       caller-controlled _max function. The 3-arg signature is now
--       redefined as a deprecated wrapper that IGNORES _max and
--       forwards to the authoritative 2-arg function, so any legacy
--       caller is enforced server-side immediately.
--   D4) A freshly created function gets default EXECUTE to PUBLIC
--       (anon included). The 2-arg function is explicitly revoked
--       from PUBLIC/anon and granted to authenticated only.
--   D5) Caller-controlled _period allowed daily-quota bypass via a
--       future/backdated bucket. The bucket is now derived
--       server-side ('day' -> UTC date, 'lifetime' -> 'lifetime').
--       The _period argument is kept for signature compatibility
--       but ignored.
--   D6) Plan resolution now mirrors src/lib/entitlements.ts
--       resolveEffectivePlan(): expired/canceled/suspended,
--       trial-expired and period-expired fall back to 'free';
--       'past_due' keeps the paid plan; admin/enterprise role gets
--       'enterprise'. subscriptions.user_id is UNIQUE, so a
--       single-row lookup is sufficient.
--
-- Resource naming: seeded with the camelCase keys of UsageLimits
-- (src/lib/plans.ts) as canonical, plus the snake_case names from the
-- original draft as aliases, so either convention resolves.
-- period_type is the quota BASELINE ('lifetime' | 'day'); concrete
-- counter buckets are computed inside the function.
--
-- Deployment note: production usage_counters is empty and no
-- application code currently calls consumeUsage(), so applying this
-- migration has no live call-site impact. Still apply in the same
-- maintenance window as any frontend deploy (see P0-B report).
-- ============================================================

BEGIN;

-- 1. Create usage_quotas table (plan x resource -> limit)
CREATE TABLE IF NOT EXISTS public.usage_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan text NOT NULL,
  resource text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('lifetime', 'day')),
  max_count integer NOT NULL CHECK (max_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan, resource)
);

-- D2: RLS enabled, deny-by-default (no API-role policies on purpose).
ALTER TABLE public.usage_quotas ENABLE ROW LEVEL SECURITY;

-- Only the server-side privileged client may manage rows through the
-- API; the SECURITY DEFINER function below reads as owner (postgres)
-- and bypasses RLS as the table owner.
DROP POLICY IF EXISTS "service_role manages usage_quotas" ON public.usage_quotas;
CREATE POLICY "service_role manages usage_quotas" ON public.usage_quotas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.usage_quotas TO service_role;
REVOKE ALL ON public.usage_quotas FROM PUBLIC, anon, authenticated;

-- 2. Populate from src/lib/plans.ts (authoritative app definitions).
-- Values: watchlists, layouts, replayPresets, backtestsPerDay,
--         exportsPerDay, alertRules, journalEntries, teamMembers.
INSERT INTO public.usage_quotas (plan, resource, period_type, max_count) VALUES
  -- free
  ('free', 'watchlists', 'lifetime', 1),
  ('free', 'layouts', 'lifetime', 1),
  ('free', 'replayPresets', 'lifetime', 0),
  ('free', 'backtestsPerDay', 'day', 2),
  ('free', 'exportsPerDay', 'day', 3),
  ('free', 'alertRules', 'lifetime', 3),
  ('free', 'journalEntries', 'lifetime', 50),
  ('free', 'teamMembers', 'lifetime', 0),
  -- free (snake_case aliases from the original draft)
  ('free', 'replay_presets', 'lifetime', 0),
  ('free', 'backtests', 'day', 2),
  ('free', 'exports', 'day', 3),
  ('free', 'alert_rules', 'lifetime', 3),
  ('free', 'journal_entries', 'lifetime', 50),
  ('free', 'team_members', 'lifetime', 0),
  -- pro
  ('pro', 'watchlists', 'lifetime', 10),
  ('pro', 'layouts', 'lifetime', 5),
  ('pro', 'replayPresets', 'lifetime', 5),
  ('pro', 'backtestsPerDay', 'day', 20),
  ('pro', 'exportsPerDay', 'day', 25),
  ('pro', 'alertRules', 'lifetime', 25),
  ('pro', 'journalEntries', 'lifetime', 5000),
  ('pro', 'teamMembers', 'lifetime', 0),
  -- pro (snake_case aliases)
  ('pro', 'replay_presets', 'lifetime', 5),
  ('pro', 'backtests', 'day', 20),
  ('pro', 'exports', 'day', 25),
  ('pro', 'alert_rules', 'lifetime', 25),
  ('pro', 'journal_entries', 'lifetime', 5000),
  ('pro', 'team_members', 'lifetime', 0),
  -- professional (journalEntries = 50000 restored: D1 corruption fix)
  ('professional', 'watchlists', 'lifetime', 50),
  ('professional', 'layouts', 'lifetime', 25),
  ('professional', 'replayPresets', 'lifetime', 50),
  ('professional', 'backtestsPerDay', 'day', 100),
  ('professional', 'exportsPerDay', 'day', 200),
  ('professional', 'alertRules', 'lifetime', 200),
  ('professional', 'journalEntries', 'lifetime', 50000),
  ('professional', 'teamMembers', 'lifetime', 0),
  -- professional (snake_case aliases)
  ('professional', 'replay_presets', 'lifetime', 50),
  ('professional', 'backtests', 'day', 100),
  ('professional', 'exports', 'day', 200),
  ('professional', 'alert_rules', 'lifetime', 200),
  ('professional', 'journal_entries', 'lifetime', 50000),
  ('professional', 'team_members', 'lifetime', 0),
  -- enterprise
  ('enterprise', 'watchlists', 'lifetime', 500),
  ('enterprise', 'layouts', 'lifetime', 250),
  ('enterprise', 'replayPresets', 'lifetime', 500),
  ('enterprise', 'backtestsPerDay', 'day', 1000),
  ('enterprise', 'exportsPerDay', 'day', 2000),
  ('enterprise', 'alertRules', 'lifetime', 2000),
  ('enterprise', 'journalEntries', 'lifetime', 1000000),
  ('enterprise', 'teamMembers', 'lifetime', 25),
  -- enterprise (snake_case aliases)
  ('enterprise', 'replay_presets', 'lifetime', 500),
  ('enterprise', 'backtests', 'day', 1000),
  ('enterprise', 'exports', 'day', 2000),
  ('enterprise', 'alert_rules', 'lifetime', 2000),
  ('enterprise', 'journal_entries', 'lifetime', 1000000),
  ('enterprise', 'team_members', 'lifetime', 25)
ON CONFLICT (plan, resource) DO NOTHING;

-- 3. Rewrite consume_usage - no more caller-controlled _max or _period.
CREATE OR REPLACE FUNCTION public.consume_usage(_resource text, _period text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid();
  sub public.subscriptions;
  user_plan text;
  quota_max integer;
  quota_basis text;
  eff_period text;
  next_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- D6: effective plan - mirrors src/lib/entitlements.ts resolveEffectivePlan().
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid AND role IN ('admin', 'enterprise')
  ) THEN
    user_plan := 'enterprise';
  ELSE
    SELECT * INTO sub FROM public.subscriptions WHERE user_id = uid;
    IF NOT FOUND OR sub.plan IS NULL OR sub.plan = '' THEN
      user_plan := 'free';
    ELSIF sub.status IN ('expired', 'canceled', 'suspended')
       OR (sub.status = 'trialing'
           AND (sub.trial_end IS NULL OR sub.trial_end <= now()))
       OR (sub.status <> 'trialing'
           AND sub.current_period_end IS NOT NULL
           AND sub.current_period_end <= now())
    THEN
      user_plan := 'free';
    ELSE
      -- active / valid trialing / past_due / incomplete keep the paid plan.
      user_plan := sub.plan;
    END IF;
  END IF;

  -- Authoritative quota lookup; fail closed when undefined.
  SELECT max_count, period_type INTO quota_max, quota_basis
    FROM public.usage_quotas
   WHERE plan = user_plan AND resource = _resource
   LIMIT 1;

  IF quota_max IS NULL THEN
    RAISE EXCEPTION 'no_quota_defined:%/%', user_plan, _resource;
  END IF;

  -- Zero quota means feature unavailable.
  IF quota_max <= 0 THEN
    RAISE EXCEPTION 'usage_limit_exceeded';
  END IF;

  -- D5: server-owned counter bucket (caller _period is ignored).
  eff_period := CASE
    WHEN quota_basis = 'day' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    ELSE 'lifetime'
  END;

  -- Atomic increment with ceiling check.
  INSERT INTO public.usage_counters(user_id, resource, period, count)
    VALUES (uid, _resource, eff_period, 0)
    ON CONFLICT (user_id, resource, period) DO NOTHING;

  UPDATE public.usage_counters
     SET count = count + 1, updated_at = now()
   WHERE user_id = uid AND resource = _resource AND period = eff_period
     AND count < quota_max
   RETURNING count INTO next_count;

  IF next_count IS NULL THEN
    RAISE EXCEPTION 'usage_limit_exceeded';
  END IF;

  RETURN next_count;
END; $$;

-- D4: explicit privilege placement for the new 2-arg function.
REVOKE ALL ON FUNCTION public.consume_usage(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_usage(text, text) TO authenticated;

-- D3: the legacy 3-arg overload stays callable for old clients but its
-- caller-supplied _max is IGNORED - enforcement is server-side only.
-- Drop this wrapper in a later cleanup migration once no legacy bundle
-- references it.
CREATE OR REPLACE FUNCTION public.consume_usage(_resource text, _period text, _max integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public.consume_usage(_resource, _period); -- _max intentionally ignored
END; $$;

REVOKE ALL ON FUNCTION public.consume_usage(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_usage(text, text, integer) TO authenticated;

-- 4. Admin reset still works (no change needed - it operates on
--    usage_counters directly and is has_role('admin') gated).

COMMIT;


