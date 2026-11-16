-- Bind registration issuance to its complete serialized payload and a short deadline.
-- Using the original JSON text avoids ambiguities between JS and jsonb serialization.
CREATE FUNCTION bandarlog_api.request_group_proof_v2(p_hash text,p_input text,p_mail text,p_deadline bigint,p_proof text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE key text; stamp bigint:=(extract(epoch FROM statement_timestamp())*1000)::bigint;
BEGIN
 IF p_hash !~ '^[a-f0-9]{64}$' OR p_deadline<stamp OR p_deadline>stamp+60000
 OR octet_length(p_input)>16384 OR octet_length(p_mail)>524288 THEN
  RAISE EXCEPTION 'invalid registration issuance' USING ERRCODE='42501';
 END IF;
 SELECT secret INTO key FROM bandarlog_api.context_key WHERE id;
 IF key IS NULL OR p_proof IS DISTINCT FROM bandarlog_api.context_hmac('registration-v2'||E'\n'||p_hash||E'\n'||p_deadline::text||E'\n'||p_input||E'\n'||p_mail,key) THEN
  RAISE EXCEPTION 'invalid registration issuance' USING ERRCODE='42501';
 END IF;
 PERFORM bandarlog_api.request_group(p_hash,p_input::jsonb,p_mail::jsonb);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.request_group_proof_v2(text,text,text,bigint,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.request_group_proof_v2(text,text,text,bigint,text) TO bandarlog_identity;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION bandarlog_api.request_group_proof(text,jsonb,jsonb,text) FROM bandarlog_identity;
