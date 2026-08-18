create table if not exists public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  credential_type text not null,
  encrypted_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  enabled boolean not null default true,
  expires_at timestamptz,
  constraint provider_credentials_unique unique (provider, credential_type)
);

create table if not exists public.provider_credential_audit (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  field text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.provider_credentials enable row level security;
alter table public.provider_credential_audit enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_credentials'
      and policyname = 'provider_credentials_service_role_write'
  ) then
    create policy provider_credentials_service_role_write
      on public.provider_credentials
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_credentials'
      and policyname = 'provider_credentials_service_role_read'
  ) then
    create policy provider_credentials_service_role_read
      on public.provider_credentials
      for select
      using (auth.role() = 'service_role');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_credential_audit'
      and policyname = 'provider_credential_audit_service_role_write'
  ) then
    create policy provider_credential_audit_service_role_write
      on public.provider_credential_audit
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_credential_audit'
      and policyname = 'provider_credential_audit_service_role_read'
  ) then
    create policy provider_credential_audit_service_role_read
      on public.provider_credential_audit
      for select
      using (auth.role() = 'service_role');
  end if;
end
$$;