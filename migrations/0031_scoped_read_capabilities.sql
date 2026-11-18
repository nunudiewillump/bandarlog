-- Allow locking visible accounts for membership mutations. Actual profile changes
-- still require the owner of that profile; administrative changes use dedicated functions.
ALTER POLICY user_update ON public.users USING(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_user(id)) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.guard_user_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF current_user='bandarlog_user_app' THEN
  IF OLD.id<>bandarlog_api.actor_id() THEN RAISE EXCEPTION 'denied profile change' USING ERRCODE='42501'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.disabled_at IS DISTINCT FROM OLD.disabled_at THEN RAISE EXCEPTION 'immutable user authority' USING ERRCODE='42501'; END IF;
 END IF;RETURN NEW;
END $$;
--> statement-breakpoint
GRANT INSERT ON public.artwork_entries TO bandarlog_user_app;
--> statement-breakpoint
CREATE POLICY actor_insert ON public.artwork_entries FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_manages() AND created_by=bandarlog_api.actor_id() AND icon_data LIKE 'data:image/webp;base64,%' AND mascot_data LIKE 'data:image/webp;base64,%' AND length(icon_data)<200000 AND length(mascot_data)<200000);
--> statement-breakpoint
-- Preserve the established project-wide aggregates without granting access to the
-- titles, descriptions, assignees or history of commissions the actor cannot read.
CREATE FUNCTION bandarlog_api.project_summary_rows(p_projects text[]) RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',c.id,'name',c.name,'projectId',c.project_id,
 'total',count(t.id)::integer,'open',count(t.id) FILTER(WHERE t.status<>'done')::integer,'done',count(t.id) FILTER(WHERE t.status='done')::integer,'blocked',count(t.id) FILTER(WHERE t.status='blocked')::integer,'overdue',count(t.id) FILTER(WHERE t.status<>'done' AND t.due<statement_timestamp())::integer,
 'nextDue',to_char(timezone('UTC',min(t.due) FILTER(WHERE t.status<>'done' AND t.due>=statement_timestamp())),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
 FROM public.commissions c LEFT JOIN public.tasks t ON (t.group_id,t.commission_id)=(c.group_id,c.id) AND t.deleted_at IS NULL
 WHERE c.group_id=bandarlog_api.current_group() AND c.project_id=ANY(p_projects) AND c.deleted_at IS NULL AND bandarlog_api.actor_project(c.project_id)
 GROUP BY c.group_id,c.id,c.project_id,c.name
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.project_summary_rows(text[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.project_summary_rows(text[]) TO bandarlog_user_app;
--> statement-breakpoint
REVOKE SELECT ON public.users FROM bandarlog_user_app;
--> statement-breakpoint
GRANT SELECT(group_id,id,name,email,role,avatar_url,disabled_at,onboarding_completed_at) ON public.users TO bandarlog_user_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.own_preferences() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT preferences FROM public.users WHERE group_id=bandarlog_api.current_group() AND id=bandarlog_api.actor_id() $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.own_preferences() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.own_preferences() TO bandarlog_user_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.queue_task_events(p_task text,p_event text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE recipient record; BEGIN
 IF p_event NOT IN ('creation','updates') OR NOT bandarlog_api.actor_task(p_task) THEN RAISE EXCEPTION 'denied task event' USING ERRCODE='42501'; END IF;
 FOR recipient IN SELECT user_id FROM public.assignments WHERE group_id=bandarlog_api.current_group() AND task_id=p_task LOOP PERFORM bandarlog_api.queue_task_event(p_task,recipient.user_id,p_event); END LOOP;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.queue_task_events(text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.queue_task_events(text,text) TO bandarlog_user_app;
