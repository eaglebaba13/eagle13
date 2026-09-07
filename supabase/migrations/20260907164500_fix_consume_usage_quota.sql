
-- ============================================================
-- Phase 8B: consume_usage security hardening
-- ============================================================
-- Problem: consume_usage accepts _max from caller, allowing
-- authenticated users to bypass intended quotas via direct RPC.
-- Fix: Store authoritative quotas in a database table and have
-- consume_usage look them up internally.

-- 1. Create usage_quotas table (plan × resource → limit)
CREATE TABLE IF NOT EXISTS public.usage_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan text NOT NULL,
  resource text NOT NULL,
  period text NOT NULL,
  max_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan, resource, period)
);

GRANT SELECT ON public.usage_quotas TO authenticated;
GRANT ALL ON public.usage_quotas TO service_role;

-- 2. Populate from application plan definitions
-- Free plan
INSERT INTO public.usage_quotas (plan, resource, period, max_count) VALUES
  ('free', 'watchlists', 'unlimited', 1),
  ('free', 'layouts', 'unlimited', 1),
  ('free', 'replay_presets', 'unlimited', 0),
  ('free', 'backtests', 'day', 2),
  ('free', 'exports', 'day', 3),
  ('free', 'alert_rules', 'unlimited', 3),
  ('free', 'journal_entries', 'unlimited', 50),
  ('free', 'team_members', 'unlimited', 0)
ON CONFLICT (plan, resource, period) DO NOTHING;

-- Pro plan
INSERT INTO public.usage_quotas (plan, resource, period, max_count) VALUES
  ('pro', 'watchlists', 'unlimited', 10),
  ('pro', 'layouts', 'unlimited', 5),
  ('pro', 'replay_presets', 'unlimited', 5),
  ('pro', 'backtests', 'day', 20),
  ('pro', 'exports', 'day', 25),
  ('pro', 'alert_rules', 'unlimited', 25),
  ('pro', 'journal_entries', 'unlimited', 5000),
  ('pro', 'team_members', 'unlimited', 0)
ON CONFLICT (plan, resource, period) DO NOTHING;

-- Professional plan
INSERT INTO public.usage_quotas (plan, resource, period, max_count) VALUES
  ('professional', 'watchlists', 'unlimited', 50),
  ('professional', 'layouts', 'unlimited', 25),
  ('professional', 'replay_presets', 'unlimited', 50),
  ('professional', 'backtests', 'day', 100),
  ('professional', 'exports', 'day', 200),
  ('professional', 'alert_rules', 'unlimited', 200),
  ('effective plan.
  ('professional', 'team_members', 'unlimited', 0)
ON CONFLICT (plan, resource, period) DO NOTHING;

-- Enterprise plan
INSERT INTO public.usage_quotas (plan, resource, period, max_count) VALUES
  ('enterprise', 'watchlists', 'unlimited', 500),
  ('enterprise', 'layouts', 'unlimited', 250),
  ('enterprise', 'replay_presets', 'unlimited', 500),
  ('enterprise', 'backtests', 'day', 1000),
  ('enterprise', 'exports', 'day', 2000),
  ('enterprise', 'alert_rules', 'unlimited', 2000),
  ('enterprise', 'journal_entries', 'unlimited', 1000000),
  ('enterprise', 'team_members', 'unlimited', 25)
ON CONFLICT (plan, resource, period) DO NOTHING;

-- 3. Rewrite consume_usage — no more caller-controlled _max
CREATE OR REPLACE FUNCTION public.consume_usage(_resource text, _period text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  user_plan text;
  _max integer;
  next_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Determine user's effective plan from subscription
  SELECT plan INTO user_plan FROM public.subscriptions
    WHERE user_id = uid AND status IN ('active','trialing')
    ORDER BY CASE plan
      WHEN 'enterprise' THEN 4
      WHEN 'professional' THEN 3
      WHEN 'pro' THEN 2
      ELSE 1
    END DESC
    LIMIT 1;

  IF user_plan IS NULL THEN user_plan := 'free'; END IF;

  -- Look up authoritative quota
  SELECT max_count INTO _max FROM public.usage_quotas
    WHERE plan = user_plan AND resource = _resource AND period = _period;

  -- If no quota defined, deny by default (fail-closed)
  IF _max IS NULL THEN
    RAISE EXCEPTION 'no_quota_defined:%/%/%', user_plan, _resource, _period;
  END IF;

  -- Zero quota means feature unavailable
  IF _max <= 0 THEN
    RAISE EXCEPTION 'usage_limit_exceeded';
  END IF;

  -- Atomic increment with ceiling check
  INSERT INTO public.usage_counters(user_id, resource, period, count)
    VALUES (uid, _resource, _period, 0)
    ON CONFLICT (user_id, resource, period) DO NOTHING;

  UPDATE public.usage_counters
     SET count = count + 1, updated_at = now()
   WHERE user_id = uid AND resource = _resource AND period = _period
     AND count < _max
   RETURNING count INTO next_count;

  IF next_count IS NULL THEN
    RAISE EXCEPTION 'usage_limit_exceeded';
  END IF;

  RETURN next_count;
END; $$;

-- Replace old 3-arg function with new 2-arg function
-- Revoke old signature first
REVOKE ALL ON FUNCTION public.consume_usage(text,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_usage(text,text) TO authenticated;

-- 4. Admin reset still works (no change needed — it operates on usage_counters directly)
