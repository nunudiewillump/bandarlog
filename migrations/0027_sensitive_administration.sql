CREATE TABLE bandarlog_api.security_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,occurred_at timestamptz NOT NULL DEFAULT statement_timestamp(),group_id text NOT NULL,actor_id text NOT NULL,action text NOT NULL,target_id text NOT NULL);
--> statement-breakpoint
REVOKE ALL ON bandarlog_api.security_audit FROM PUBLIC,bandarlog_http,bandarlog_user_app,bandarlog_identity,bandarlog_identity_app,bandarlog_delivery,bandarlog_delivery_app,bandarlog_runtime,bandarlog_group_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.recent_actor() RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT EXISTS(SELECT FROM public.sessions WHERE id=bandarlog_api.actor()->>'session' AND created_at>statement_timestamp()-interval '15 minutes') THEN RAISE EXCEPTION 'recent authentication required' USING ERRCODE='28000'; END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.recent_actor() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.change_user(p_target text,p_role text,p_disable boolean) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE actor jsonb; g text; BEGIN
 g:=bandarlog_api.actor()->>'group';
 -- Serialize administrative changes before re-checking the current actor.
 PERFORM pg_advisory_xact_lock(hashtextextended('user-administration:'||g,0));
 actor:=bandarlog_api.actor();
 IF actor->>'role'<>'admin' OR actor->>'id'=p_target OR (NOT p_disable AND p_role NOT IN ('admin','coordination','member')) THEN RAISE EXCEPTION 'denied administration' USING ERRCODE='42501'; END IF;
 PERFORM bandarlog_api.recent_actor();
 IF p_disable THEN UPDATE public.users SET disabled_at=statement_timestamp() WHERE group_id=g AND id=p_target AND disabled_at IS NULL;
 ELSE UPDATE public.users SET role=p_role WHERE group_id=g AND id=p_target AND disabled_at IS NULL; END IF;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO bandarlog_api.security_audit(group_id,actor_id,action,target_id) VALUES(g,actor->>'id',CASE WHEN p_disable THEN 'user.disabled' ELSE 'user.role.'||p_role END,p_target);
 RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.change_user(text,text,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.change_user(text,text,boolean) TO bandarlog_user_app;
--> statement-breakpoint
REVOKE UPDATE(role,disabled_at) ON public.users FROM bandarlog_user_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.revoke_disabled_credentials() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL THEN
 DELETE FROM public.sessions WHERE group_id=NEW.group_id AND user_id=NEW.id;
 DELETE FROM public.tokens WHERE group_id=NEW.group_id AND email=NEW.email;
 DELETE FROM public.auth_challenges WHERE group_id=NEW.group_id AND email=NEW.email;
 DELETE FROM public.google_handoffs WHERE group_id=NEW.group_id AND (user_id=NEW.id OR google_email=NEW.email);
 DELETE FROM public.google_links WHERE group_id=NEW.group_id AND email=NEW.email;
 DELETE FROM public.push_subscriptions WHERE group_id=NEW.group_id AND user_id=NEW.id;
 UPDATE public.push_outbox SET sent_at=statement_timestamp() WHERE group_id=NEW.group_id AND user_id=NEW.id AND sent_at IS NULL;
 UPDATE public.notifications SET status='cancelled',lease_id=NULL,lease_until=NULL WHERE group_id=NEW.group_id AND email=NEW.email AND status IN ('pending','pending_v2','sending');
 END IF;RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.revoke_disabled_credentials() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER revoke_disabled_credentials AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION bandarlog_api.revoke_disabled_credentials();
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.list_sessions() RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',s.id,'createdAt',s.created_at,'renewedAt',s.renewed_at,'expires',s.expires,'current',s.id=(bandarlog_api.actor()->>'session')) FROM public.sessions s WHERE s.group_id=(bandarlog_api.actor()->>'group') AND s.user_id=bandarlog_api.actor_id() AND s.expires>statement_timestamp() AND s.absolute_expires_at>statement_timestamp() ORDER BY s.created_at DESC
$$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.revoke_session(p_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a jsonb:=bandarlog_api.actor(); BEGIN
 PERFORM bandarlog_api.recent_actor();
 DELETE FROM public.sessions WHERE id=p_id AND user_id=a->>'id' AND group_id=a->>'group';
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO bandarlog_api.security_audit(group_id,actor_id,action,target_id) VALUES(a->>'group',a->>'id','session.revoked',a->>'id');RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.rotate_session(p_raw text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DELETE FROM public.sessions WHERE id=encode(sha256(convert_to(p_raw,'UTF8')),'hex') AND group_id=bandarlog_api.signed_group()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.list_sessions(),bandarlog_api.revoke_session(text),bandarlog_api.rotate_session(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.list_sessions(),bandarlog_api.revoke_session(text) TO bandarlog_user_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.rotate_session(text) TO bandarlog_identity_app;
