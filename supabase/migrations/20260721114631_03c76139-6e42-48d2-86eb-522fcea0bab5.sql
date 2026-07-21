
CREATE TABLE public.morning_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key text NOT NULL UNIQUE,
  report_date date NOT NULL,
  report_type text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  version text NOT NULL,
  payload jsonb NOT NULL,
  data_quality text NOT NULL DEFAULT 'PARTIAL',
  generated_at timestamptz NOT NULL DEFAULT now(),
  delivery_status text NOT NULL DEFAULT 'PENDING',
  delivery_error text,
  delivery_attempts integer NOT NULL DEFAULT 0,
  telegram_message_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX morning_reports_report_date_idx ON public.morning_reports (report_date DESC);

GRANT SELECT ON public.morning_reports TO authenticated;
GRANT ALL ON public.morning_reports TO service_role;

ALTER TABLE public.morning_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read morning reports"
  ON public.morning_reports FOR SELECT TO authenticated USING (true);

CREATE TRIGGER morning_reports_set_updated_at
  BEFORE UPDATE ON public.morning_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
