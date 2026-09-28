-- Phase 65 - Durable Decision History Persistence (Supabase)
-- Infrastructure only: preserves existing decision-history payload contracts.

CREATE TABLE IF NOT EXISTS public.decision_history_runs (
  run_id text PRIMARY KEY,
  decision_timestamp timestamptz NOT NULL,
  instrument text NOT NULL,
  spot double precision,
  decision text NOT NULL,
  confidence double precision,
  risk jsonb NOT NULL DEFAULT '{}'::jsonb,
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  formula_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decision_history_runs_timestamp_idx
  ON public.decision_history_runs (decision_timestamp ASC, run_id ASC);
CREATE INDEX IF NOT EXISTS decision_history_runs_instrument_idx
  ON public.decision_history_runs (instrument);

CREATE TABLE IF NOT EXISTS public.decision_history_outcomes (
  run_id text PRIMARY KEY,
  instrument text NOT NULL,
  decision text NOT NULL,
  decision_timestamp timestamptz NOT NULL,
  evaluated_at timestamptz NOT NULL,
  evaluation_horizon text NOT NULL,
  entry_reference_price double precision,
  future_price double precision,
  outcome_state text NOT NULL CHECK (outcome_state IN ('PENDING','WIN','LOSS','NEUTRAL','TIME_EXPIRED','CANCELLED','UNEVALUATED')),
  confidence double precision,
  formula_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decision_history_outcomes_evaluated_idx
  ON public.decision_history_outcomes (evaluated_at ASC, run_id ASC);
CREATE INDEX IF NOT EXISTS decision_history_outcomes_state_idx
  ON public.decision_history_outcomes (outcome_state);

CREATE TABLE IF NOT EXISTS public.decision_history_market_snapshots (
  snapshot_id text PRIMARY KEY,
  instrument text NOT NULL,
  observed_at timestamptz NOT NULL,
  price double precision,
  source_timestamp timestamptz,
  provider_alias text NOT NULL,
  data_quality text NOT NULL,
  freshness_ms integer,
  verified boolean NOT NULL DEFAULT false,
  persisted_at timestamptz NOT NULL,
  metadata_version text NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decision_history_market_snapshots_lookup_idx
  ON public.decision_history_market_snapshots (instrument, verified, observed_at ASC, snapshot_id ASC);
CREATE INDEX IF NOT EXISTS decision_history_market_snapshots_provider_idx
  ON public.decision_history_market_snapshots (provider_alias);

CREATE TABLE IF NOT EXISTS public.decision_history_lifecycle_executions (
  execution_id text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  snapshots_attempted integer NOT NULL DEFAULT 0,
  snapshots_stored integer NOT NULL DEFAULT 0,
  eligible_runs integer NOT NULL DEFAULT 0,
  evaluated_runs integer NOT NULL DEFAULT 0,
  skipped_runs integer NOT NULL DEFAULT 0,
  pending_runs integer NOT NULL DEFAULT 0,
  failed_runs integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('SUCCESS','PARTIAL','NO_WORK','DEGRADED','FAILED')),
  safe_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decision_history_lifecycle_executions_completed_idx
  ON public.decision_history_lifecycle_executions (completed_at ASC, execution_id ASC);

ALTER TABLE public.decision_history_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_history_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_history_market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_history_lifecycle_executions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.decision_history_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.decision_history_outcomes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.decision_history_market_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.decision_history_lifecycle_executions FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.decision_history_runs TO service_role;
GRANT ALL ON public.decision_history_outcomes TO service_role;
GRANT ALL ON public.decision_history_market_snapshots TO service_role;
GRANT ALL ON public.decision_history_lifecycle_executions TO service_role;
