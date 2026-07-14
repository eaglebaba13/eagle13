
-- ============================================================
-- Phase 20.3A: Billing security hardening
-- ============================================================

-- ---- 1. Lock subscriptions table ---------------------------
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;

DROP POLICY IF EXISTS "Users insert own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users update own subscription" ON public.subscriptions;

-- Extend signup trigger so every new user has a free subscription row.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'free')
    ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.subscriptions (user_id, plan, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- Backfill: ensure every existing user has a subscription row.
INSERT INTO public.subscriptions (user_id, plan, status)
SELECT u.id, 'free', 'active'
FROM auth.users u
LEFT JOIN public.subscriptions s ON s.user_id = u.id
WHERE s.user_id IS NULL;

-- ---- 2. subscription_preferences ---------------------------
CREATE TABLE IF NOT EXISTS public.subscription_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  billing_cycle_preference text NOT NULL DEFAULT 'monthly',
  invoice_email text,
  marketing_consent boolean NOT NULL DEFAULT false,
  preferred_currency text NOT NULL DEFAULT 'INR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.subscription_preferences TO authenticated;
GRANT ALL ON public.subscription_preferences TO service_role;
ALTER TABLE public.subscription_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own sub prefs" ON public.subscription_preferences;
CREATE POLICY "Users manage own sub prefs" ON public.subscription_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS subscription_preferences_updated_at ON public.subscription_preferences;
CREATE TRIGGER subscription_preferences_updated_at BEFORE UPDATE ON public.subscription_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- 3. user_entitlement_grants ----------------------------
CREATE TABLE IF NOT EXISTS public.user_entitlement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability text NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_entitlement_grants TO authenticated;
GRANT ALL ON public.user_entitlement_grants TO service_role;
ALTER TABLE public.user_entitlement_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own grants" ON public.user_entitlement_grants;
CREATE POLICY "Users read own grants" ON public.user_entitlement_grants
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS user_entitlement_grants_user_active_idx
  ON public.user_entitlement_grants(user_id) WHERE revoked_at IS NULL;

-- ---- 4. Harden billing_events ------------------------------
ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS signature_verified boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_idempotency_uniq
  ON public.billing_events(provider, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ---- 5. Harden audit_log -----------------------------------
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb;

-- Users may still write their own low-privilege UX audit lines (best-effort),
-- but sensitive events flow through SECURITY DEFINER helpers only.
DROP POLICY IF EXISTS "Users insert own audit" ON public.audit_log;
CREATE POLICY "Users insert own audit" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND event NOT LIKE 'admin.%'
    AND event NOT LIKE 'billing.%'
    AND event NOT LIKE 'entitlement.%'
    AND event NOT LIKE 'subscription.%'
  );

-- ---- 6. Subscription state-machine validator ---------------
CREATE OR REPLACE FUNCTION public.validate_subscription_transition(_from text, _to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _from = _to THEN true
    WHEN _from = 'incomplete' AND _to IN ('trialing','active','canceled') THEN true
    WHEN _from = 'trialing'   AND _to IN ('active','expired','canceled') THEN true
    WHEN _from = 'active'     AND _to IN ('past_due','canceled') THEN true
    WHEN _from = 'past_due'   AND _to IN ('active','suspended','canceled') THEN true
    WHEN _from = 'canceled'   AND _to IN ('active','expired') THEN true
    WHEN _from = 'suspended'  AND _to IN ('active','canceled') THEN true
    WHEN _from = 'expired'    AND _to IN ('active') THEN true
    ELSE false
  END
$$;

-- ---- 7. Self-service RPCs ----------------------------------
CREATE OR REPLACE FUNCTION public.self_start_trial(_plan text)
RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  cur public.subscriptions;
  new_trial_end timestamptz := now() + interval '14 days';
  updated public.subscriptions;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _plan NOT IN ('pro','professional') THEN RAISE EXCEPTION 'invalid_plan'; END IF;

  SELECT * INTO cur FROM public.subscriptions WHERE user_id = uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions(user_id, plan, status) VALUES (uid,'free','active')
      RETURNING * INTO cur;
  END IF;

  IF cur.status IN ('active','trialing') AND cur.plan <> 'free' THEN
    RAISE EXCEPTION 'already_on_paid_plan';
  END IF;

  UPDATE public.subscriptions
    SET plan = _plan,
        status = 'trialing',
        trial_end = new_trial_end,
        current_period_start = now(),
        current_period_end = new_trial_end,
        cancel_at_period_end = false,
        updated_at = now()
    WHERE user_id = uid
    RETURNING * INTO updated;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, previous_value, new_value, metadata)
    VALUES (uid, uid, uid, 'subscription.trial_started',
            jsonb_build_object('plan', cur.plan, 'status', cur.status),
            jsonb_build_object('plan', _plan, 'status', 'trialing', 'trial_end', new_trial_end),
            jsonb_build_object('source','self'));
  RETURN updated;
END; $$;
REVOKE ALL ON FUNCTION public.self_start_trial(text) FROM public;
GRANT EXECUTE ON FUNCTION public.self_start_trial(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.self_set_cancel_at_period_end(_flag boolean)
RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  cur public.subscriptions;
  updated public.subscriptions;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO cur FROM public.subscriptions WHERE user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_subscription'; END IF;

  UPDATE public.subscriptions
     SET cancel_at_period_end = _flag, updated_at = now()
   WHERE user_id = uid
   RETURNING * INTO updated;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, previous_value, new_value)
    VALUES (uid, uid, uid,
            CASE WHEN _flag THEN 'subscription.cancel_scheduled' ELSE 'subscription.cancel_reverted' END,
            jsonb_build_object('cancel_at_period_end', cur.cancel_at_period_end),
            jsonb_build_object('cancel_at_period_end', _flag));
  RETURN updated;
END; $$;
REVOKE ALL ON FUNCTION public.self_set_cancel_at_period_end(boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.self_set_cancel_at_period_end(boolean) TO authenticated;

-- ---- 8. Atomic usage consumption ---------------------------
CREATE OR REPLACE FUNCTION public.consume_usage(_resource text, _period text, _max integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  next_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _max < 0 THEN _max := 0; END IF;

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
REVOKE ALL ON FUNCTION public.consume_usage(text,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_usage(text,text,integer) TO authenticated;

-- ---- 9. Admin RPCs -----------------------------------------
-- Every admin RPC verifies has_role(auth.uid(),'admin') server-side.

CREATE OR REPLACE FUNCTION public.admin_change_plan(_target uuid, _plan text, _reason text)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_id uuid := auth.uid();
  cur public.subscriptions;
  updated public.subscriptions;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _plan NOT IN ('free','pro','professional','enterprise') THEN
    RAISE EXCEPTION 'invalid_plan';
  END IF;
  SELECT * INTO cur FROM public.subscriptions WHERE user_id = _target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_subscription'; END IF;

  UPDATE public.subscriptions
     SET plan = _plan,
         status = CASE WHEN cur.status IN ('expired','canceled','suspended') THEN 'active' ELSE cur.status END,
         updated_at = now()
   WHERE user_id = _target
   RETURNING * INTO updated;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, previous_value, new_value, metadata)
    VALUES (_target, admin_id, _target, 'admin.plan_changed',
            jsonb_build_object('plan', cur.plan, 'status', cur.status),
            jsonb_build_object('plan', updated.plan, 'status', updated.status),
            jsonb_build_object('reason', _reason));
  RETURN updated;
END; $$;
REVOKE ALL ON FUNCTION public.admin_change_plan(uuid,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_status(_target uuid, _status text, _reason text)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_id uuid := auth.uid();
  cur public.subscriptions;
  updated public.subscriptions;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _status NOT IN ('trialing','active','past_due','canceled','expired','suspended','incomplete') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  SELECT * INTO cur FROM public.subscriptions WHERE user_id = _target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_subscription'; END IF;
  IF NOT public.validate_subscription_transition(cur.status, _status) THEN
    RAISE EXCEPTION 'invalid_transition:%->%', cur.status, _status;
  END IF;

  UPDATE public.subscriptions
     SET status = _status, updated_at = now()
   WHERE user_id = _target
   RETURNING * INTO updated;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, previous_value, new_value, metadata)
    VALUES (_target, admin_id, _target, 'admin.status_changed',
            jsonb_build_object('status', cur.status),
            jsonb_build_object('status', _status),
            jsonb_build_object('reason', _reason));
  RETURN updated;
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_status(uuid,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_status(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_extend_trial(_target uuid, _days integer, _reason text)
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_id uuid := auth.uid();
  cur public.subscriptions;
  new_end timestamptz;
  updated public.subscriptions;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _days <= 0 OR _days > 365 THEN RAISE EXCEPTION 'invalid_days'; END IF;
  SELECT * INTO cur FROM public.subscriptions WHERE user_id = _target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_subscription'; END IF;
  new_end := COALESCE(cur.trial_end, now()) + make_interval(days => _days);

  UPDATE public.subscriptions
     SET trial_end = new_end,
         status = 'trialing',
         current_period_end = GREATEST(COALESCE(cur.current_period_end, now()), new_end),
         updated_at = now()
   WHERE user_id = _target
   RETURNING * INTO updated;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, previous_value, new_value, metadata)
    VALUES (_target, admin_id, _target, 'admin.trial_extended',
            jsonb_build_object('trial_end', cur.trial_end, 'status', cur.status),
            jsonb_build_object('trial_end', new_end, 'status', 'trialing'),
            jsonb_build_object('days', _days, 'reason', _reason));
  RETURN updated;
END; $$;
REVOKE ALL ON FUNCTION public.admin_extend_trial(uuid,integer,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial(uuid,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_grant_entitlement(
  _target uuid, _capability text, _expires_at timestamptz, _reason text
) RETURNS public.user_entitlement_grants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_id uuid := auth.uid();
  g public.user_entitlement_grants;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.user_entitlement_grants(user_id, capability, granted_by, reason, expires_at)
    VALUES (_target, _capability, admin_id, _reason, _expires_at)
    RETURNING * INTO g;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, new_value, metadata)
    VALUES (_target, admin_id, _target, 'admin.entitlement_granted',
            jsonb_build_object('grant_id', g.id, 'capability', _capability, 'expires_at', _expires_at),
            jsonb_build_object('reason', _reason));
  RETURN g;
END; $$;
REVOKE ALL ON FUNCTION public.admin_grant_entitlement(uuid,text,timestamptz,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_grant_entitlement(uuid,text,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_entitlement(_grant_id uuid, _reason text)
RETURNS public.user_entitlement_grants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_id uuid := auth.uid();
  g public.user_entitlement_grants;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.user_entitlement_grants
     SET revoked_at = now()
   WHERE id = _grant_id AND revoked_at IS NULL
   RETURNING * INTO g;
  IF NOT FOUND THEN RAISE EXCEPTION 'grant_not_found_or_revoked'; END IF;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, previous_value, new_value, metadata)
    VALUES (g.user_id, admin_id, g.user_id, 'admin.entitlement_revoked',
            jsonb_build_object('grant_id', g.id, 'capability', g.capability),
            jsonb_build_object('revoked_at', g.revoked_at),
            jsonb_build_object('reason', _reason));
  RETURN g;
END; $$;
REVOKE ALL ON FUNCTION public.admin_revoke_entitlement(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_revoke_entitlement(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_usage(
  _target uuid, _resource text, _period text, _reason text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_id uuid := auth.uid();
  prev_count integer;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT count INTO prev_count FROM public.usage_counters
    WHERE user_id = _target AND resource = _resource AND period = _period;
  UPDATE public.usage_counters
     SET count = 0, updated_at = now()
   WHERE user_id = _target AND resource = _resource AND period = _period;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, previous_value, new_value, metadata)
    VALUES (_target, admin_id, _target, 'admin.usage_reset',
            jsonb_build_object('resource', _resource, 'period', _period, 'count', COALESCE(prev_count,0)),
            jsonb_build_object('resource', _resource, 'period', _period, 'count', 0),
            jsonb_build_object('reason', _reason));
  RETURN COALESCE(prev_count,0);
END; $$;
REVOKE ALL ON FUNCTION public.admin_reset_usage(uuid,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_reset_usage(uuid,text,text,text) TO authenticated;

-- ---- 10. Server-side entitlement snapshot ------------------
-- Callable by any authed user for THEIR OWN uid; admin can pass another uid.
CREATE OR REPLACE FUNCTION public.get_entitlement_snapshot(_target uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  who uuid := COALESCE(_target, uid);
  sub public.subscriptions;
  grants jsonb;
  roles jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF who <> uid AND NOT public.has_role(uid,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO sub FROM public.subscriptions WHERE user_id = who;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'capability', capability, 'expires_at', expires_at,
    'starts_at', starts_at, 'revoked_at', revoked_at
  )), '[]'::jsonb) INTO grants
    FROM public.user_entitlement_grants
    WHERE user_id = who AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
      AND starts_at <= now();
  SELECT COALESCE(jsonb_agg(role), '[]'::jsonb) INTO roles
    FROM public.user_roles WHERE user_id = who;

  RETURN jsonb_build_object(
    'user_id', who,
    'roles', roles,
    'subscription', CASE WHEN sub IS NULL THEN NULL ELSE jsonb_build_object(
      'plan', sub.plan, 'status', sub.status, 'trial_end', sub.trial_end,
      'current_period_end', sub.current_period_end,
      'cancel_at_period_end', sub.cancel_at_period_end,
      'provider', sub.provider
    ) END,
    'grants', grants,
    'server_time', now()
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_entitlement_snapshot(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_entitlement_snapshot(uuid) TO authenticated;
