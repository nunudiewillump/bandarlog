-- Additive capability boundary. Run ONLY with the independent migration identity.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bandarlog_runtime') THEN
    CREATE ROLE bandarlog_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
  END IF;
END $$;
--> statement-breakpoint
GRANT bandarlog_group_app TO bandarlog_runtime;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO bandarlog_runtime;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS bandarlog_api;
--> statement-breakpoint
REVOKE ALL ON SCHEMA bandarlog_api FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA bandarlog_api TO bandarlog_runtime;
--> statement-breakpoint


CREATE OR REPLACE FUNCTION bandarlog_api.resolve_group(p_key text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
SELECT to_jsonb(g) FROM public.scout_groups g WHERE g.private_id=p_key OR (p_key='legacy' AND g.id='rosales-702')
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.resolve_group(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.resolve_group(text) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.oauth_group(p_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
SELECT to_jsonb(g) FROM public.scout_groups g JOIN public.google_states s ON s.group_id=g.id WHERE s.id=p_hash AND s.expires>now()
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.oauth_group(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.oauth_group(text) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.entry_group(p_hash text, p_private text, p_legacy boolean) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
SELECT g.private_id FROM public.sessions s JOIN public.users u ON (u.group_id,u.id)=(s.group_id,s.user_id)
JOIN public.scout_groups g ON g.id=s.group_id WHERE s.id=p_hash AND s.expires>now() AND s.absolute_expires_at>now() AND u.disabled_at IS NULL
AND ((p_legacy AND g.id='rosales-702') OR (NOT p_legacy AND g.private_id=p_private)) LIMIT 1
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.entry_group(text, text, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.entry_group(text, text, boolean) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.job_groups(p_pending boolean, p_mail boolean) RETURNS SETOF jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
SELECT to_jsonb(g) FROM public.scout_groups g WHERE g.plan <> 'audit-archived' AND (NOT p_pending OR EXISTS
(SELECT 1 FROM public.notifications n WHERE n.group_id=g.id AND p_mail AND n.status='pending' AND n.attempts::integer<5)
OR EXISTS (SELECT 1 FROM public.push_outbox p WHERE p.group_id=g.id AND p.sent_at IS NULL))
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.job_groups(boolean, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.job_groups(boolean, boolean) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.update_group(p_actor text, p_name text, p_primary text, p_secondary text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
IF length(p_name) NOT BETWEEN 2 AND 100 OR p_primary !~ '^#[a-fA-F0-9]{6}$' OR p_secondary !~ '^#[a-fA-F0-9]{6}$' THEN RAISE EXCEPTION 'invalid group settings' USING ERRCODE='22023'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.users u JOIN public.sessions s ON (s.group_id,s.user_id)=(u.group_id,u.id) WHERE s.id=p_actor AND u.group_id=bandarlog_api.current_group() AND u.role='admin' AND u.disabled_at IS NULL AND s.expires>now() AND s.absolute_expires_at>now()) THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
UPDATE public.scout_groups SET name=p_name,color_primary=p_primary,color_secondary=p_secondary WHERE id=bandarlog_api.current_group();
END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.update_group(text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.update_group(text, text, text, text) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.push_keys(p_public text, p_private text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
INSERT INTO public.push_keys(id,public_key,private_key) VALUES('default',p_public,p_private) ON CONFLICT DO NOTHING;
RETURN (SELECT to_jsonb(k) FROM public.push_keys k WHERE id='default');
END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.push_keys(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.push_keys(text, text) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.queue_registration_mail(p_mail jsonb, p_email text, p_key text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
INSERT INTO public.platform_mail(id,dedupe,email,subject,body,html,status,created_at)
VALUES(gen_random_uuid()::text,p_key,p_email,left(p_mail->>'subject',200),left(p_mail->>'body',16000),left(p_mail->>'html',32000),
CASE WHEN p_mail->>'status'='pending' THEN 'pending' ELSE 'preview' END,now()) ON CONFLICT(dedupe) DO NOTHING
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.queue_registration_mail(jsonb, text, text) FROM PUBLIC;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.request_group(p_hash text, p_input jsonb, p_mail jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
IF p_hash !~ '^[a-f0-9]{64}$' OR length(p_input->>'groupName') NOT BETWEEN 2 AND 100 OR length(p_input->>'name') NOT BETWEEN 2 AND 100
OR length(p_input->>'email')>320 OR p_input->>'email' NOT LIKE '%@%' OR p_input->>'colorPrimary' !~ '^#[a-fA-F0-9]{6}$' OR p_input->>'colorSecondary' !~ '^#[a-fA-F0-9]{6}$' THEN RAISE EXCEPTION 'invalid registration' USING ERRCODE='22023'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(p_input->>'email',0));
IF (SELECT count(*) FROM public.group_registrations WHERE email=p_input->>'email' AND created_at>now()-interval '1 hour')>=3 THEN RETURN; END IF;
INSERT INTO public.group_registrations(id,email,name,group_name,color_primary,color_secondary,expires)
VALUES(p_hash,p_input->>'email',p_input->>'name',p_input->>'groupName',p_input->>'colorPrimary',p_input->>'colorSecondary',now()+interval '7 days') ON CONFLICT DO NOTHING;
PERFORM bandarlog_api.queue_registration_mail(p_mail,'darguinenagimenez@gmail.com','group-request-'||p_hash);
END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.request_group(text, jsonb, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.request_group(text, jsonb, jsonb) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.registration(p_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
SELECT to_jsonb(r)-'activation_id' FROM public.group_registrations r WHERE id=p_hash AND expires>now()
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.registration(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.registration(text) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.review_group(p_hash text, p_decision text, p_activation text, p_mail jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE r public.group_registrations; BEGIN
SELECT * INTO r FROM public.group_registrations WHERE id=p_hash AND expires>now() AND approved_at IS NULL AND rejected_at IS NULL AND consumed_at IS NULL FOR UPDATE;
IF NOT FOUND THEN RETURN false; END IF;
IF p_decision='reject' THEN
UPDATE public.group_registrations SET rejected_at=now() WHERE id=r.id;
PERFORM bandarlog_api.queue_registration_mail(p_mail,r.email,'group-rejected-'||r.id);
ELSIF p_decision='approve' AND p_activation ~ '^[a-f0-9]{64}$' THEN
UPDATE public.group_registrations SET approved_at=now(),activation_id=p_activation,expires=now()+interval '7 days' WHERE id=r.id;
PERFORM bandarlog_api.queue_registration_mail(p_mail,r.email,'group-approved-'||r.id);
ELSE RAISE EXCEPTION 'invalid review' USING ERRCODE='22023'; END IF;
RETURN true; END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.review_group(text, text, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.review_group(text, text, text, jsonb) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.activate_group(p_hash text, p_session text, p_csrf text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE r public.group_registrations; g public.scout_groups; uid text:=gen_random_uuid()::text; BEGIN
IF p_session !~ '^[a-f0-9]{64}$' OR p_csrf !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid session' USING ERRCODE='22023'; END IF;
SELECT * INTO r FROM public.group_registrations WHERE activation_id=p_hash AND expires>now() AND approved_at IS NOT NULL AND rejected_at IS NULL AND consumed_at IS NULL FOR UPDATE;
IF NOT FOUND THEN RETURN NULL; END IF;
INSERT INTO public.scout_groups(name,color_primary,color_secondary) VALUES(r.group_name,r.color_primary,r.color_secondary) RETURNING * INTO g;
INSERT INTO public.users(id,group_id,name,email,role) VALUES(uid,g.id,r.name,r.email,'admin');
INSERT INTO public.sessions(id,group_id,user_id,csrf,expires,absolute_expires_at) VALUES(p_session,g.id,uid,p_csrf,now()+interval '30 days',now()+interval '90 days');
UPDATE public.group_registrations SET consumed_at=now() WHERE id=r.id;
RETURN to_jsonb(g); END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.activate_group(text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.activate_group(text, text, text) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.claim_platform_mail() RETURNS SETOF jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
UPDATE public.platform_mail SET status='sending',next_attempt_at=now()+interval '15 minutes' WHERE id IN
(SELECT id FROM public.platform_mail WHERE (status='pending' OR (status='sending' AND next_attempt_at<=now())) AND attempts::integer<5 AND (next_attempt_at IS NULL OR next_attempt_at<=now()) ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED)
RETURNING to_jsonb(platform_mail)
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.claim_platform_mail() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.claim_platform_mail() TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.finish_platform_mail(p_id text, p_result jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
UPDATE public.platform_mail SET
status=CASE WHEN p_result->>'status' IN ('sent','pending','failed') THEN p_result->>'status' ELSE 'failed' END,
attempts=coalesce(p_result->>'attempts',attempts), sent_at=(p_result->>'sentAt')::timestamptz,
next_attempt_at=(p_result->>'nextAttemptAt')::timestamptz,provider_message_id=p_result->>'providerMessageId'
WHERE id=p_id AND status='sending'
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.finish_platform_mail(text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.finish_platform_mail(text, jsonb) TO bandarlog_runtime;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.platform_next() RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
SELECT min(coalesce(next_attempt_at,now())) FROM public.platform_mail WHERE status IN ('pending','sending') AND attempts::integer<5
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.platform_next() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.platform_next() TO bandarlog_runtime;
--> statement-breakpoint

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bandarlog_runtime;
--> statement-breakpoint
REVOKE ALL ON public.scout_groups,public.group_registrations,public.platform_mail,public.push_keys FROM bandarlog_group_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA bandarlog_api REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint


DO $$ BEGIN EXECUTE format('GRANT bandarlog_runtime TO %I',current_user); END $$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION bandarlog_api.update_group(text,text,text,text) TO bandarlog_group_app;
--> statement-breakpoint
--> statement-breakpoint
GRANT USAGE ON SCHEMA bandarlog_api TO bandarlog_group_app;

--> statement-breakpoint
-- No historical rows are changed. Missing context must fail future INSERTs.
DO $$ DECLARE t record; BEGIN
FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='group_id' LOOP
EXECUTE format('ALTER TABLE public.%I ALTER COLUMN group_id SET DEFAULT nullif(current_setting(''bandarlog.group_id'',true),'''')',t.table_name);
END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE bandarlog_api.context_key (id boolean PRIMARY KEY DEFAULT true CHECK(id), secret text NOT NULL CHECK(secret ~ '^[a-f0-9]{64}$'));
--> statement-breakpoint
REVOKE ALL ON bandarlog_api.context_key FROM PUBLIC, bandarlog_runtime, bandarlog_group_app;
--> statement-breakpoint
-- RFC 2104 HMAC-SHA256, using PostgreSQL core SHA256 (no extension required).
CREATE FUNCTION bandarlog_api.context_hmac(p_message text, p_secret text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE k bytea := decode(p_secret,'hex') || decode(repeat('00',32),'hex');
  inner_pad bytea := k; outer_pad bytea := k; i integer;
BEGIN
  FOR i IN 0..63 LOOP
    inner_pad := set_byte(inner_pad,i,get_byte(k,i)#54);
    outer_pad := set_byte(outer_pad,i,get_byte(k,i)#92);
  END LOOP;
  RETURN encode(sha256(outer_pad || sha256(inner_pad || convert_to(p_message,'UTF8'))),'hex');
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.context_hmac(text,text) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.current_group() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g text:=nullif(current_setting('bandarlog.group_id',true),'');
  deadline text:=current_setting('bandarlog.context_deadline',true);
  proof text:=current_setting('bandarlog.context_proof',true);
  key text;
BEGIN
  IF g IS NULL OR deadline IS NULL OR deadline !~ '^[0-9]{10}$' OR proof IS NULL THEN
    RAISE EXCEPTION 'invalid group context' USING ERRCODE='42501';
  END IF;
  IF deadline::bigint < extract(epoch from statement_timestamp()) OR deadline::bigint > extract(epoch from statement_timestamp())+310 THEN
    RAISE EXCEPTION 'expired group context' USING ERRCODE='42501';
  END IF;
  SELECT secret INTO key FROM bandarlog_api.context_key WHERE id;
  IF key IS NULL OR proof IS DISTINCT FROM bandarlog_api.context_hmac(g||E'\n'||deadline,key) THEN
    RAISE EXCEPTION 'invalid group context' USING ERRCODE='42501';
  END IF;
  RETURN g;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.current_group() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.current_group() TO bandarlog_runtime,bandarlog_group_app;
--> statement-breakpoint
DO $$ DECLARE t record; BEGIN
FOR t IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='group_isolation' LOOP
EXECUTE format('ALTER POLICY group_isolation ON public.%I USING(group_id=(SELECT bandarlog_api.current_group())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()))',t.tablename);
END LOOP;
END $$;
