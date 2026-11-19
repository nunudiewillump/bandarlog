-- Email codes and Google are sufficient authentication. Keep historical
-- credentials and sessions without granting the retired feature any authority.
UPDATE bandarlog_api.security_configuration SET mfa_enforced=false WHERE id;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.actor() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bearer text:=current_setting('bandarlog.session_token',true); a jsonb;
BEGIN
 IF bearer IS NULL OR bearer !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid session context' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('id',u.id,'role',u.role,'group',u.group_id,'session',s.id) INTO a
 FROM public.sessions s JOIN public.users u ON (u.group_id,u.id)=(s.group_id,s.user_id)
 WHERE s.id=encode(sha256(convert_to(bearer,'UTF8')),'hex') AND s.expires>statement_timestamp()
 AND s.absolute_expires_at>statement_timestamp() AND u.disabled_at IS NULL
 AND s.group_id=nullif(current_setting('bandarlog.group_id',true),'');
 IF a IS NULL THEN RAISE EXCEPTION 'invalid session context' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;
--> statement-breakpoint
REVOKE ALL ON public.passkeys,public.passkey_accounts,public.passkey_challenges,public.passkey_recovery FROM bandarlog_identity_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.passkey_actor(text,boolean),bandarlog_api.identity_actor_id(),bandarlog_api.record_passkey_event(text),bandarlog_api.clear_recovery(text),bandarlog_api.consume_recovery(text,text),bandarlog_api.remove_passkey(text,text) FROM bandarlog_identity_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 37 $$;
