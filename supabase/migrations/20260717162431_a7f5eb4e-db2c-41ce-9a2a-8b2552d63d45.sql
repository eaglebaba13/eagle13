-- Phase 2I-C — Gann Gap Outlook persistence (research only, non-critical module).

CREATE TABLE IF NOT EXISTS public.gann_gap_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id text NOT NULL UNIQUE,
  trading_date date NOT NULL,
  next_trading_date date,
  lifecycle text NOT NULL,
  base_outlook text NOT NULL,
  confidence_band text,
  reference_price numeric,
  previous_close numeric,
  relevant_level numeric,
  lower_level numeric,
  upper_level numeric,
  distance_points numeric,
  distance_pct numeric,
  closing_zone jsonb,
  confirmations jsonb NOT NULL DEFAULT '[]'::jsonb,
  capability jsonb,
  source text,
  provider_alias text,
  formula_version text NOT NULL,
  config_version text NOT NULL,
  calendar_provenance jsonb,
  frozen_at timestamptz,
  evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trading_date, formula_version, config_version)
);

GRANT SELECT ON public.gann_gap_predictions TO authenticated;
GRANT ALL ON public.gann_gap_predictions TO service_role;
ALTER TABLE public.gann_gap_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gann_gap_predictions read authenticated"
  ON public.gann_gap_predictions FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.gann_gap_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id text NOT NULL REFERENCES public.gann_gap_predictions(prediction_id) ON DELETE CASCADE,
  prediction_trading_date date NOT NULL,
  outcome_trading_date date NOT NULL,
  previous_close numeric,
  next_open numeric,
  gap_points numeric,
  gap_percent numeric,
  actual_outcome text NOT NULL,
  source text,
  provider_alias text,
  capability jsonb,
  outcome_rule_version text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prediction_id, outcome_rule_version)
);

GRANT SELECT ON public.gann_gap_outcomes TO authenticated;
GRANT ALL ON public.gann_gap_outcomes TO service_role;
ALTER TABLE public.gann_gap_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gann_gap_outcomes read authenticated"
  ON public.gann_gap_outcomes FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.gann_gap_scheduler_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  last_run_kind text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.gann_gap_scheduler_state TO authenticated;
GRANT ALL ON public.gann_gap_scheduler_state TO service_role;
ALTER TABLE public.gann_gap_scheduler_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gann_gap_scheduler_state read authenticated"
  ON public.gann_gap_scheduler_state FOR SELECT TO authenticated USING (true);

-- Idempotent freeze helper (SECURITY DEFINER; admin-only for correction).
CREATE OR REPLACE FUNCTION public.gann_gap_upsert_prediction(_row jsonb)
RETURNS public.gann_gap_predictions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  existing public.gann_gap_predictions;
  inserted public.gann_gap_predictions;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO existing FROM public.gann_gap_predictions
    WHERE trading_date = (_row->>'trading_date')::date
      AND formula_version = _row->>'formula_version'
      AND config_version  = _row->>'config_version';

  IF FOUND THEN
    -- Immutable once frozen; return existing row unchanged.
    RETURN existing;
  END IF;

  INSERT INTO public.gann_gap_predictions (
    prediction_id, trading_date, next_trading_date, lifecycle, base_outlook,
    confidence_band, reference_price, previous_close, relevant_level,
    lower_level, upper_level, distance_points, distance_pct, closing_zone,
    confirmations, capability, source, provider_alias,
    formula_version, config_version, calendar_provenance, frozen_at, evaluated_at
  ) VALUES (
    _row->>'prediction_id',
    (_row->>'trading_date')::date,
    NULLIF(_row->>'next_trading_date','')::date,
    _row->>'lifecycle',
    _row->>'base_outlook',
    NULLIF(_row->>'confidence_band',''),
    NULLIF(_row->>'reference_price','')::numeric,
    NULLIF(_row->>'previous_close','')::numeric,
    NULLIF(_row->>'relevant_level','')::numeric,
    NULLIF(_row->>'lower_level','')::numeric,
    NULLIF(_row->>'upper_level','')::numeric,
    NULLIF(_row->>'distance_points','')::numeric,
    NULLIF(_row->>'distance_pct','')::numeric,
    COALESCE(_row->'closing_zone','null'::jsonb),
    COALESCE(_row->'confirmations','[]'::jsonb),
    COALESCE(_row->'capability','null'::jsonb),
    NULLIF(_row->>'source',''),
    NULLIF(_row->>'provider_alias',''),
    _row->>'formula_version',
    _row->>'config_version',
    COALESCE(_row->'calendar_provenance','null'::jsonb),
    NULLIF(_row->>'frozen_at','')::timestamptz,
    NULLIF(_row->>'evaluated_at','')::timestamptz
  ) RETURNING * INTO inserted;

  RETURN inserted;
END; $$;

CREATE OR REPLACE FUNCTION public.gann_gap_upsert_outcome(_row jsonb)
RETURNS public.gann_gap_outcomes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  existing public.gann_gap_outcomes;
  inserted public.gann_gap_outcomes;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO existing FROM public.gann_gap_outcomes
    WHERE prediction_id = _row->>'prediction_id'
      AND outcome_rule_version = _row->>'outcome_rule_version';
  IF FOUND THEN RETURN existing; END IF;

  INSERT INTO public.gann_gap_outcomes (
    prediction_id, prediction_trading_date, outcome_trading_date,
    previous_close, next_open, gap_points, gap_percent,
    actual_outcome, source, provider_alias, capability, outcome_rule_version
  ) VALUES (
    _row->>'prediction_id',
    (_row->>'prediction_trading_date')::date,
    (_row->>'outcome_trading_date')::date,
    NULLIF(_row->>'previous_close','')::numeric,
    NULLIF(_row->>'next_open','')::numeric,
    NULLIF(_row->>'gap_points','')::numeric,
    NULLIF(_row->>'gap_percent','')::numeric,
    _row->>'actual_outcome',
    NULLIF(_row->>'source',''),
    NULLIF(_row->>'provider_alias',''),
    COALESCE(_row->'capability','null'::jsonb),
    _row->>'outcome_rule_version'
  ) RETURNING * INTO inserted;

  RETURN inserted;
END; $$;

CREATE TRIGGER trg_gann_gap_predictions_updated
  BEFORE UPDATE ON public.gann_gap_predictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
