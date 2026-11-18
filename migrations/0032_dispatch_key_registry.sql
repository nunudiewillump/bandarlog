CREATE TABLE bandarlog_api.dispatch_key_registry(id text PRIMARY KEY,fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
REVOKE ALL ON bandarlog_api.dispatch_key_registry FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.register_dispatch_key(p_id text,p_fingerprint text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_id !~ '^[a-zA-Z0-9_-]{1,40}$' OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid dispatch public metadata' USING ERRCODE='22023'; END IF;
 INSERT INTO bandarlog_api.dispatch_key_registry(id,fingerprint) VALUES(p_id,p_fingerprint) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT FROM bandarlog_api.dispatch_key_registry WHERE id=p_id AND fingerprint=p_fingerprint) THEN RAISE EXCEPTION 'dispatch key ID must not be reused' USING ERRCODE='23505'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.dispatch_key_fingerprint(p_id text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT fingerprint FROM bandarlog_api.dispatch_key_registry WHERE id=p_id $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.register_dispatch_key(text,text),bandarlog_api.dispatch_key_fingerprint(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.register_dispatch_key(text,text) TO bandarlog_delivery;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.dispatch_key_fingerprint(text) TO bandarlog_http,bandarlog_identity;
