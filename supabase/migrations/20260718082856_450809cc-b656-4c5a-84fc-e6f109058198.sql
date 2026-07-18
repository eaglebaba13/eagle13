
-- ============================================================
-- smart_alert_events
-- ============================================================
CREATE TABLE public.smart_alert_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  type TEXT NOT NULL,
  priority TEXT NOT NULL,
  instrument TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  trading_date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  rules_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT smart_alert_events_fingerprint_unique UNIQUE (user_id, fingerprint)
);

CREATE INDEX idx_smart_alert_events_user_generated ON public.smart_alert_events (user_id, generated_at DESC);
CREATE INDEX idx_smart_alert_events_user_unread ON public.smart_alert_events (user_id, generated_at DESC) WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX idx_smart_alert_events_user_type ON public.smart_alert_events (user_id, type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_alert_events TO authenticated;
GRANT ALL ON public.smart_alert_events TO service_role;

ALTER TABLE public.smart_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own alert events"
  ON public.smart_alert_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own alert events"
  ON public.smart_alert_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alert events"
  ON public.smart_alert_events FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alert events"
  ON public.smart_alert_events FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- smart_alert_subscriptions
-- ============================================================
CREATE TABLE public.smart_alert_subscriptions (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  types JSONB NOT NULL DEFAULT '{}'::jsonb,
  instruments JSONB NOT NULL DEFAULT '[]'::jsonb,
  minimum_priority TEXT NOT NULL DEFAULT 'LOW',
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours JSONB,
  cooldown_override_sec INTEGER,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_alert_subscriptions TO authenticated;
GRANT ALL ON public.smart_alert_subscriptions TO service_role;

ALTER TABLE public.smart_alert_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own alert subscription"
  ON public.smart_alert_subscriptions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- smart_alert_delivery_attempts
-- ============================================================
CREATE TABLE public.smart_alert_delivery_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.smart_alert_events(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  retryable BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms INTEGER,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_smart_alert_delivery_user ON public.smart_alert_delivery_attempts (user_id, attempted_at DESC);
CREATE INDEX idx_smart_alert_delivery_event ON public.smart_alert_delivery_attempts (event_id);

GRANT SELECT, INSERT ON public.smart_alert_delivery_attempts TO authenticated;
GRANT ALL ON public.smart_alert_delivery_attempts TO service_role;

ALTER TABLE public.smart_alert_delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own delivery attempts"
  ON public.smart_alert_delivery_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert their own delivery attempts"
  ON public.smart_alert_delivery_attempts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- smart_alert_engine_checkpoints
-- ============================================================
CREATE TABLE public.smart_alert_engine_checkpoints (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  previous JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprints JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_evaluated_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  rules_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_alert_engine_checkpoints TO authenticated;
GRANT ALL ON public.smart_alert_engine_checkpoints TO service_role;

ALTER TABLE public.smart_alert_engine_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own alert checkpoint"
  ON public.smart_alert_engine_checkpoints FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER trg_smart_alert_events_updated_at
  BEFORE UPDATE ON public.smart_alert_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_smart_alert_subscriptions_updated_at
  BEFORE UPDATE ON public.smart_alert_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_smart_alert_engine_checkpoints_updated_at
  BEFORE UPDATE ON public.smart_alert_engine_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
