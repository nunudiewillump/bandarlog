-- HTTP never supplies arbitrary mail/push payloads. Snapshot the permitted event in PostgreSQL.
REVOKE INSERT ON public.notifications,public.push_outbox FROM bandarlog_user_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.queue_task_event(p_task text,p_user text,p_event text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t public.tasks; c public.commissions; p public.projects; u public.users; pref jsonb; label text; stamp text; snapshot jsonb; link text;
BEGIN
 IF p_event NOT IN ('creation','updates') OR NOT bandarlog_api.actor_task(p_task) THEN RAISE EXCEPTION 'denied task event' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.tasks WHERE id=p_task AND group_id=bandarlog_api.current_group();
 SELECT * INTO c FROM public.commissions WHERE id=t.commission_id AND group_id=t.group_id;
 SELECT * INTO p FROM public.projects WHERE id=c.project_id AND group_id=t.group_id;
 SELECT x.* INTO u FROM public.users x JOIN public.assignments a ON (a.group_id,a.user_id)=(x.group_id,x.id) JOIN public.members m ON (m.group_id,m.user_id,m.commission_id)=(x.group_id,x.id,c.id) WHERE a.task_id=t.id AND a.group_id=t.group_id AND x.id=p_user AND x.disabled_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid event recipient' USING ERRCODE='42501'; END IF;
 pref:=u.preferences::jsonb;
 IF coalesce((pref->>'notifications')::boolean,true)=false OR coalesce((pref->>p_event)::boolean,true)=false THEN RETURN; END IF;
 label:=CASE p_event WHEN 'creation' THEN 'Nueva asignación' ELSE 'Tarea actualizada' END;
 stamp:=encode(sha256(convert_to(t.group_id||E'\n'||t.id||E'\n'||t.updated_at::text||E'\n'||u.id||E'\n'||p_event,'UTF8')),'hex');
 snapshot:=jsonb_build_object('t',to_jsonb(t)||jsonb_build_object('blockedReason',t.blocked_reason),'c',jsonb_build_object('name',c.name),'p',jsonb_build_object('name',p.name),'user',jsonb_build_object('name',u.name),'rows',(SELECT jsonb_agg(jsonb_build_object('user',jsonb_build_object('name',x.name))) FROM public.users x JOIN public.assignments a ON (a.group_id,a.user_id)=(x.group_id,x.id) WHERE a.group_id=t.group_id AND a.task_id=t.id),'subject',label,'event',p_event);
 INSERT INTO public.notifications(group_id,id,dedupe,email,subject,body,html,status,created_at) VALUES(t.group_id,stamp,stamp,u.email,label||': '||t.title,'task-event-v1:'||snapshot::text,'','pending_v2',statement_timestamp()) ON CONFLICT(dedupe) DO NOTHING;
 SELECT '/g/'||private_id||'/?task='||t.id INTO link FROM public.scout_groups WHERE id=t.group_id;
 INSERT INTO public.push_outbox(group_id,id,user_id,payload) VALUES(t.group_id,stamp,u.id,jsonb_build_object('title',label,'body',t.title||' · '||c.name,'url',link,'tag','task-'||t.id)::text) ON CONFLICT DO NOTHING;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.queue_task_event(text,text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.queue_task_event(text,text,text) TO bandarlog_user_app;
--> statement-breakpoint
-- Credential issuance is guarded only for direct identity-app writes. Delegated owner
-- functions validate their own proofs and may atomically create the first administrator.
CREATE OR REPLACE FUNCTION bandarlog_api.identity_scope() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT session_user='bandarlog_identity' AND current_setting('role',true)='bandarlog_identity_app' $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.identity_scope() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.request_group_proof(p_hash text,p_input jsonb,p_mail jsonb,p_proof text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE key text; BEGIN
 SELECT secret INTO key FROM bandarlog_api.context_key WHERE id;
 IF key IS NULL OR p_proof IS DISTINCT FROM bandarlog_api.context_hmac('registration'||E'\n'||p_hash,key) THEN RAISE EXCEPTION 'invalid registration issuance' USING ERRCODE='42501'; END IF;
 PERFORM bandarlog_api.request_group(p_hash,p_input,p_mail);
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.registration_proof(p_token text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT bandarlog_api.registration(encode(sha256(convert_to(p_token,'UTF8')),'hex')) $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.review_group_proof(p_token text,p_decision text,p_activation text,p_mail jsonb) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT bandarlog_api.review_group(encode(sha256(convert_to(p_token,'UTF8')),'hex'),p_decision,p_activation,p_mail) $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.activate_group_proof(p_token text,p_session text,p_csrf text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT bandarlog_api.activate_group(encode(sha256(convert_to(p_token,'UTF8')),'hex'),p_session,p_csrf) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.request_group_proof(text,jsonb,jsonb,text),bandarlog_api.registration_proof(text),bandarlog_api.review_group_proof(text,text,text,jsonb),bandarlog_api.activate_group_proof(text,text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.request_group_proof(text,jsonb,jsonb,text),bandarlog_api.registration_proof(text),bandarlog_api.review_group_proof(text,text,text,jsonb),bandarlog_api.activate_group_proof(text,text,text) TO bandarlog_identity;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION bandarlog_api.request_group(text,jsonb,jsonb),bandarlog_api.registration(text),bandarlog_api.review_group(text,text,text,jsonb),bandarlog_api.activate_group(text,text,text) FROM bandarlog_identity;
--> statement-breakpoint
-- No caller-supplied identities can create users or membership beyond a live invitation.
ALTER POLICY identity_insert ON public.users WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()) AND role='member' AND disabled_at IS NULL AND EXISTS(SELECT FROM public.invitations i WHERE i.group_id=users.group_id AND i.email=users.email AND i.status='pending' AND i.expires>statement_timestamp()));
--> statement-breakpoint
ALTER POLICY bandarlog_identity_app_scope ON public.members WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()) AND EXISTS(SELECT FROM public.invitations i JOIN public.users u ON (u.group_id,u.email)=(i.group_id,i.email) WHERE i.group_id=members.group_id AND u.id=members.user_id AND i.commission_id=members.commission_id AND i.role=members.role AND i.status='pending' AND i.expires>statement_timestamp()));
--> statement-breakpoint
ALTER POLICY bandarlog_identity_app_scope ON public.project_members WITH CHECK(group_id=(SELECT bandarlog_api.signed_group()) AND EXISTS(SELECT FROM public.invitations i JOIN public.users u ON (u.group_id,u.email)=(i.group_id,i.email) WHERE i.group_id=project_members.group_id AND u.id=project_members.user_id AND i.project_id=project_members.project_id AND i.status='pending' AND i.expires>statement_timestamp()));
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.guard_identity_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF current_user='bandarlog_identity_app' AND (OLD.status<>'pending' OR NEW.status<>'accepted' OR OLD.expires<=statement_timestamp()) THEN RAISE EXCEPTION 'invalid invitation acceptance' USING ERRCODE='42501'; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.guard_identity_invitation() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER guard_identity_invitation BEFORE UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_identity_invitation();
