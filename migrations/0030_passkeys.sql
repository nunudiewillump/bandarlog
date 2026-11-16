ALTER TABLE public.sessions ADD COLUMN assurance text NOT NULL DEFAULT 'legacy' CHECK(assurance IN ('legacy','activation','primary','mfa'));
--> statement-breakpoint
ALTER TABLE public.sessions ADD COLUMN primary_verified_at timestamptz;
--> statement-breakpoint
ALTER TABLE public.sessions ADD COLUMN mfa_verified_at timestamptz;
--> statement-breakpoint
CREATE TABLE bandarlog_api.security_configuration(id boolean PRIMARY KEY DEFAULT true CHECK(id),mfa_enforced boolean NOT NULL DEFAULT false);
--> statement-breakpoint
INSERT INTO bandarlog_api.security_configuration(id) VALUES(true);
--> statement-breakpoint
REVOKE ALL ON bandarlog_api.security_configuration FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.mfa_enforced() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT mfa_enforced FROM bandarlog_api.security_configuration WHERE id $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.mfa_enforced() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.mfa_enforced() TO bandarlog_http,bandarlog_identity_app;
--> statement-breakpoint
CREATE TABLE public.passkey_accounts(group_id text NOT NULL,user_id text NOT NULL PRIMARY KEY,webauthn_id text NOT NULL UNIQUE,FOREIGN KEY(group_id,user_id) REFERENCES public.users(group_id,id));
--> statement-breakpoint
CREATE TABLE public.passkeys(group_id text NOT NULL,user_id text NOT NULL,id text PRIMARY KEY,public_key text NOT NULL,counter bigint NOT NULL CHECK(counter BETWEEN 0 AND 4294967295),rp_id text NOT NULL,transports text NOT NULL,device_type text NOT NULL,backed_up boolean NOT NULL,name text NOT NULL,created_at timestamptz NOT NULL,last_used_at timestamptz,FOREIGN KEY(group_id,user_id) REFERENCES public.users(group_id,id));
--> statement-breakpoint
ALTER TABLE public.sessions ADD CONSTRAINT sessions_group_id_id_unique UNIQUE(group_id,id);
--> statement-breakpoint
CREATE TABLE public.passkey_challenges(group_id text NOT NULL,user_id text NOT NULL,id text PRIMARY KEY,session_id text NOT NULL,challenge text NOT NULL,origin text NOT NULL,rp_id text NOT NULL,purpose text NOT NULL CHECK(purpose IN ('register','authenticate')),expires timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(group_id,user_id) REFERENCES public.users(group_id,id),FOREIGN KEY(group_id,session_id) REFERENCES public.sessions(group_id,id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE public.passkey_recovery(group_id text NOT NULL,user_id text NOT NULL,id text PRIMARY KEY,created_at timestamptz NOT NULL,FOREIGN KEY(group_id,user_id) REFERENCES public.users(group_id,id));
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.passkey_actor(p_raw text,p_lock boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a jsonb; BEGIN
 IF p_raw IS NULL OR p_raw !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid session' USING ERRCODE='42501'; END IF;
 IF p_lock THEN
  PERFORM 1 FROM public.sessions s JOIN public.users u ON (u.group_id,u.id)=(s.group_id,s.user_id) WHERE s.id=encode(sha256(convert_to(p_raw,'UTF8')),'hex') AND s.group_id=bandarlog_api.signed_group() AND s.expires>statement_timestamp() AND s.absolute_expires_at>statement_timestamp() AND u.disabled_at IS NULL FOR UPDATE OF s,u;
 END IF;
 SELECT jsonb_build_object('id',u.id,'groupId',u.group_id,'name',u.name,'email',u.email,'sessionId',s.id,'csrf',s.csrf,'assurance',s.assurance,'createdAt',s.created_at,'primaryVerifiedAt',s.primary_verified_at,'mfaVerifiedAt',s.mfa_verified_at) INTO a FROM public.sessions s JOIN public.users u ON (u.group_id,u.id)=(s.group_id,s.user_id) WHERE s.id=encode(sha256(convert_to(p_raw,'UTF8')),'hex') AND s.group_id=bandarlog_api.signed_group() AND s.expires>statement_timestamp() AND s.absolute_expires_at>statement_timestamp() AND u.disabled_at IS NULL;
 IF a IS NULL THEN RAISE EXCEPTION 'invalid session' USING ERRCODE='42501'; END IF;RETURN a;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.passkey_actor(text,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.passkey_actor(text,boolean) TO bandarlog_identity_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.identity_actor_id() RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT bandarlog_api.passkey_actor(current_setting('bandarlog.auth_bearer',true))->>'id' $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.identity_actor_id() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.identity_actor_id() TO bandarlog_identity_app;

--> statement-breakpoint
ALTER TABLE public.passkey_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY identity_person ON public.passkey_accounts TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group()) AND user_id=(SELECT bandarlog_api.identity_actor_id())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()) AND user_id=(SELECT bandarlog_api.identity_actor_id()));
--> statement-breakpoint
GRANT SELECT,INSERT,DELETE ON public.passkey_accounts TO bandarlog_identity_app;

--> statement-breakpoint
ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY identity_person ON public.passkeys TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group()) AND user_id=(SELECT bandarlog_api.identity_actor_id())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()) AND user_id=(SELECT bandarlog_api.identity_actor_id()));
--> statement-breakpoint
GRANT SELECT,INSERT,DELETE ON public.passkeys TO bandarlog_identity_app;

--> statement-breakpoint
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY identity_person ON public.passkey_challenges TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group()) AND user_id=(SELECT bandarlog_api.identity_actor_id())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()) AND user_id=(SELECT bandarlog_api.identity_actor_id()));
--> statement-breakpoint
GRANT SELECT,INSERT,DELETE ON public.passkey_challenges TO bandarlog_identity_app;

--> statement-breakpoint
ALTER TABLE public.passkey_recovery ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY identity_person ON public.passkey_recovery TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group()) AND user_id=(SELECT bandarlog_api.identity_actor_id())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()) AND user_id=(SELECT bandarlog_api.identity_actor_id()));
--> statement-breakpoint
GRANT SELECT,INSERT,DELETE ON public.passkey_recovery TO bandarlog_identity_app;

--> statement-breakpoint
GRANT UPDATE(counter,last_used_at) ON public.passkeys TO bandarlog_identity_app;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.guard_identity_issuance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row jsonb:=to_jsonb(NEW); names text[]; name text; payload text; value text; key text;
BEGIN
 IF session_user<>'bandarlog_identity' OR current_setting('role',true)<>'bandarlog_identity_app' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='auth_challenges' THEN
  IF TG_OP='INSERT' AND NEW.verifier='' AND NEW.expires<statement_timestamp() AND NEW.requests=0 THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.id=OLD.id AND NEW.email=OLD.email AND NEW.google_link_id IS NOT DISTINCT FROM OLD.google_link_id AND NEW.expires=OLD.expires AND NEW.requested_at=OLD.requested_at AND NEW.requests=OLD.requests AND NEW.window_started_at=OLD.window_started_at AND (
    (NEW.verifier=OLD.verifier AND NEW.consumed_at IS NOT DISTINCT FROM OLD.consumed_at AND NEW.attempts=OLD.attempts+1 AND NEW.attempts<=5)
    OR (NEW.verifier='' AND OLD.consumed_at IS NULL AND NEW.consumed_at BETWEEN statement_timestamp()-interval '1 minute' AND statement_timestamp()+interval '5 seconds' AND NEW.attempts=OLD.attempts)
  ) THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='sessions' THEN
  PERFORM 1 FROM public.users WHERE group_id=NEW.group_id AND id=NEW.user_id AND disabled_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inactive account' USING ERRCODE='42501'; END IF;
 END IF;
 names:=CASE TG_TABLE_NAME
 WHEN 'notifications' THEN ARRAY['id','email','subject','body','html','status']
 WHEN 'passkey_accounts' THEN ARRAY['user_id','webauthn_id']
 WHEN 'passkeys' THEN CASE WHEN TG_OP='INSERT' THEN ARRAY['id','user_id','public_key','counter','rp_id','transports','device_type','backed_up','name','created_at'] ELSE ARRAY['id','counter','last_used_at'] END
 WHEN 'passkey_challenges' THEN ARRAY['id','user_id','session_id','challenge','origin','rp_id','purpose','expires']
 WHEN 'passkey_recovery' THEN ARRAY['id','user_id','created_at']
 WHEN 'tokens' THEN ARRAY['id','email','expires']
 WHEN 'sessions' THEN ARRAY['id','user_id','csrf','expires','absolute_expires_at','assurance','primary_verified_at','mfa_verified_at']
 WHEN 'auth_challenges' THEN ARRAY['email','id','verifier','expires','requested_at','window_started_at','requests','google_link_id']
 WHEN 'google_states' THEN ARRAY['id','browser','nonce','verifier','expires','handoff_challenge']
 WHEN 'google_links' THEN ARRAY['id','subject','email','expires']
 WHEN 'google_identities' THEN ARRAY['subject','user_id']
 WHEN 'google_handoffs' THEN ARRAY['id','challenge','user_id','google_subject','google_email','expires'] END;
 payload:=TG_TABLE_NAME||E'\n'||NEW.group_id||E'\n'||txid_current()::text;
 FOREACH name IN ARRAY names LOOP
  value:=row->>name;
  IF value IS NOT NULL AND (name='expires' OR name LIKE '%\_at') THEN value:=(extract(epoch FROM value::timestamptz)*1000)::bigint::text; END IF;
  payload:=payload||E'\n'||coalesce(value,'');
 END LOOP;
 SELECT secret INTO key FROM bandarlog_api.context_key WHERE id;
 IF key IS NULL OR current_setting('bandarlog.identity_proof',true) IS DISTINCT FROM bandarlog_api.context_hmac(payload,key) THEN RAISE EXCEPTION 'invalid credential issuance' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT ON public.passkey_accounts FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT OR UPDATE ON public.passkeys FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT ON public.passkey_challenges FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT ON public.passkey_recovery FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

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
 IF a IS NOT NULL AND bandarlog_api.mfa_enforced() AND NOT EXISTS(SELECT FROM public.sessions WHERE id=a->>'session' AND assurance='mfa' AND mfa_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'second factor required' USING ERRCODE='28000'; END IF;
 IF a IS NULL THEN RAISE EXCEPTION 'invalid session context' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.activate_group_proof(p_token text,p_session text,p_csrf text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE g jsonb; BEGIN
 g:=bandarlog_api.activate_group(encode(sha256(convert_to(p_token,'UTF8')),'hex'),p_session,p_csrf);
 IF g IS NOT NULL THEN UPDATE public.sessions SET assurance='activation' WHERE id=p_session AND group_id=g->>'id'; END IF;RETURN g;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.record_passkey_event(p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a jsonb;key text; BEGIN
 IF p_action NOT IN ('passkey.registered','passkey.verified','passkey.removed','passkey.recovery.used','passkey.recovery.rotated') THEN RAISE EXCEPTION 'invalid audit action' USING ERRCODE='22023'; END IF;
 a:=bandarlog_api.passkey_actor(current_setting('bandarlog.auth_bearer',true));
 SELECT secret INTO key FROM bandarlog_api.context_key WHERE id;
 IF current_setting('bandarlog.identity_proof',true) IS DISTINCT FROM bandarlog_api.context_hmac('passkey_audit'||E'\n'||(a->>'groupId')||E'\n'||txid_current()::text||E'\n'||(a->>'id')||E'\n'||p_action,key) THEN RAISE EXCEPTION 'invalid audit authority' USING ERRCODE='42501'; END IF;
 INSERT INTO bandarlog_api.security_audit(group_id,actor_id,action,target_id) VALUES(a->>'groupId',a->>'id',p_action,a->>'id');
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.record_passkey_event(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.record_passkey_event(text) TO bandarlog_identity_app;
--> statement-breakpoint
REVOKE DELETE ON public.passkeys,public.passkey_accounts,public.passkey_recovery FROM bandarlog_identity_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.clear_recovery(p_raw text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a jsonb:=bandarlog_api.passkey_actor(p_raw,true); BEGIN
 IF NOT EXISTS(SELECT FROM public.passkey_recovery WHERE user_id=a->>'id' AND group_id=a->>'groupId') THEN RETURN; END IF;
 IF a->>'assurance'<>'mfa' OR (a->>'mfaVerifiedAt')::timestamptz<statement_timestamp()-interval '15 minutes' THEN RAISE EXCEPTION 'recent authentication required' USING ERRCODE='28000'; END IF;
 DELETE FROM public.passkey_recovery WHERE user_id=a->>'id' AND group_id=a->>'groupId';
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.consume_recovery(p_raw text,p_code text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a jsonb:=bandarlog_api.passkey_actor(p_raw,true); BEGIN
 IF a->>'assurance'<>'primary' OR (a->>'primaryVerifiedAt')::timestamptz<statement_timestamp()-interval '10 minutes' OR p_code !~ '^[a-f0-9]{32}$' THEN RETURN false; END IF;
 DELETE FROM public.passkey_recovery WHERE user_id=a->>'id' AND group_id=a->>'groupId' AND id=encode(sha256(convert_to(p_code,'UTF8')),'hex');RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.remove_passkey(p_raw text,p_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a jsonb:=bandarlog_api.passkey_actor(p_raw,true); BEGIN
 IF a->>'assurance'<>'mfa' OR (a->>'mfaVerifiedAt')::timestamptz<statement_timestamp()-interval '15 minutes' THEN RAISE EXCEPTION 'recent authentication required' USING ERRCODE='28000'; END IF;
 IF (SELECT count(*) FROM public.passkeys WHERE user_id=a->>'id' AND group_id=a->>'groupId')<2 THEN RAISE EXCEPTION 'keep one passkey' USING ERRCODE='23514'; END IF;
 DELETE FROM public.passkeys WHERE user_id=a->>'id' AND group_id=a->>'groupId' AND id=p_id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.clear_recovery(text),bandarlog_api.consume_recovery(text,text),bandarlog_api.remove_passkey(text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.clear_recovery(text),bandarlog_api.consume_recovery(text,text),bandarlog_api.remove_passkey(text,text) TO bandarlog_identity_app;
