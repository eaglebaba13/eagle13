
-- Notification type enum
CREATE TYPE public.notification_type AS ENUM (
  'BUY_CE','BUY_PE','EXIT','HIGH_RISK',
  'REFERRAL_SUBMITTED','REFERRAL_APPROVED','REFERRAL_REJECTED',
  'TRIAL_EXPIRING','SUBSCRIPTION_EXPIRED'
);

-- Notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread
  ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_type
  ON public.notifications(user_id, type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER notifications_set_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC: mark one notification read
CREATE OR REPLACE FUNCTION public.mark_notification_read(_id uuid)
RETURNS public.notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.notifications;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.notifications
     SET read_at = COALESCE(read_at, now()), updated_at = now()
   WHERE id = _id AND user_id = uid
   RETURNING * INTO row;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN row;
END; $$;

-- RPC: mark all read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  WITH upd AS (
    UPDATE public.notifications
       SET read_at = now(), updated_at = now()
     WHERE user_id = uid AND read_at IS NULL
     RETURNING 1
  )
  SELECT COUNT(*) INTO n FROM upd;
  RETURN COALESCE(n, 0);
END; $$;

-- Trigger fn: referral_requests -> notifications
CREATE OR REPLACE FUNCTION public.tg_referral_notify()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications(user_id, type, title, body, link, payload)
    VALUES (
      NEW.user_id, 'REFERRAL_SUBMITTED',
      'Referral claim submitted',
      'Your INDmoney referral claim is now under review. We usually reply within 24 hours.',
      '/referrals',
      jsonb_build_object('referral_id', NEW.id, 'status', NEW.status)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'APPROVED' THEN
      INSERT INTO public.notifications(user_id, type, title, body, link, payload)
      VALUES (
        NEW.user_id, 'REFERRAL_APPROVED',
        'Referral approved — 7 days Pro added',
        COALESCE(NEW.admin_note,'Your referral was approved and 7 days of Pro were added to your subscription.'),
        '/referrals',
        jsonb_build_object('referral_id', NEW.id)
      );
    ELSIF NEW.status = 'REJECTED' THEN
      INSERT INTO public.notifications(user_id, type, title, body, link, payload)
      VALUES (
        NEW.user_id, 'REFERRAL_REJECTED',
        'Referral claim rejected',
        COALESCE(NEW.rejection_reason,'Your referral claim could not be verified.'),
        '/referrals',
        jsonb_build_object('referral_id', NEW.id, 'reason', NEW.rejection_reason)
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER referral_notify_ins
  AFTER INSERT ON public.referral_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_referral_notify();

CREATE TRIGGER referral_notify_upd
  AFTER UPDATE ON public.referral_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_referral_notify();

-- Trigger fn: subscriptions -> notifications (expiry / cancel)
CREATE OR REPLACE FUNCTION public.tg_subscription_notify()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('expired','canceled') THEN
    INSERT INTO public.notifications(user_id, type, title, body, link, payload)
    VALUES (
      NEW.user_id, 'SUBSCRIPTION_EXPIRED',
      CASE WHEN NEW.status = 'expired' THEN 'Subscription expired'
           ELSE 'Subscription canceled' END,
      'Your paid plan is no longer active. Renew to keep Pro features.',
      '/billing',
      jsonb_build_object('previous_plan', OLD.plan, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER subscription_notify_upd
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_subscription_notify();
