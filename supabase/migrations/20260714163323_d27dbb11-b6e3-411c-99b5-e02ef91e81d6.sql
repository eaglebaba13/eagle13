
-- 1. Enum for status
DO $$ BEGIN
  CREATE TYPE public.manual_payment_status AS ENUM
    ('CREATED','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','EXPIRED','CANCELED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Table
CREATE TABLE public.manual_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_reference text NOT NULL UNIQUE,
  requested_plan text NOT NULL CHECK (requested_plan IN ('pro','professional')),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
  expected_amount integer NOT NULL CHECK (expected_amount > 0),
  currency text NOT NULL DEFAULT 'INR',
  upi_id text NOT NULL,
  payee_name text,
  utr_number text,
  payment_date timestamptz,
  payment_app text,
  amount_paid integer,
  screenshot_url text,
  user_note text,
  admin_note text,
  rejection_reason text,
  status public.manual_payment_status NOT NULL DEFAULT 'CREATED',
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX manual_payment_requests_user_idx ON public.manual_payment_requests(user_id, status);
CREATE INDEX manual_payment_requests_status_idx ON public.manual_payment_requests(status, created_at DESC);
CREATE INDEX manual_payment_requests_utr_idx ON public.manual_payment_requests(utr_number) WHERE utr_number IS NOT NULL;

-- 3. Grants (writes go through SECURITY DEFINER RPCs only; SELECT is guarded by RLS)
GRANT SELECT ON public.manual_payment_requests TO authenticated;
GRANT ALL    ON public.manual_payment_requests TO service_role;

-- 4. RLS
ALTER TABLE public.manual_payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own manual payment requests"
  ON public.manual_payment_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- No INSERT/UPDATE/DELETE policies: every write goes through SECURITY DEFINER functions.

-- 5. updated_at trigger
CREATE TRIGGER trg_manual_payment_requests_updated_at
  BEFORE UPDATE ON public.manual_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Duplicate active request guard (partial unique index over "active" statuses)
CREATE UNIQUE INDEX manual_payment_active_unique_idx
  ON public.manual_payment_requests(user_id, requested_plan, billing_cycle)
  WHERE status IN ('CREATED','SUBMITTED','UNDER_REVIEW');

-- 7. Create request (server function passes server-resolved amount / UPI / reference)
CREATE OR REPLACE FUNCTION public.create_manual_payment_request(
  _plan text,
  _cycle text,
  _amount integer,
  _currency text,
  _upi_id text,
  _payee_name text,
  _reference text
) RETURNS public.manual_payment_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.manual_payment_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _plan NOT IN ('pro','professional') THEN RAISE EXCEPTION 'invalid_plan'; END IF;
  IF _cycle NOT IN ('monthly','annual')   THEN RAISE EXCEPTION 'invalid_cycle'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  -- Expire any prior stale active requests for this user first
  UPDATE public.manual_payment_requests
     SET status = 'EXPIRED', updated_at = now()
   WHERE user_id = uid
     AND status IN ('CREATED','SUBMITTED','UNDER_REVIEW')
     AND expires_at < now();

  INSERT INTO public.manual_payment_requests
    (user_id, payment_reference, requested_plan, billing_cycle,
     expected_amount, currency, upi_id, payee_name, status)
  VALUES
    (uid, _reference, _plan, _cycle,
     _amount, COALESCE(_currency,'INR'), _upi_id, _payee_name, 'CREATED')
  RETURNING * INTO row;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, new_value)
    VALUES (uid, uid, uid, 'manual_payment.created',
      jsonb_build_object('id', row.id, 'plan', _plan, 'cycle', _cycle,
                         'amount', _amount, 'reference', _reference));
  RETURN row;
END; $$;

-- 8. Submit UTR / proof
CREATE OR REPLACE FUNCTION public.submit_manual_payment_utr(
  _id uuid,
  _utr text,
  _payment_date timestamptz,
  _amount_paid integer,
  _payment_app text,
  _screenshot_url text,
  _user_note text
) RETURNS public.manual_payment_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur public.manual_payment_requests;
  updated public.manual_payment_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _utr IS NULL OR length(trim(_utr)) < 6 THEN RAISE EXCEPTION 'invalid_utr'; END IF;

  SELECT * INTO cur FROM public.manual_payment_requests
    WHERE id = _id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF cur.status NOT IN ('CREATED','SUBMITTED','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'invalid_state:%', cur.status;
  END IF;
  IF cur.expires_at < now() THEN
    UPDATE public.manual_payment_requests SET status='EXPIRED', updated_at=now()
      WHERE id=_id;
    RAISE EXCEPTION 'request_expired';
  END IF;

  UPDATE public.manual_payment_requests
     SET utr_number = trim(_utr),
         payment_date = _payment_date,
         amount_paid = _amount_paid,
         payment_app = _payment_app,
         screenshot_url = COALESCE(_screenshot_url, screenshot_url),
         user_note = _user_note,
         status = 'SUBMITTED',
         submitted_at = COALESCE(submitted_at, now()),
         updated_at = now()
   WHERE id = _id
   RETURNING * INTO updated;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, new_value)
    VALUES (uid, uid, uid, 'manual_payment.utr_submitted',
      jsonb_build_object('id', _id, 'utr', trim(_utr), 'amount_paid', _amount_paid));
  RETURN updated;
END; $$;

-- 9. Cancel own request
CREATE OR REPLACE FUNCTION public.cancel_manual_payment_request(_id uuid)
RETURNS public.manual_payment_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  updated public.manual_payment_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.manual_payment_requests
     SET status = 'CANCELED', updated_at = now()
   WHERE id = _id AND user_id = uid
     AND status IN ('CREATED','SUBMITTED','UNDER_REVIEW')
   RETURNING * INTO updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_cancelable'; END IF;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, new_value)
    VALUES (uid, uid, uid, 'manual_payment.canceled',
      jsonb_build_object('id', _id));
  RETURN updated;
END; $$;

-- 10. Admin: mark under review
CREATE OR REPLACE FUNCTION public.admin_mark_manual_payment_under_review(_id uuid)
RETURNS public.manual_payment_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id uuid := auth.uid();
  updated public.manual_payment_requests;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.manual_payment_requests
     SET status = 'UNDER_REVIEW', updated_at = now()
   WHERE id = _id AND status IN ('SUBMITTED','UNDER_REVIEW')
   RETURNING * INTO updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_reviewable'; END IF;
  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, new_value)
    VALUES (updated.user_id, admin_id, updated.user_id,
            'manual_payment.review_started', jsonb_build_object('id', _id));
  RETURN updated;
END; $$;

-- 11. Admin approve (atomic activation)
CREATE OR REPLACE FUNCTION public.admin_approve_manual_payment(
  _id uuid,
  _admin_note text
) RETURNS public.manual_payment_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id uuid := auth.uid();
  req public.manual_payment_requests;
  sub_cur public.subscriptions;
  period_start timestamptz := now();
  period_end   timestamptz;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO req FROM public.manual_payment_requests
    WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF req.status NOT IN ('SUBMITTED','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'invalid_state:%', req.status;
  END IF;
  IF req.utr_number IS NULL THEN RAISE EXCEPTION 'utr_missing'; END IF;

  period_end := CASE WHEN req.billing_cycle = 'annual'
                     THEN period_start + interval '1 year'
                     ELSE period_start + interval '1 month' END;

  SELECT * INTO sub_cur FROM public.subscriptions
    WHERE user_id = req.user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions(user_id, plan, status)
      VALUES (req.user_id, 'free', 'active')
      RETURNING * INTO sub_cur;
  END IF;

  -- If user already on a paid active/trialing plan with time left, extend from current_period_end
  IF sub_cur.status IN ('active','trialing')
     AND sub_cur.plan = req.requested_plan
     AND sub_cur.current_period_end IS NOT NULL
     AND sub_cur.current_period_end > now() THEN
    period_start := sub_cur.current_period_end;
    period_end := CASE WHEN req.billing_cycle = 'annual'
                       THEN period_start + interval '1 year'
                       ELSE period_start + interval '1 month' END;
  END IF;

  UPDATE public.subscriptions
     SET plan = req.requested_plan,
         status = 'active',
         provider = 'manual_upi',
         current_period_start = period_start,
         current_period_end = period_end,
         cancel_at_period_end = false,
         trial_end = NULL,
         updated_at = now()
   WHERE user_id = req.user_id;

  -- Ensure role reflects paid plan
  INSERT INTO public.user_roles(user_id, role)
    VALUES (req.user_id, req.requested_plan::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.manual_payment_requests
     SET status = 'APPROVED',
         verified_at = now(),
         verified_by = admin_id,
         admin_note = _admin_note,
         updated_at = now()
   WHERE id = _id
   RETURNING * INTO req;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, previous_value, new_value)
    VALUES (req.user_id, admin_id, req.user_id, 'manual_payment.approved',
            jsonb_build_object('plan', sub_cur.plan, 'status', sub_cur.status),
            jsonb_build_object('id', req.id, 'plan', req.requested_plan,
                               'cycle', req.billing_cycle, 'period_end', period_end));
  RETURN req;
END; $$;

-- 12. Admin reject
CREATE OR REPLACE FUNCTION public.admin_reject_manual_payment(
  _id uuid,
  _reason text
) RETURNS public.manual_payment_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id uuid := auth.uid();
  updated public.manual_payment_requests;
BEGIN
  IF admin_id IS NULL OR NOT public.has_role(admin_id,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE public.manual_payment_requests
     SET status = 'REJECTED',
         verified_at = now(),
         verified_by = admin_id,
         rejection_reason = _reason,
         updated_at = now()
   WHERE id = _id AND status IN ('SUBMITTED','UNDER_REVIEW')
   RETURNING * INTO updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_rejectable'; END IF;

  INSERT INTO public.audit_log(user_id, actor_user_id, target_user_id, event, new_value)
    VALUES (updated.user_id, admin_id, updated.user_id, 'manual_payment.rejected',
      jsonb_build_object('id', _id, 'reason', _reason));
  RETURN updated;
END; $$;

-- 13. Storage policies for private "payment-proofs" bucket.
-- Users may upload/read only files under their own uid folder; admins may read all.
CREATE POLICY "Users upload own payment proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users read own payment proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(),'admin')
    )
  );

CREATE POLICY "Users delete own unsubmitted proofs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
