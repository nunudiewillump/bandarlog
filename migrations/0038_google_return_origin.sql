-- Additive routing metadata. NULL retains the canonical origin for old binaries.
ALTER TABLE public.google_states ADD COLUMN return_origin text;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.guard_google_return_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE key text;
BEGIN
 IF NEW.return_origin IS NULL OR session_user<>'bandarlog_identity' OR current_setting('role',true)<>'bandarlog_identity_app' THEN RETURN NEW; END IF;
 SELECT secret INTO key FROM bandarlog_api.context_key WHERE id;
 IF key IS NULL OR current_setting('bandarlog.oauth_origin_proof',true) IS NULL OR current_setting('bandarlog.oauth_origin_proof',true) IS DISTINCT FROM
   bandarlog_api.context_hmac('google_state_origin'||E'\n'||NEW.group_id||E'\n'||txid_current()::text||E'\n'||NEW.id||E'\n'||NEW.return_origin,key)
 THEN RAISE EXCEPTION 'invalid return origin authority' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.guard_google_return_origin() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER guard_google_return_origin BEFORE INSERT ON public.google_states FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_google_return_origin();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 38 $$;
