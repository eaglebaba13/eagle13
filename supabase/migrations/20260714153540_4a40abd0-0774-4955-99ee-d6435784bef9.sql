
REVOKE EXECUTE ON FUNCTION public.self_start_trial(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.self_set_cancel_at_period_end(boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.consume_usage(text,text,integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_change_plan(uuid,text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_status(uuid,text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_extend_trial(uuid,integer,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_grant_entitlement(uuid,text,timestamptz,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_entitlement(uuid,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_reset_usage(uuid,text,text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_entitlement_snapshot(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.validate_subscription_transition(text,text) FROM anon, public;
