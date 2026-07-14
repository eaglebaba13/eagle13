
-- Phase 20.2: subscription lifecycle, usage counters, billing events

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_end timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS provider_subscription_id text;

-- Usage counters (per user, per resource, per period)
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource text NOT NULL,
  period text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource, period)
);
GRANT SELECT, INSERT, UPDATE ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own usage" ON public.usage_counters;
CREATE POLICY "Users read own usage" ON public.usage_counters FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users write own usage" ON public.usage_counters;
CREATE POLICY "Users write own usage" ON public.usage_counters FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own usage" ON public.usage_counters;
CREATE POLICY "Users update own usage" ON public.usage_counters FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Billing events (webhook idempotency + replay protection)
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);
GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
-- Only service_role writes billing events (no client policy for INSERT/UPDATE).
DROP POLICY IF EXISTS "Users read own billing events" ON public.billing_events;
CREATE POLICY "Users read own billing events" ON public.billing_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Local-migration idempotency
CREATE TABLE IF NOT EXISTS public.local_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  migration_key text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, migration_key)
);
GRANT SELECT, INSERT ON public.local_migrations TO authenticated;
GRANT ALL ON public.local_migrations TO service_role;
ALTER TABLE public.local_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own migrations" ON public.local_migrations;
CREATE POLICY "Users read own migrations" ON public.local_migrations FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own migrations" ON public.local_migrations;
CREATE POLICY "Users insert own migrations" ON public.local_migrations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
