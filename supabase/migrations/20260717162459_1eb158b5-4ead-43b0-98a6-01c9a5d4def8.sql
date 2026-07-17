REVOKE ALL ON FUNCTION public.gann_gap_upsert_prediction(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gann_gap_upsert_outcome(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gann_gap_upsert_prediction(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gann_gap_upsert_outcome(jsonb) TO authenticated, service_role;
