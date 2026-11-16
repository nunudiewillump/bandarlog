DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='bandarlog_identity_app') THEN CREATE ROLE bandarlog_identity_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='bandarlog_delivery_app') THEN CREATE ROLE bandarlog_delivery_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT; END IF;
END $$;
--> statement-breakpoint
REVOKE bandarlog_group_app FROM bandarlog_identity,bandarlog_delivery;
--> statement-breakpoint
GRANT bandarlog_identity_app TO bandarlog_identity;
--> statement-breakpoint
GRANT bandarlog_delivery_app TO bandarlog_delivery;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public,bandarlog_api TO bandarlog_identity_app,bandarlog_delivery_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.current_group(),bandarlog_api.signed_group() TO bandarlog_identity_app,bandarlog_delivery_app;
--> statement-breakpoint
GRANT SELECT ON public.invitations,public.tokens,public.auth_challenges,public.google_states,public.google_links,public.google_identities,public.google_handoffs TO bandarlog_identity_app;
--> statement-breakpoint
GRANT INSERT ON public.users,public.members,public.project_members,public.sessions,public.tokens,public.auth_challenges,public.google_states,public.google_links,public.google_identities,public.google_handoffs,public.notifications TO bandarlog_identity_app;
--> statement-breakpoint
GRANT DELETE ON public.tokens,public.google_states,public.google_links,public.google_handoffs TO bandarlog_identity_app;
--> statement-breakpoint
GRANT UPDATE ON public.auth_challenges TO bandarlog_identity_app;
--> statement-breakpoint
GRANT UPDATE(expires) ON public.google_links TO bandarlog_identity_app;
--> statement-breakpoint
GRANT UPDATE(status) ON public.invitations TO bandarlog_identity_app;
--> statement-breakpoint
GRANT SELECT ON public.projects,public.commissions,public.members,public.tasks,public.assignments,public.notifications,public.push_subscriptions,public.push_outbox,public.push_deliveries TO bandarlog_delivery_app;
--> statement-breakpoint
GRANT SELECT(group_id,id,name,email,role,preferences,disabled_at) ON public.users TO bandarlog_delivery_app;
--> statement-breakpoint
GRANT INSERT,UPDATE,DELETE ON public.notifications,public.push_outbox,public.push_deliveries TO bandarlog_delivery_app;
--> statement-breakpoint
GRANT DELETE ON public.push_subscriptions TO bandarlog_delivery_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.guard_identity_issuance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
 names:=CASE TG_TABLE_NAME
 WHEN 'notifications' THEN ARRAY['id','email','subject','body','html','status']
 WHEN 'tokens' THEN ARRAY['id','email','expires']
 WHEN 'sessions' THEN ARRAY['id','user_id','csrf','expires','absolute_expires_at']
 WHEN 'auth_challenges' THEN ARRAY['email','id','verifier','expires','requested_at','window_started_at','requests','google_link_id']
 WHEN 'google_states' THEN ARRAY['id','browser','nonce','verifier','expires','handoff_challenge']
 WHEN 'google_links' THEN ARRAY['id','subject','email','expires']
 WHEN 'google_identities' THEN ARRAY['subject','user_id']
 WHEN 'google_handoffs' THEN ARRAY['id','challenge','user_id','google_subject','google_email','expires'] END;
 payload:=TG_TABLE_NAME||E'\n'||NEW.group_id;
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
REVOKE ALL ON FUNCTION bandarlog_api.guard_identity_issuance() FROM PUBLIC;

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT ON public.tokens FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT OR UPDATE ON public.auth_challenges FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT ON public.google_states FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT ON public.google_links FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT ON public.google_identities FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT ON public.google_handoffs FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
CREATE POLICY identity_read ON public.users FOR SELECT TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group()));
--> statement-breakpoint
CREATE POLICY identity_insert ON public.users FOR INSERT TO bandarlog_identity_app WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()) AND role='member' AND disabled_at IS NULL);

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.members TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.project_members TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.sessions TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.tokens TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.auth_challenges TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.google_states TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.google_links TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.google_identities TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.google_handoffs TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.invitations TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_identity_app_scope ON public.notifications TO bandarlog_identity_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_delivery_app_scope ON public.users TO bandarlog_delivery_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_delivery_app_scope ON public.projects TO bandarlog_delivery_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_delivery_app_scope ON public.commissions TO bandarlog_delivery_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_delivery_app_scope ON public.members TO bandarlog_delivery_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_delivery_app_scope ON public.tasks TO bandarlog_delivery_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_delivery_app_scope ON public.assignments TO bandarlog_delivery_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_delivery_app_scope ON public.notifications TO bandarlog_delivery_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_delivery_app_scope ON public.push_subscriptions TO bandarlog_delivery_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_delivery_app_scope ON public.push_outbox TO bandarlog_delivery_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE POLICY bandarlog_delivery_app_scope ON public.push_deliveries TO bandarlog_delivery_app USING(group_id=(SELECT bandarlog_api.signed_group())) WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()));

--> statement-breakpoint
CREATE TRIGGER guard_identity_issuance BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_issuance();

--> statement-breakpoint
GRANT SELECT(group_id,id,name,email,role,disabled_at) ON public.users TO bandarlog_identity_app;
