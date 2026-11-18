-- has_role is used by authenticated admin checks and existing RLS policies.
-- Revoking PUBLIC execution also removed inherited access for these roles.
-- This restores execution only; role assignment and RLS policies are unchanged.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
