
-- Revoke public/anon EXECUTE on all SECURITY DEFINER functions flagged by the linter,
-- then re-grant narrowly.

REVOKE EXECUTE ON FUNCTION public.admin_approve_referral(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reject_referral(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_referral_under_review(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_referral_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_referral_request(referral_broker, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_referral_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_subscription_notify() FROM PUBLIC, anon, authenticated;

-- User-facing referral RPCs require an authenticated session (functions still do
-- role checks internally for admin-only ones).
GRANT EXECUTE ON FUNCTION public.admin_approve_referral(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_referral(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_referral_under_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_referral_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_referral_request(referral_broker, text, text, text, text, boolean) TO authenticated;

-- Trigger notification helpers only need service_role; triggers themselves run as
-- table owner regardless of grants.
GRANT EXECUTE ON FUNCTION public.tg_referral_notify() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_subscription_notify() TO service_role;
