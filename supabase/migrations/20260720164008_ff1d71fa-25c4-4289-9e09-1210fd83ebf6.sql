
REVOKE EXECUTE ON FUNCTION public.admin_approve_manual_payment(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_manual_payment_under_review(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reject_manual_payment(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_manual_payment_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_manual_payment_utr(uuid, text, timestamp with time zone, integer, text, text, text) FROM PUBLIC, anon;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='manual_payment_requests' AND policyname='No direct inserts on manual_payment_requests') THEN
    EXECUTE $p$CREATE POLICY "No direct inserts on manual_payment_requests" ON public.manual_payment_requests FOR INSERT TO authenticated, anon WITH CHECK (false)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='manual_payment_requests' AND policyname='No direct updates on manual_payment_requests') THEN
    EXECUTE $p$CREATE POLICY "No direct updates on manual_payment_requests" ON public.manual_payment_requests FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false)$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='manual_payment_requests' AND policyname='No direct deletes on manual_payment_requests') THEN
    EXECUTE $p$CREATE POLICY "No direct deletes on manual_payment_requests" ON public.manual_payment_requests FOR DELETE TO authenticated, anon USING (false)$p$;
  END IF;
END$$;

DROP POLICY IF EXISTS "Users can update their own alert events" ON public.smart_alert_events;
CREATE POLICY "Users and admins can update alert events"
  ON public.smart_alert_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
