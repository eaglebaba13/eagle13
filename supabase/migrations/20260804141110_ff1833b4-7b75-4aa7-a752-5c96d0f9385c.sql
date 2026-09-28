CREATE TABLE IF NOT EXISTS public.provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  credential_type text NOT NULL,
  encrypted_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  CONSTRAINT provider_credentials_unique UNIQUE (provider, credential_type)
);

CREATE TABLE IF NOT EXISTS public.provider_credential_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  field text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.provider_credentials TO service_role;
GRANT ALL ON public.provider_credential_audit TO service_role;

ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_credential_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_credentials_service_role_all ON public.provider_credentials;
CREATE POLICY provider_credentials_service_role_all ON public.provider_credentials
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS provider_credential_audit_service_role_all ON public.provider_credential_audit;
CREATE POLICY provider_credential_audit_service_role_all ON public.provider_credential_audit
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);