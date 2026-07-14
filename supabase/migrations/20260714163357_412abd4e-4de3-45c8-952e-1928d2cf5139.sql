
-- create_manual_payment_request accepts an untrusted amount from its caller,
-- so it must be reachable only from trusted server code (service_role).
REVOKE EXECUTE ON FUNCTION public.create_manual_payment_request(text,text,integer,text,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_manual_payment_request(text,text,integer,text,text,text,text) FROM anon, authenticated;
