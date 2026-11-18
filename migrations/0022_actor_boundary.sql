-- Additive roles: existing runtime remains available solely for the coordinated transition.
-- No production LOGIN/password changes. The cutover script retires the old runtime separately.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='bandarlog_http') THEN
  CREATE ROLE bandarlog_http NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='bandarlog_user_app') THEN
  CREATE ROLE bandarlog_user_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
 END IF;
END $$;
--> statement-breakpoint
GRANT bandarlog_user_app TO bandarlog_http;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public,bandarlog_api TO bandarlog_http,bandarlog_user_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.actor() RETURNS jsonb
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
REVOKE ALL ON FUNCTION bandarlog_api.actor() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.actor() TO bandarlog_http,bandarlog_user_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.actor_id() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT bandarlog_api.actor()->>'id' $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.actor_manages(p_admin boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT (bandarlog_api.actor()->>'role')=ANY(CASE WHEN p_admin THEN ARRAY['admin'] ELSE ARRAY['admin','coordination'] END) $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.actor_commission(p_id text,p_manage boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM public.commissions c WHERE c.id=p_id AND c.group_id=(bandarlog_api.actor()->>'group') AND c.deleted_at IS NULL AND
 (bandarlog_api.actor_manages() OR EXISTS(SELECT FROM public.members m WHERE m.group_id=c.group_id AND m.commission_id=c.id AND m.user_id=bandarlog_api.actor_id() AND (NOT p_manage OR m.role='responsible'))))
$$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.actor_task(p_id text,p_manage boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT FROM public.tasks t JOIN public.commissions c ON (c.group_id,c.id)=(t.group_id,t.commission_id) JOIN public.projects p ON (p.group_id,p.id)=(c.group_id,c.project_id)
 WHERE t.id=p_id AND t.group_id=(bandarlog_api.actor()->>'group') AND t.deleted_at IS NULL AND c.deleted_at IS NULL AND p.archived<>'true'
 AND bandarlog_api.actor_commission(c.id,false) AND (bandarlog_api.actor_commission(c.id,true) OR (NOT p_manage AND EXISTS(SELECT FROM public.assignments a WHERE a.group_id=t.group_id AND a.task_id=t.id AND a.user_id=bandarlog_api.actor_id()))))
$$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.actor_project(p_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT bandarlog_api.actor_manages() OR EXISTS(SELECT FROM public.project_members m WHERE m.group_id=(bandarlog_api.actor()->>'group') AND m.project_id=p_id AND m.user_id=bandarlog_api.actor_id()) OR EXISTS(SELECT FROM public.commissions c JOIN public.members m ON (m.group_id,m.commission_id)=(c.group_id,c.id) WHERE c.group_id=(bandarlog_api.actor()->>'group') AND c.project_id=p_id AND c.deleted_at IS NULL AND m.user_id=bandarlog_api.actor_id())
$$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.actor_user(p_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_id=bandarlog_api.actor_id() OR bandarlog_api.actor_manages() OR EXISTS(SELECT FROM public.members WHERE group_id=(bandarlog_api.actor()->>'group') AND user_id=bandarlog_api.actor_id() AND role='responsible') OR EXISTS(SELECT FROM public.members m JOIN public.members a ON (a.group_id,a.commission_id)=(m.group_id,m.commission_id) WHERE m.group_id=(bandarlog_api.actor()->>'group') AND m.user_id=p_id AND a.user_id=bandarlog_api.actor_id()) OR EXISTS(SELECT FROM public.project_members m JOIN public.project_members a ON (a.group_id,a.project_id)=(m.group_id,m.project_id) WHERE m.group_id=(bandarlog_api.actor()->>'group') AND m.user_id=p_id AND a.user_id=bandarlog_api.actor_id())
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.actor_id(),bandarlog_api.actor_manages(boolean),bandarlog_api.actor_commission(text,boolean),bandarlog_api.actor_task(text,boolean),bandarlog_api.actor_project(text),bandarlog_api.actor_user(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.actor_id(),bandarlog_api.actor_manages(boolean),bandarlog_api.actor_commission(text,boolean),bandarlog_api.actor_task(text,boolean),bandarlog_api.actor_project(text),bandarlog_api.actor_user(text) TO bandarlog_user_app;
--> statement-breakpoint
-- Existing identity/maintenance flows keep signed group contexts during the transition.
ALTER FUNCTION bandarlog_api.current_group() RENAME TO signed_group;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.current_group() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF session_user='bandarlog_http' THEN RETURN bandarlog_api.actor()->>'group'; END IF;
 RETURN bandarlog_api.signed_group();
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.current_group() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.current_group() TO bandarlog_http,bandarlog_user_app,bandarlog_runtime,bandarlog_group_app;
--> statement-breakpoint
-- Existing policies still reference the renamed function by OID. New policies call current_group.
GRANT SELECT ON public.users,public.projects,public.commissions,public.members,public.tasks,public.assignments,public.activity,public.project_members,public.artwork_entries,public.invitations,public.sessions,public.push_subscriptions,public.mutation_receipts,public.tutorial_progress TO bandarlog_user_app;
--> statement-breakpoint
GRANT INSERT,UPDATE,DELETE ON public.projects,public.commissions,public.members,public.tasks,public.assignments,public.project_members,public.invitations,public.push_subscriptions,public.mutation_receipts,public.tutorial_progress TO bandarlog_user_app;
--> statement-breakpoint
GRANT INSERT ON public.activity TO bandarlog_user_app;
--> statement-breakpoint
GRANT UPDATE(name,preferences,avatar_url,onboarding_completed_at,role,disabled_at) ON public.users TO bandarlog_user_app;
--> statement-breakpoint
GRANT UPDATE(expires,renewed_at),DELETE ON public.sessions TO bandarlog_user_app;
--> statement-breakpoint
CREATE POLICY user_read ON public.users FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_user(id));
--> statement-breakpoint
CREATE POLICY user_update ON public.users FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (id=(SELECT bandarlog_api.actor_id()) OR bandarlog_api.actor_manages(true))) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()));
--> statement-breakpoint
CREATE POLICY session_read ON public.sessions FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND id=(SELECT bandarlog_api.actor()->>'session'));
--> statement-breakpoint
CREATE POLICY session_update ON public.sessions FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND id=(SELECT bandarlog_api.actor()->>'session')) WITH CHECK(id=(SELECT bandarlog_api.actor()->>'session'));
--> statement-breakpoint
CREATE POLICY session_delete ON public.sessions FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND id=(SELECT bandarlog_api.actor()->>'session'));
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.guard_user_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF current_user='bandarlog_user_app' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email OR NEW.group_id IS DISTINCT FROM OLD.group_id THEN RAISE EXCEPTION 'immutable user identity' USING ERRCODE='42501'; END IF;
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.disabled_at IS DISTINCT FROM OLD.disabled_at) AND (NOT bandarlog_api.actor_manages(true) OR OLD.id=bandarlog_api.actor_id()) THEN RAISE EXCEPTION 'denied privilege change' USING ERRCODE='42501'; END IF;
 END IF; RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.guard_user_change() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER guard_user_change BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_user_change();
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.guard_session_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF current_user='bandarlog_user_app' AND (NEW.expires>least(NEW.absolute_expires_at,statement_timestamp()+interval '30 days') OR NEW.renewed_at>statement_timestamp()+interval '5 seconds' OR NEW.expires<OLD.expires) THEN RAISE EXCEPTION 'invalid session renewal' USING ERRCODE='42501'; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.guard_session_change() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER guard_session_change BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_session_change();

--> statement-breakpoint
CREATE POLICY actor_select ON public.projects FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_project(id)));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.projects FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages()));

--> statement-breakpoint
CREATE POLICY actor_update ON public.projects FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages()));

--> statement-breakpoint
CREATE POLICY actor_delete ON public.projects FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages()));

--> statement-breakpoint
CREATE POLICY actor_select ON public.commissions FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(id)));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.commissions FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages()));

--> statement-breakpoint
CREATE POLICY actor_update ON public.commissions FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(id,true))) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(id,true)));

--> statement-breakpoint
CREATE POLICY actor_delete ON public.commissions FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(id,true)));

--> statement-breakpoint
CREATE POLICY actor_select ON public.members FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(commission_id)));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.members FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(commission_id,true)));

--> statement-breakpoint
CREATE POLICY actor_update ON public.members FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(commission_id,true))) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(commission_id,true)));

--> statement-breakpoint
CREATE POLICY actor_delete ON public.members FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(commission_id,true)));

--> statement-breakpoint
CREATE POLICY actor_select ON public.project_members FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_project(project_id)));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.project_members FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages()));

--> statement-breakpoint
CREATE POLICY actor_update ON public.project_members FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages()));

--> statement-breakpoint
CREATE POLICY actor_delete ON public.project_members FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages()));

--> statement-breakpoint
CREATE POLICY actor_select ON public.tasks FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(commission_id)));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.tasks FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_commission(commission_id,true)));

--> statement-breakpoint
CREATE POLICY actor_update ON public.tasks FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_task(id))) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_task(id)));

--> statement-breakpoint
CREATE POLICY actor_delete ON public.tasks FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_task(id)));

--> statement-breakpoint
CREATE POLICY actor_select ON public.assignments FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (EXISTS(SELECT FROM public.tasks t WHERE t.id=task_id AND t.group_id=assignments.group_id)));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.assignments FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_task(task_id,true)));

--> statement-breakpoint
CREATE POLICY actor_update ON public.assignments FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_task(task_id,true))) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_task(task_id,true)));

--> statement-breakpoint
CREATE POLICY actor_delete ON public.assignments FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_task(task_id,true)));

--> statement-breakpoint
CREATE POLICY actor_select ON public.activity FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (EXISTS(SELECT FROM public.tasks t WHERE t.id=task_id AND t.group_id=activity.group_id)));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.activity FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id() AND EXISTS(SELECT FROM public.tasks t WHERE t.id=task_id AND t.group_id=activity.group_id)));

--> statement-breakpoint
CREATE POLICY actor_select ON public.invitations FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages() OR bandarlog_api.actor_commission(commission_id,true)));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.invitations FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages() OR (project_id IS NULL AND bandarlog_api.actor_commission(commission_id,true))));

--> statement-breakpoint
CREATE POLICY actor_update ON public.invitations FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages() OR (project_id IS NULL AND bandarlog_api.actor_commission(commission_id,true)))) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages() OR (project_id IS NULL AND bandarlog_api.actor_commission(commission_id,true))));

--> statement-breakpoint
CREATE POLICY actor_delete ON public.invitations FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (bandarlog_api.actor_manages() OR (project_id IS NULL AND bandarlog_api.actor_commission(commission_id,true))));

--> statement-breakpoint
CREATE POLICY actor_select ON public.artwork_entries FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (true));

--> statement-breakpoint
CREATE POLICY actor_select ON public.push_subscriptions FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.push_subscriptions FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
CREATE POLICY actor_update ON public.push_subscriptions FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
CREATE POLICY actor_delete ON public.push_subscriptions FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
CREATE POLICY actor_select ON public.mutation_receipts FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.mutation_receipts FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
CREATE POLICY actor_update ON public.mutation_receipts FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
CREATE POLICY actor_delete ON public.mutation_receipts FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
CREATE POLICY actor_select ON public.tutorial_progress FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id() OR bandarlog_api.actor_manages(true)));

--> statement-breakpoint
CREATE POLICY actor_insert ON public.tutorial_progress FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
CREATE POLICY actor_update ON public.tutorial_progress FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
CREATE POLICY actor_delete ON public.tutorial_progress FOR DELETE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (user_id=bandarlog_api.actor_id()));

--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.resolve_group(text),bandarlog_api.entry_group(text,text,boolean) TO bandarlog_http;
--> statement-breakpoint
REVOKE UPDATE ON public.projects,public.commissions,public.members,public.tasks,public.assignments,public.project_members,public.invitations,public.push_subscriptions,public.mutation_receipts,public.tutorial_progress FROM bandarlog_user_app;
--> statement-breakpoint
GRANT UPDATE(name,type,starts,ends,archived,artwork_theme) ON public.projects TO bandarlog_user_app;
--> statement-breakpoint
GRANT UPDATE(name,description,icon,icon_url,mascot_url,artwork_status,artwork_key,deleted_at,deleted_by) ON public.commissions TO bandarlog_user_app;
--> statement-breakpoint
GRANT UPDATE(role) ON public.members TO bandarlog_user_app;
--> statement-breakpoint
GRANT UPDATE(title,description,checklist,due,status,blocked_reason,completed_by,completed_at,deleted_at,deleted_by,updated_at) ON public.tasks TO bandarlog_user_app;
--> statement-breakpoint
GRANT UPDATE(status,expires) ON public.invitations TO bandarlog_user_app;
--> statement-breakpoint
GRANT UPDATE(subscription) ON public.push_subscriptions TO bandarlog_user_app;
--> statement-breakpoint
GRANT UPDATE(response) ON public.mutation_receipts TO bandarlog_user_app;
--> statement-breakpoint
GRANT UPDATE(events,task_status,previous_status,steps,version,last_activity_at) ON public.tutorial_progress TO bandarlog_user_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.guard_task_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF current_user='bandarlog_user_app' THEN
  IF NOT bandarlog_api.actor_task(OLD.id,true) THEN
   IF (to_jsonb(NEW)-ARRAY['status','blocked_reason','completed_by','completed_at','checklist','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','blocked_reason','completed_by','completed_at','checklist','updated_at']) THEN RAISE EXCEPTION 'denied task management' USING ERRCODE='42501'; END IF;
   IF (SELECT coalesce(jsonb_agg(item-'done' ORDER BY ord),'[]') FROM jsonb_array_elements(NEW.checklist) WITH ORDINALITY AS a(item,ord)) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(item-'done' ORDER BY ord),'[]') FROM jsonb_array_elements(OLD.checklist) WITH ORDINALITY AS a(item,ord)) THEN RAISE EXCEPTION 'denied checklist management' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.status NOT IN ('pending','in_progress','blocked','done') OR (NEW.status='blocked' AND coalesce(length(trim(NEW.blocked_reason)),0)=0) THEN RAISE EXCEPTION 'invalid task state' USING ERRCODE='23514'; END IF;
  IF NEW.completed_by IS NOT NULL AND NEW.completed_by IS DISTINCT FROM OLD.completed_by AND NEW.completed_by<>bandarlog_api.actor_id() THEN RAISE EXCEPTION 'invalid completion actor' USING ERRCODE='42501'; END IF;
 END IF; RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.guard_task_change() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER guard_task_change BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_task_change();
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.guard_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF session_user='bandarlog_http' AND NOT EXISTS(SELECT FROM public.tasks t JOIN public.members m ON (m.group_id,m.commission_id)=(t.group_id,t.commission_id) JOIN public.users u ON (u.group_id,u.id)=(m.group_id,m.user_id) WHERE t.id=NEW.task_id AND t.group_id=NEW.group_id AND m.user_id=NEW.user_id AND u.disabled_at IS NULL) THEN RAISE EXCEPTION 'invalid assignee' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.guard_assignment() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER guard_assignment BEFORE INSERT OR UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_assignment();
