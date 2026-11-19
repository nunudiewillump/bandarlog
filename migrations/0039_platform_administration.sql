-- Platform identities have NO foreign key to a scout group or group user.
CREATE TABLE bandarlog_api.platform_admins (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 email text NOT NULL UNIQUE CHECK(email=lower(email)), name text NOT NULL,
 enabled boolean NOT NULL DEFAULT true, google_subject text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
--> statement-breakpoint

CREATE TABLE bandarlog_api.platform_sessions (
 id text PRIMARY KEY, admin_id text NOT NULL REFERENCES bandarlog_api.platform_admins(id), csrf text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 expires timestamptz NOT NULL DEFAULT statement_timestamp()+interval '30 minutes',
 absolute_expires timestamptz NOT NULL DEFAULT statement_timestamp()+interval '8 hours'
);
--> statement-breakpoint

CREATE INDEX platform_sessions_expiry ON bandarlog_api.platform_sessions(expires);
--> statement-breakpoint

CREATE TABLE bandarlog_api.platform_codes (
 email_key text PRIMARY KEY, id text UNIQUE, admin_id text REFERENCES bandarlog_api.platform_admins(id),
 verifier text, requested_at timestamptz, window_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 requests integer NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0,
 consumed boolean NOT NULL DEFAULT false, claim text
);
--> statement-breakpoint

CREATE TABLE bandarlog_api.platform_oauth (
 id text PRIMARY KEY, browser text NOT NULL, verifier text NOT NULL, nonce text NOT NULL, previous_session text,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(), consumed_at timestamptz, issued boolean NOT NULL DEFAULT false
);
--> statement-breakpoint

CREATE TABLE bandarlog_api.platform_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at timestamptz NOT NULL DEFAULT statement_timestamp(),
 admin_id text REFERENCES bandarlog_api.platform_admins(id), action text NOT NULL, target text, reason text
);
--> statement-breakpoint

CREATE INDEX platform_audit_time ON bandarlog_api.platform_audit(at,id);
--> statement-breakpoint

CREATE TABLE bandarlog_api.platform_decisions (
 request_id text PRIMARY KEY REFERENCES public.group_registrations(id),
 decision text NOT NULL CHECK(decision IN ('approve','reject')), reason text NOT NULL,
 admin_id text NOT NULL REFERENCES bandarlog_api.platform_admins(id), at timestamptz NOT NULL DEFAULT statement_timestamp()
);
--> statement-breakpoint

REVOKE ALL ON bandarlog_api.platform_admins,bandarlog_api.platform_sessions,bandarlog_api.platform_codes,
 bandarlog_api.platform_oauth,bandarlog_api.platform_audit,bandarlog_api.platform_decisions FROM PUBLIC;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_proof(p_action text,p_body text,p_deadline bigint,p_proof text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k text;
BEGIN
 IF session_user<>'bandarlog_identity' OR length(p_body)>128000 OR p_deadline<extract(epoch FROM statement_timestamp())*1000
 OR p_deadline>extract(epoch FROM statement_timestamp())*1000+60000 THEN RAISE EXCEPTION 'invalid authority' USING ERRCODE='42501'; END IF;
 SELECT secret INTO k FROM bandarlog_api.context_key WHERE id;
 IF k IS NULL OR p_proof IS NULL OR p_proof IS DISTINCT FROM bandarlog_api.context_hmac('platform-v1'||E'\n'||p_action||E'\n'||p_deadline::text||E'\n'||p_body,k)
 THEN RAISE EXCEPTION 'invalid authority' USING ERRCODE='42501'; END IF;
 RETURN p_body::jsonb;
END $$;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_issue(p_admin text,p_id text,p_csrf text,p_method text,p_previous text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_id !~ '^[a-f0-9]{64}$' OR p_csrf !~ '^[a-f0-9]{64}$' OR NOT EXISTS(SELECT FROM bandarlog_api.platform_admins WHERE id=p_admin AND enabled)
 THEN RAISE EXCEPTION 'invalid identity' USING ERRCODE='42501'; END IF;
 DELETE FROM bandarlog_api.platform_sessions WHERE id=p_previous AND admin_id=p_admin;
 INSERT INTO bandarlog_api.platform_sessions(id,admin_id,csrf) VALUES(p_id,p_admin,p_csrf);
 INSERT INTO bandarlog_api.platform_audit(admin_id,action) VALUES(p_admin,'login.'||p_method);
 RETURN jsonb_build_object('ok',true);
END $$;
--> statement-breakpoint

-- A closed authentication protocol, not an SQL executor. Each payload is MAC-bound
-- to its action and deadline; session issuance is called only after verification.
CREATE FUNCTION bandarlog_api.platform_admin_auth(p_action text,p_body text,p_deadline bigint,p_proof text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb; c bandarlog_api.platform_codes; o bandarlog_api.platform_oauth; a bandarlog_api.platform_admins; wait integer;
BEGIN
 b:=bandarlog_api.platform_admin_proof(p_action,p_body,p_deadline,p_proof);
 IF p_action='code.prepare' THEN
  IF b->>'key' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid key'; END IF;
  INSERT INTO bandarlog_api.platform_codes(email_key) VALUES(b->>'key') ON CONFLICT DO NOTHING;
  SELECT * INTO c FROM bandarlog_api.platform_codes WHERE email_key=b->>'key';
  RETURN jsonb_build_object('requestedAt',c.requested_at,'windowAt',c.window_at,'requests',c.requests);
 ELSIF p_action='code.request' THEN
  SELECT * INTO c FROM bandarlog_api.platform_codes WHERE email_key=b->>'key' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'missing request'; END IF;
  wait:=ceil(extract(epoch FROM c.requested_at+interval '60 seconds'-statement_timestamp()));
  IF wait>0 OR (c.window_at>statement_timestamp()-interval '15 minutes' AND c.requests>=5) THEN
   RETURN jsonb_build_object('requestedAt',c.requested_at,'retryAfter',greatest(1,coalesce(wait,0),CASE WHEN c.requests>=5 THEN ceil(extract(epoch FROM c.window_at+interval '15 minutes'-statement_timestamp()))::integer ELSE 0 END));
  END IF;
  IF b->>'id' !~ '^[a-f0-9]{64}$' OR b->>'verifier' !~ '^pbkdf2-v2:[a-f0-9]{64}$'
   OR abs(extract(epoch FROM (b->>'at')::timestamptz-statement_timestamp()))>30 THEN RAISE EXCEPTION 'invalid request'; END IF;
  SELECT * INTO a FROM bandarlog_api.platform_admins WHERE email=b->>'email' AND enabled;
  UPDATE bandarlog_api.platform_codes SET id=b->>'id',admin_id=a.id,verifier=b->>'verifier',
   requested_at=(b->>'at')::timestamptz, window_at=CASE WHEN c.window_at<statement_timestamp()-interval '15 minutes' THEN statement_timestamp() ELSE c.window_at END,
   requests=CASE WHEN c.window_at<statement_timestamp()-interval '15 minutes' THEN 1 ELSE c.requests+1 END,attempts=0,consumed=false,claim=NULL WHERE email_key=c.email_key;
  IF a.id IS NOT NULL THEN PERFORM bandarlog_api.queue_registration_mail((b->>'mail')::jsonb,a.email,'platform-code-'||(b->>'id')); END IF;
  RETURN jsonb_build_object('queued',a.id IS NOT NULL,'requestedAt',b->>'at');
 ELSIF p_action='code.claim' THEN
  UPDATE bandarlog_api.platform_codes SET attempts=attempts+1,claim=b->>'claim'
  WHERE id=b->>'id' AND requested_at>statement_timestamp()-interval '10 minutes' AND NOT consumed AND attempts<5 RETURNING * INTO c;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO a FROM bandarlog_api.platform_admins WHERE id=c.admin_id AND enabled;
  RETURN jsonb_build_object('verifier',c.verifier,'email',a.email);
 ELSIF p_action='code.finish' THEN
  UPDATE bandarlog_api.platform_codes SET consumed=true,claim=NULL
  WHERE id=b->>'id' AND claim=b->>'claim' AND NOT consumed AND attempts<=5
   AND requested_at>statement_timestamp()-interval '10 minutes' RETURNING * INTO c;
  IF NOT FOUND OR c.admin_id IS NULL THEN RAISE EXCEPTION 'invalid code' USING ERRCODE='28000'; END IF;
  RETURN bandarlog_api.platform_admin_issue(c.admin_id,b->>'session',b->>'csrf','email',b->>'previous');
 ELSIF p_action='google.start' THEN
  IF b->>'id' !~ '^[a-f0-9]{64}$' OR b->>'browser' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid state'; END IF;
  INSERT INTO bandarlog_api.platform_oauth(id,browser,verifier,nonce,previous_session) VALUES(b->>'id',b->>'browser',b->>'verifier',b->>'nonce',b->>'previous'); RETURN jsonb_build_object('ok',true);
 ELSIF p_action='google.consume' THEN
  UPDATE bandarlog_api.platform_oauth SET consumed_at=statement_timestamp()
  WHERE id=b->>'id' AND browser=b->>'browser' AND created_at>statement_timestamp()-interval '10 minutes' AND consumed_at IS NULL RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid state' USING ERRCODE='28000'; END IF;
  RETURN jsonb_build_object('verifier',o.verifier,'nonce',o.nonce);
 ELSIF p_action='google.finish' THEN
  UPDATE bandarlog_api.platform_oauth SET issued=true WHERE id=b->>'id' AND consumed_at>statement_timestamp()-interval '1 minute' AND NOT issued RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid state' USING ERRCODE='28000'; END IF;
  SELECT * INTO a FROM bandarlog_api.platform_admins WHERE enabled AND google_subject=b->>'subject';
  IF NOT FOUND THEN
   SELECT * INTO a FROM bandarlog_api.platform_admins WHERE enabled AND email=b->>'email' AND google_subject IS NULL FOR UPDATE;
   IF a.id IS NOT NULL THEN UPDATE bandarlog_api.platform_admins SET google_subject=b->>'subject' WHERE id=a.id; END IF;
  END IF;
  IF a.id IS NULL THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  RETURN bandarlog_api.platform_admin_issue(a.id,b->>'session',b->>'csrf','google',o.previous_session);
 ELSE RAISE EXCEPTION 'unknown authentication operation' USING ERRCODE='22023'; END IF;
END $$;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_actor(p_token text,p_csrf text DEFAULT NULL,p_recent boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s bandarlog_api.platform_sessions; a bandarlog_api.platform_admins;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'platform session required' USING ERRCODE='28000'; END IF;
 SELECT * INTO s FROM bandarlog_api.platform_sessions WHERE id=encode(sha256(convert_to(p_token,'UTF8')),'hex') AND expires>statement_timestamp() AND absolute_expires>statement_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'platform session expired' USING ERRCODE='28000'; END IF;
 SELECT * INTO a FROM bandarlog_api.platform_admins WHERE id=s.admin_id AND enabled;
 IF NOT FOUND THEN RAISE EXCEPTION 'platform access revoked' USING ERRCODE='42501'; END IF;
 IF p_csrf IS NOT NULL AND p_csrf IS DISTINCT FROM s.csrf THEN RAISE EXCEPTION 'invalid csrf' USING ERRCODE='42501'; END IF;
 IF p_recent AND p_csrf IS NULL THEN RAISE EXCEPTION 'csrf required' USING ERRCODE='42501'; END IF;
 IF p_recent AND s.created_at<statement_timestamp()-interval '15 minutes' THEN RAISE EXCEPTION 'recent platform verification required' USING ERRCODE='28001'; END IF;
 IF s.expires<statement_timestamp()+interval '20 minutes' THEN UPDATE bandarlog_api.platform_sessions SET expires=least(statement_timestamp()+interval '30 minutes',absolute_expires) WHERE id=s.id; END IF;
 RETURN jsonb_build_object('id',a.id,'name',a.name,'email',a.email,'csrf',s.csrf,'session',s.id);
END $$;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_me(p_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; BEGIN a:=bandarlog_api.platform_admin_actor(p_token); RETURN a-'session'-'id'; END $$;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_close(p_token text,p_csrf text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; BEGIN IF p_csrf IS NULL THEN RAISE EXCEPTION 'csrf required' USING ERRCODE='42501'; END IF; a:=bandarlog_api.platform_admin_actor(p_token,p_csrf); DELETE FROM bandarlog_api.platform_sessions WHERE id=a->>'session'; INSERT INTO bandarlog_api.platform_audit(admin_id,action) VALUES(a->>'id','session.closed'); RETURN true; END $$;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_request(p_token text,p_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM bandarlog_api.platform_admin_actor(p_token); RETURN (SELECT jsonb_build_object('id',id,'groupName',group_name,'name',name,'email',email,'createdAt',created_at,'expires',expires,'approvedAt',approved_at,'rejectedAt',rejected_at,'consumedAt',consumed_at,'decisionReason',(SELECT reason FROM bandarlog_api.platform_decisions WHERE request_id=p_id)) FROM public.group_registrations WHERE id=p_id); END $$;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_review(p_token text,p_csrf text,p_body text,p_deadline bigint,p_proof text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; b jsonb; r public.group_registrations; d bandarlog_api.platform_decisions;
BEGIN
 a:=bandarlog_api.platform_admin_actor(p_token,p_csrf,true);
 b:=bandarlog_api.platform_admin_proof('review',p_body,p_deadline,p_proof);
 IF b->>'session' IS DISTINCT FROM a->>'session' OR b->>'decision' NOT IN ('approve','reject') OR length(trim(b->>'reason')) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid review' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.group_registrations WHERE id=b->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'missing request' USING ERRCODE='P0002'; END IF;
 SELECT * INTO d FROM bandarlog_api.platform_decisions WHERE request_id=r.id;
 IF FOUND THEN
  IF d.decision=b->>'decision' AND d.reason=b->>'reason' THEN RETURN jsonb_build_object('ok',true,'replayed',true); END IF;
  RAISE EXCEPTION 'conflicting decision' USING ERRCODE='23505';
 END IF;
 IF NOT bandarlog_api.review_group(r.id,b->>'decision',b->>'activation',(b->>'mail')::jsonb) THEN RAISE EXCEPTION 'request already reviewed or expired' USING ERRCODE='23505'; END IF;
 INSERT INTO bandarlog_api.platform_decisions(request_id,decision,reason,admin_id) VALUES(r.id,b->>'decision',b->>'reason',a->>'id');
 INSERT INTO bandarlog_api.platform_audit(admin_id,action,target,reason) VALUES(a->>'id','request.'||(b->>'decision'),r.group_name,b->>'reason');
 RETURN jsonb_build_object('ok',true,'replayed',false);
END $$;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_test_mail(p_token text,p_csrf text,p_body text,p_deadline bigint,p_proof text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb;b jsonb;
BEGIN
 a:=bandarlog_api.platform_admin_actor(p_token,p_csrf,true);b:=bandarlog_api.platform_admin_proof('test-mail',p_body,p_deadline,p_proof);
 IF b->>'session' IS DISTINCT FROM a->>'session' THEN RAISE EXCEPTION 'invalid session' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM bandarlog_api.platform_audit WHERE admin_id=a->>'id' AND action='mail.test' AND at>statement_timestamp()-interval '1 minute') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-test-mail:'||(a->>'id'),0));
 IF EXISTS(SELECT FROM bandarlog_api.platform_audit WHERE admin_id=a->>'id' AND action='mail.test' AND at>statement_timestamp()-interval '1 minute') THEN RETURN false; END IF;
 PERFORM bandarlog_api.queue_registration_mail((b->>'mail')::jsonb,a->>'email','platform-test-'||(a->>'id')||'-'||floor(extract(epoch FROM statement_timestamp())/60)::text);
 INSERT INTO bandarlog_api.platform_audit(admin_id,action) VALUES(a->>'id','mail.test'); RETURN true;
END $$;
--> statement-breakpoint

DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='bandarlog_api'::regnamespace AND proname LIKE 'platform_admin_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f); END LOOP;
END $$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION bandarlog_api.platform_admin_auth(text,text,bigint,text),bandarlog_api.platform_admin_me(text),bandarlog_api.platform_admin_close(text,text),bandarlog_api.platform_admin_request(text,text),bandarlog_api.platform_admin_review(text,text,text,bigint,text),bandarlog_api.platform_admin_test_mail(text,text,text,bigint,text) TO bandarlog_identity;
