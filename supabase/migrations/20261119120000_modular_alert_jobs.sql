create table public.modular_alert_settings (
  job text primary key,
  enabled boolean not null default false,
  schedule text not null check (schedule = '' or schedule ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  cooldown_minutes integer not null check (cooldown_minutes between 0 and 1440)
);

create table public.modular_alert_claims (
  user_id uuid not null references auth.users(id),
  job text not null,
  fingerprint text not null,
  event_version text,
  claimed_at timestamptz not null default now(),
  status text not null default 'CLAIMED',
  primary key (user_id, job, fingerprint)
);
create index modular_alert_claims_recent on public.modular_alert_claims (user_id, job, claimed_at desc);
alter table public.modular_alert_settings enable row level security;
alter table public.modular_alert_claims enable row level security;
revoke all on public.modular_alert_settings, public.modular_alert_claims from anon, authenticated;
grant select, insert, update on public.modular_alert_settings, public.modular_alert_claims to service_role;

create function public.claim_modular_alert(
  p_user uuid, p_job text, p_key text, p_version text, p_cooldown integer
) returns text language plpgsql set search_path = '' as $$
declare
  latest_at timestamptz;
  previous_version text;
  claim_key text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user::text), pg_catalog.hashtext(p_job));
  select claimed_at into latest_at from public.modular_alert_claims
    where user_id = p_user and job = p_job and fingerprint not like 'test:%'
    order by claimed_at desc limit 1;
  if latest_at > now() - pg_catalog.make_interval(mins => p_cooldown) then return null; end if;
  claim_key := p_key;
  if p_version is not null and p_key = '' then
    select event_version into previous_version from public.modular_alert_claims
      where user_id = p_user and job = p_job and event_version is not null
      order by claimed_at desc limit 1;
    if previous_version = p_version then return null; end if;
    claim_key := 'change:' || pg_catalog.gen_random_uuid()::text;
  end if;
  insert into public.modular_alert_claims(user_id, job, fingerprint, event_version)
    values (p_user, p_job, claim_key, p_version) on conflict do nothing;
  if found then return claim_key; end if;
  return null;
end;
$$;
revoke all on function public.claim_modular_alert(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_modular_alert(uuid, text, text, text, integer) to service_role;
