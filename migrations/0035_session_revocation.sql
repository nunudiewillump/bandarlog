CREATE FUNCTION bandarlog_api.revoke_other_sessions() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb:=bandarlog_api.actor(); removed integer;
BEGIN
 PERFORM bandarlog_api.recent_actor();
 DELETE FROM public.sessions WHERE group_id=a->>'group' AND user_id=a->>'id' AND id<>a->>'session';
 GET DIAGNOSTICS removed=ROW_COUNT;
 INSERT INTO bandarlog_api.security_audit(group_id,actor_id,action,target_id) VALUES(a->>'group',a->>'id','session.others.revoked',a->>'id');
 RETURN removed;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.admin_revoke_sessions(p_user text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb;g text;removed integer;
BEGIN
 g:=bandarlog_api.actor()->>'group';
 PERFORM pg_advisory_xact_lock(hashtextextended('user-administration:'||g,0));
 a:=bandarlog_api.actor();
 IF a->>'role'<>'admin' THEN RAISE EXCEPTION 'denied administration' USING ERRCODE='42501'; END IF;
 PERFORM bandarlog_api.recent_actor();
 IF p_user IS NOT NULL AND NOT EXISTS(SELECT FROM public.users WHERE group_id=g AND id=p_user) THEN RAISE EXCEPTION 'invalid target' USING ERRCODE='42501'; END IF;
 DELETE FROM public.sessions WHERE group_id=g AND (p_user IS NULL OR user_id=p_user);
 GET DIAGNOSTICS removed=ROW_COUNT;
 INSERT INTO bandarlog_api.security_audit(group_id,actor_id,action,target_id) VALUES(g,a->>'id','session.admin.revoked',coalesce(p_user,'*'));
 RETURN removed;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.revoke_other_sessions(),bandarlog_api.admin_revoke_sessions(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.revoke_other_sessions(),bandarlog_api.admin_revoke_sessions(text) TO bandarlog_user_app;
