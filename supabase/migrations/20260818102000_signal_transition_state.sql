-- Signal Transition State — tracks the current Decision Engine signal state
-- per instrument. Used for atomic transition detection.
-- Each (instrument, signal_scope) pair has exactly one authoritative current state.

CREATE TABLE IF NOT EXISTS public.signal_transition_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument text NOT NULL,
  signal_scope text NOT NULL DEFAULT 'DECISION_ENGINE',
  current_state text NOT NULL CHECK (current_state IN ('BUY', 'SELL', 'WAIT')),
  previous_state text CHECK (previous_state IN ('BUY', 'SELL', 'WAIT')),
  decision_action text NOT NULL,
  decision_run_id text NOT NULL,
  evaluated_at timestamptz NOT NULL,
  fingerprint text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signal_transition_state_instrument_scope_unique UNIQUE (instrument, signal_scope)
);

-- Permissions: service_role writes, authenticated reads
GRANT SELECT ON public.signal_transition_state TO authenticated;
GRANT ALL ON public.signal_transition_state TO service_role;
ALTER TABLE public.signal_transition_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_transition_state read authenticated"
  ON public.signal_transition_state FOR SELECT TO authenticated USING (true);

-- Atomic signal transition upsert RPC.
-- Compares current committed state with the expected previous state.
-- If the committed state does not match expectedPrevious, the transition is rejected
-- (returns transitioned=false). This prevents concurrent evaluations from both
-- claiming the same previous state.
CREATE OR REPLACE FUNCTION public.upsert_signal_transition(
  _instrument text,
  _signal_scope text,
  _expected_previous text,
  _new_state text,
  _decision_action text,
  _decision_run_id text,
  _evaluated_at timestamptz,
  _fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_state text;
  _actual_previous text;
  _transitioned boolean := false;
  _row record;
BEGIN
  -- Lock the row for this instrument+scope (or detect absence)
  SELECT current_state INTO _existing_state
  FROM public.signal_transition_state
  WHERE instrument = _instrument AND signal_scope = _signal_scope
  FOR UPDATE;

  IF _existing_state IS NULL THEN
    -- First evaluation: no previous state committed
    _actual_previous := NULL;
    _transitioned := false;
  ELSIF _existing_state = _new_state THEN
    -- Same state: no transition, but update provenance
    _actual_previous := _existing_state;
    _transitioned := false;
  ELSIF _expected_previous IS NOT NULL AND _existing_state <> _expected_previous THEN
    -- Concurrent modification: the committed state has changed since we read it.
    -- Reject the transition to prevent false alerts.
    _actual_previous := _existing_state;
    _transitioned := false;
  ELSE
    -- Genuine state change
    _actual_previous := _existing_state;
    _transitioned := true;
  END IF;

  -- Upsert the current state
  INSERT INTO public.signal_transition_state (
    instrument, signal_scope, current_state, previous_state,
    decision_action, decision_run_id, evaluated_at, fingerprint,
    updated_at
  ) VALUES (
    _instrument, _signal_scope, _new_state, _actual_previous,
    _decision_action, _decision_run_id, _evaluated_at, _fingerprint,
    now()
  )
  ON CONFLICT (instrument, signal_scope)
  DO UPDATE SET
    current_state = _new_state,
    previous_state = _actual_previous,
    decision_action = _decision_action,
    decision_run_id = _decision_run_id,
    evaluated_at = _evaluated_at,
    fingerprint = _fingerprint,
    updated_at = now();

  -- If transitioned, log the immutable event
  IF _transitioned THEN
    INSERT INTO public.signal_transition_events (
      instrument, signal_scope, previous_state, current_state,
      decision_action, decision_run_id, evaluated_at, fingerprint
    ) VALUES (
      _instrument, _signal_scope, _actual_previous, _new_state,
      _decision_action, _decision_run_id, _evaluated_at, _fingerprint
    );
  END IF;

  RETURN jsonb_build_object(
    'transitioned', _transitioned,
    'actual_previous', _actual_previous,
    'current_state', _new_state,
    'fingerprint', _fingerprint
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_signal_transition(text, text, text, text, text, text, timestamptz, text) FROM anon, public;

-- Immutable transition event log for audit trail
CREATE TABLE IF NOT EXISTS public.signal_transition_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument text NOT NULL,
  signal_scope text NOT NULL DEFAULT 'DECISION_ENGINE',
  previous_state text CHECK (previous_state IN ('BUY', 'SELL', 'WAIT')),
  current_state text NOT NULL CHECK (current_state IN ('BUY', 'SELL', 'WAIT')),
  decision_action text NOT NULL,
  decision_run_id text NOT NULL,
  evaluated_at timestamptz NOT NULL,
  fingerprint text NOT NULL,
  telegram_delivered boolean NOT NULL DEFAULT false,
  telegram_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_transition_events_instrument_idx
  ON public.signal_transition_events (instrument, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS signal_transition_events_fingerprint_idx
  ON public.signal_transition_events (fingerprint);
CREATE UNIQUE INDEX IF NOT EXISTS signal_transition_events_fingerprint_unique_idx
  ON public.signal_transition_events (fingerprint);

GRANT SELECT ON public.signal_transition_events TO authenticated;
GRANT ALL ON public.signal_transition_events TO service_role;
ALTER TABLE public.signal_transition_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_transition_events read authenticated"
  ON public.signal_transition_events FOR SELECT TO authenticated USING (true);

-- Update telegram delivery status (used after Telegram delivery attempt)
CREATE OR REPLACE FUNCTION public.update_signal_transition_event_delivery(
  _fingerprint text,
  _delivered boolean,
  _error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.signal_transition_events
  SET telegram_delivered = _delivered,
      telegram_error = _error
  WHERE id = (
    SELECT id
    FROM public.signal_transition_events
    WHERE fingerprint = _fingerprint
    ORDER BY created_at DESC
    LIMIT 1
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_signal_transition_event_delivery(text, boolean, text) FROM anon, public;
