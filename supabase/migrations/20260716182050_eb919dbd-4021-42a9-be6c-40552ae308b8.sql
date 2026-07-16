-- One-time admin bootstrap: grant the 'admin' app_role to the existing
-- authenticated user of this project. Uses ON CONFLICT DO NOTHING so it
-- is a no-op if the role is already present. Records an audit_log entry.
-- This migration is bootstrap-only; there is no permanent bypass and the
-- migration cannot re-apply (Supabase records migration idempotency).

DO $$
DECLARE
  target_user uuid := 'e7c5c2e8-a8b0-428a-8a34-40d3879a6b55';
  did_insert boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = target_user) THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (target_user, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    GET DIAGNOSTICS did_insert = ROW_COUNT;

    IF did_insert THEN
      INSERT INTO public.audit_log (user_id, actor_user_id, target_user_id, event, new_value, metadata)
        VALUES (
          target_user, target_user, target_user,
          'admin.role_bootstrapped',
          jsonb_build_object('role', 'admin'),
          jsonb_build_object('source', 'one_time_migration', 'reason', 'initial admin bootstrap for provider diagnostics')
        );
    END IF;
  END IF;
END $$;