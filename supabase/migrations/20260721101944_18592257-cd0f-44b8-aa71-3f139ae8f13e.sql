
-- ==== Enums ====
DO $$ BEGIN
  CREATE TYPE public.referral_broker AS ENUM ('INDMONEY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.referral_status AS ENUM
    ('PENDING','UNDER_REVIEW','APPROVED','REJECTED','EXPIRED','CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==== Table ====
CREATE TABLE IF NOT EXISTS public.referral_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker public.referral_broker NOT NULL DEFAULT 'INDMONEY',
  referral_code text NOT NULL,
  broker_client_id_masked text NOT NULL,
  screenshot_url text,
  user_note text,
  declaration_accepted boolean NOT NULL DEFAULT false,
  status public.referral_status NOT NULL DEFAULT 'PENDING',
  admin_note text,
  rejection_reason text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reward_grant_id uuid REFERENCES public.user_entitlement_grants(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_client_id_len CHECK (char_length(broker_client_id_masked) BETWEEN 3 AND 64),
  CONSTRAINT referral_code_len CHECK (char_length(referral_code) BETWEEN 3 AND 64)
);

-- One active request per (user, broker)
CREATE UNIQUE INDEX IF NOT EXISTS referral_active_unique_idx
  ON public.referral_requests (user_id, broker)
  WHERE status IN ('PENDING','UNDER_REVIEW');

CREATE INDEX IF NOT EXISTS referral_status_idx
  ON public.referral_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_user_idx
  ON public.referral_requests (user_id, created_at DESC);

-- ==== Grants ====
GRANT SELECT, INSERT, UPDATE ON public.referral_requests TO authenticated;
GRANT ALL ON public.referral_requests TO service_role;

-- ==== RLS ====
ALTER TABLE public.referral_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own referrals" ON public.referral_requests;
CREATE POLICY "Users read own referrals" ON public.referral_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Users insert own referrals" ON public.referral_requests;
CREATE POLICY "Users insert own referrals" ON public.referral_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins update referrals" ON public.referral_requests;
CREATE POLICY "Admins update referrals" ON public.referral_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR auth.uid() = user_id)
  WITH CHECK (public.has_role(auth.uid(),'admin') OR auth.uid() = user_id);

-- Reuse existing set_updated_at() trigger fn
DROP TRIGGER IF EXISTS referral_requests_set_updated_at ON public.referral_requests;
CREATE TRIGGER referral_requests_set_updated_at
  BEFORE UPDATE ON public.referral_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==== RPCs ====

-- User submits a claim
CREATE OR REPLACE FUNCTION public.submit_referral_request(
  _broker public.referral_broker,
  _referral_code text,
  _client_id_masked text,
  _screenshot_url text,
  _user_note text,
  _declaration boolean
) RETURNS public.referral_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.referral_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT _declaration THEN RAISE EXCEPTION 'declaration_required'; END IF;
  IF _referral_code IS NULL OR length(trim(_referral_code)) < 3 THEN
    RAISE EXCEPTION 'invalid_code'; END IF;
  IF _client_id_masked IS NULL OR length(trim(_client_id_masked)) < 3 THEN
    RAISE EXCEPTION 'invalid_client_id'; END IF;

  -- Expire stale rows first
  UPDATE public.referral_requests
     SET status='EXPIRED', updated_at=now()
   WHERE user_id=uid
     AND status IN ('PENDING','UNDER_REVIEW')
     AND expires_at < now();

  INSERT INTO public.referral_requests
    (user_id, broker, referral_code, broker_client_id_masked,
     screenshot_url, user_note, declaration_accepted, status)
  VALUES
    (uid, COALESCE(_broker,'INDMONEY'), trim(_referral_code),
     trim(_client_id_masked), _screenshot_url, _user_note, true, 'PENDING')
  RETURNING * INTO row;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, new_value)
    VALUES (uid, uid, uid, 'referral.submitted',
      jsonb_build_object('id', row.id, 'broker', row.broker,
                         'code', row.referral_code));
  RETURN row;
END; $$;

REVOKE ALL ON FUNCTION public.submit_referral_request(public.referral_broker,text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_referral_request(public.referral_broker,text,text,text,text,boolean) TO authenticated;

-- User cancels
CREATE OR REPLACE FUNCTION public.cancel_referral_request(_id uuid)
RETURNS public.referral_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  updated public.referral_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.referral_requests
     SET status='CANCELED', updated_at=now()
   WHERE id=_id AND user_id=uid
     AND status IN ('PENDING','UNDER_REVIEW')
   RETURNING * INTO updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_cancelable'; END IF;
  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, new_value)
    VALUES (uid, uid, uid, 'referral.canceled', jsonb_build_object('id', _id));
  RETURN updated;
END; $$;

REVOKE ALL ON FUNCTION public.cancel_referral_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_referral_request(uuid) TO authenticated;

-- Admin: under review
CREATE OR REPLACE FUNCTION public.admin_mark_referral_under_review(_id uuid)
RETURNS public.referral_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  admin_id uuid := auth.uid();
  updated public.referral_requests;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.referral_requests
     SET status='UNDER_REVIEW', updated_at=now()
   WHERE id=_id AND status IN ('PENDING','UNDER_REVIEW')
   RETURNING * INTO updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_reviewable'; END IF;
  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, new_value)
    VALUES (updated.user_id, admin_id, updated.user_id,
            'referral.review_started', jsonb_build_object('id', _id));
  RETURN updated;
END; $$;

REVOKE ALL ON FUNCTION public.admin_mark_referral_under_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_referral_under_review(uuid) TO authenticated;

-- Admin: reject
CREATE OR REPLACE FUNCTION public.admin_reject_referral(_id uuid, _reason text)
RETURNS public.referral_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  admin_id uuid := auth.uid();
  updated public.referral_requests;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required'; END IF;
  UPDATE public.referral_requests
     SET status='REJECTED', rejection_reason=_reason,
         verified_at=now(), verified_by=admin_id, updated_at=now()
   WHERE id=_id AND status IN ('PENDING','UNDER_REVIEW')
   RETURNING * INTO updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_rejectable'; END IF;
  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, new_value)
    VALUES (updated.user_id, admin_id, updated.user_id, 'referral.rejected',
      jsonb_build_object('id', _id, 'reason', _reason));
  RETURN updated;
END; $$;

REVOKE ALL ON FUNCTION public.admin_reject_referral(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_referral(uuid,text) TO authenticated;

-- Admin: approve — grants 7-day PRO
CREATE OR REPLACE FUNCTION public.admin_approve_referral(_id uuid, _admin_note text)
RETURNS public.referral_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  admin_id uuid := auth.uid();
  req public.referral_requests;
  sub_cur public.subscriptions;
  grant_row public.user_entitlement_grants;
  reward_expires timestamptz := now() + interval '7 days';
  period_start timestamptz := now();
  period_end   timestamptz;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO req FROM public.referral_requests
    WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF req.status NOT IN ('PENDING','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'invalid_state:%', req.status; END IF;

  -- Create entitlement grant (7 days PRO)
  INSERT INTO public.user_entitlement_grants
    (user_id, capability, granted_by, reason, expires_at)
  VALUES
    (req.user_id, 'plan.pro', admin_id,
     'INDmoney referral bonus (7 days)', reward_expires)
  RETURNING * INTO grant_row;

  -- Subscription: activate/extend PRO for 7 days
  SELECT * INTO sub_cur FROM public.subscriptions
    WHERE user_id=req.user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions(user_id, plan, status)
      VALUES (req.user_id,'free','active')
      RETURNING * INTO sub_cur;
  END IF;

  IF sub_cur.status IN ('active','trialing')
     AND sub_cur.plan IN ('pro','professional','enterprise')
     AND sub_cur.current_period_end IS NOT NULL
     AND sub_cur.current_period_end > now() THEN
    period_start := sub_cur.current_period_end;
    period_end   := period_start + interval '7 days';
  ELSE
    period_end := period_start + interval '7 days';
  END IF;

  UPDATE public.subscriptions
     SET plan = CASE WHEN sub_cur.plan IN ('professional','enterprise')
                     THEN sub_cur.plan ELSE 'pro' END,
         status='active',
         provider='referral_bonus',
         current_period_start=period_start,
         current_period_end=period_end,
         cancel_at_period_end=false,
         trial_end=NULL,
         updated_at=now()
   WHERE user_id=req.user_id;

  INSERT INTO public.user_roles(user_id, role) VALUES (req.user_id, 'pro')
    ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.referral_requests
     SET status='APPROVED', verified_at=now(), verified_by=admin_id,
         admin_note=_admin_note, reward_grant_id=grant_row.id, updated_at=now()
   WHERE id=_id
   RETURNING * INTO req;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, previous_value, new_value)
    VALUES (req.user_id, admin_id, req.user_id, 'referral.approved',
      jsonb_build_object('plan', sub_cur.plan, 'status', sub_cur.status),
      jsonb_build_object('id', req.id, 'grant_id', grant_row.id,
                         'reward_expires', reward_expires,
                         'period_end', period_end));
  RETURN req;
END; $$;

REVOKE ALL ON FUNCTION public.admin_approve_referral(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_referral(uuid,text) TO authenticated;

-- ==== Scheduled jobs (SQL-only) ====
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Auto-downgrade expired trials
SELECT cron.unschedule('subscriptions-expire-trials')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='subscriptions-expire-trials');
SELECT cron.schedule(
  'subscriptions-expire-trials',
  '5 * * * *',
  $CRON$
  UPDATE public.subscriptions
     SET plan='free', status='expired', updated_at=now()
   WHERE status='trialing'
     AND trial_end IS NOT NULL
     AND trial_end < now();
  $CRON$
);

-- Auto-expire stale referral requests
SELECT cron.unschedule('referrals-expire-stale')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='referrals-expire-stale');
SELECT cron.schedule(
  'referrals-expire-stale',
  '10 * * * *',
  $CRON$
  UPDATE public.referral_requests
     SET status='EXPIRED', updated_at=now()
   WHERE status IN ('PENDING','UNDER_REVIEW')
     AND expires_at < now();
  $CRON$
);
